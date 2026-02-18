import { NextRequest } from 'next/server'
import { mapStripeSubscriptionStatus, StripeWebhookEvent, verifyStripeWebhookSignature } from '@/lib/billing/stripeWebhook'
import { errorResponse, successResponse } from '../../../../../lib/apiResponse'
import { supabaseServer } from '../../../../../lib/supabaseServer'

export const runtime = 'nodejs'

type BillingWebhookEventRecord = {
    id: string
    status: 'received' | 'processed' | 'failed'
}

type SubscriptionReferenceRecord = {
    id: string
    billing_customer_id: string | null
    end_date: string | null
    commitment_end_at: string | null
}

type BillingCustomerReferenceRecord = {
    id: string
}

function readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null
}

function readNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readBoolean(value: unknown) {
    return typeof value === 'boolean' ? value : null
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value != null ? (value as Record<string, unknown>) : null
}

function parseIsoFromUnixTimestamp(value: number | null) {
    if (value == null) return null
    const parsed = new Date(value * 1000)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function fromMinorUnit(value: number | null) {
    if (value == null) return null
    return Number((value / 100).toFixed(2))
}

function normalizeMirroredInvoiceStatus(eventType: string, rawInvoiceStatus: string | null, paidFlag: boolean | null) {
    if (eventType === 'invoice.payment_failed') return 'payment_failed'
    if (eventType === 'invoice.voided') return 'void'
    if (eventType === 'invoice.marked_uncollectible') return 'uncollectible'
    if (eventType === 'invoice.paid' || eventType === 'invoice.payment_succeeded') return 'paid'
    if (paidFlag === true) return 'paid'

    switch (rawInvoiceStatus) {
        case 'draft':
            return 'draft'
        case 'open':
            return 'open'
        case 'paid':
            return 'paid'
        case 'void':
            return 'void'
        case 'uncollectible':
            return 'uncollectible'
        default:
            return 'unknown'
    }
}

async function findSubscriptionIdByReference({
    internalSubscriptionId,
    providerSubscriptionId,
    providerCheckoutSessionId,
    providerInvoiceId,
}: {
    internalSubscriptionId?: string | null
    providerSubscriptionId?: string | null
    providerCheckoutSessionId?: string | null
    providerInvoiceId?: string | null
}) {
    if (internalSubscriptionId) {
        const { data } = await supabaseServer
            .from('subscriptions')
            .select('id')
            .eq('id', internalSubscriptionId)
            .maybeSingle()
        if (data?.id) return data.id as string
    }

    if (providerSubscriptionId) {
        const { data } = await supabaseServer
            .from('subscriptions')
            .select('id')
            .eq('billing_provider', 'stripe')
            .eq('provider_subscription_id', providerSubscriptionId)
            .maybeSingle()
        if (data?.id) return data.id as string
    }

    if (providerCheckoutSessionId) {
        const { data } = await supabaseServer
            .from('subscriptions')
            .select('id')
            .eq('billing_provider', 'stripe')
            .eq('provider_checkout_session_id', providerCheckoutSessionId)
            .maybeSingle()
        if (data?.id) return data.id as string
    }

    if (providerInvoiceId) {
        const { data } = await supabaseServer
            .from('billing_invoices')
            .select('subscription_id')
            .eq('provider', 'stripe')
            .eq('provider_invoice_id', providerInvoiceId)
            .maybeSingle()
        const subscriptionId = readString(data?.subscription_id)
        if (subscriptionId) return subscriptionId
    }

    return null
}

async function loadSubscriptionReference(subscriptionId: string | null) {
    if (!subscriptionId) return null
    const { data, error } = await supabaseServer
        .from('subscriptions')
        .select('id, billing_customer_id, end_date, commitment_end_at')
        .eq('id', subscriptionId)
        .maybeSingle()

    if (error) {
        throw new Error(`Failed to load subscription reference: ${error.message}`)
    }

    return (data as SubscriptionReferenceRecord | null) ?? null
}

async function resolveBillingCustomerReferenceId(
    subscriptionRef: SubscriptionReferenceRecord | null,
    providerCustomerId: string | null,
) {
    if (subscriptionRef?.billing_customer_id) return subscriptionRef.billing_customer_id
    if (!providerCustomerId) return null

    const { data, error } = await supabaseServer
        .from('billing_customers')
        .select('id')
        .eq('provider', 'stripe')
        .eq('provider_customer_id', providerCustomerId)
        .maybeSingle()

    if (error) {
        throw new Error(`Failed to resolve billing customer reference: ${error.message}`)
    }

    return ((data as BillingCustomerReferenceRecord | null)?.id) ?? null
}

function resolveInvoicePeriodTimestamps(eventObject: Record<string, unknown>) {
    const directPeriodStart = readNumber(eventObject.period_start)
    const directPeriodEnd = readNumber(eventObject.period_end)

    if (directPeriodStart != null || directPeriodEnd != null) {
        return {
            periodStartAt: parseIsoFromUnixTimestamp(directPeriodStart),
            periodEndAt: parseIsoFromUnixTimestamp(directPeriodEnd),
        }
    }

    const lines = readRecord(eventObject.lines)
    const linesData = Array.isArray(lines?.data) ? lines.data : []
    const firstLine = readRecord(linesData[0])
    const linePeriod = readRecord(firstLine?.period)

    return {
        periodStartAt: parseIsoFromUnixTimestamp(readNumber(linePeriod?.start)),
        periodEndAt: parseIsoFromUnixTimestamp(readNumber(linePeriod?.end)),
    }
}

async function mirrorStripeInvoice({
    eventType,
    eventObject,
    resolvedSubscriptionId,
    providerSubscriptionId,
}: {
    eventType: string
    eventObject: Record<string, unknown>
    resolvedSubscriptionId: string | null
    providerSubscriptionId: string | null
}) {
    const providerInvoiceId = readString(eventObject.id)
    if (!providerInvoiceId) return false

    const providerCustomerId = readString(eventObject.customer)
    const paidFlag = readBoolean(eventObject.paid)
    const invoiceStatus = readString(eventObject.status)
    const mirroredStatus = normalizeMirroredInvoiceStatus(eventType, invoiceStatus, paidFlag)

    const subtotalMinor = readNumber(eventObject.subtotal)
    const totalMinor = readNumber(eventObject.total)
    const explicitTaxMinor = readNumber(eventObject.tax)
    const computedTaxMinor =
        explicitTaxMinor != null
            ? explicitTaxMinor
            : subtotalMinor != null && totalMinor != null
                ? totalMinor - subtotalMinor
                : null

    const statusTransitions = readRecord(eventObject.status_transitions)
    const { periodStartAt, periodEndAt } = resolveInvoicePeriodTimestamps(eventObject)
    const subscriptionRef = await loadSubscriptionReference(resolvedSubscriptionId)
    const billingCustomerId = await resolveBillingCustomerReferenceId(subscriptionRef, providerCustomerId)

    const { error } = await supabaseServer
        .from('billing_invoices')
        .upsert({
            provider: 'stripe',
            provider_invoice_id: providerInvoiceId,
            provider_subscription_id: providerSubscriptionId,
            billing_customer_id: billingCustomerId,
            subscription_id: subscriptionRef?.id ?? null,
            invoice_number: readString(eventObject.number),
            status: mirroredStatus,
            currency: readString(eventObject.currency)?.toLowerCase() ?? 'myr',
            subtotal_amount: fromMinorUnit(subtotalMinor),
            tax_amount: fromMinorUnit(computedTaxMinor),
            total_amount: fromMinorUnit(totalMinor),
            amount_paid: fromMinorUnit(readNumber(eventObject.amount_paid)),
            amount_due: fromMinorUnit(readNumber(eventObject.amount_due)),
            hosted_invoice_url: readString(eventObject.hosted_invoice_url),
            invoice_pdf: readString(eventObject.invoice_pdf),
            payment_intent_id: readString(eventObject.payment_intent),
            due_date: parseIsoFromUnixTimestamp(readNumber(eventObject.due_date)),
            paid_at: parseIsoFromUnixTimestamp(readNumber(statusTransitions?.paid_at)),
            period_start_at: periodStartAt,
            period_end_at: periodEndAt,
            raw_payload: eventObject,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'provider,provider_invoice_id',
        })

    if (error) {
        throw new Error(`Failed to mirror invoice data: ${error.message}`)
    }

    return true
}

async function processStripeEvent(event: StripeWebhookEvent) {
    const eventObject = readRecord(event.data?.object) ?? {}
    const metadata = typeof eventObject.metadata === 'object' && eventObject.metadata != null
        ? eventObject.metadata as Record<string, unknown>
        : {}

    const internalSubscriptionId = readString(metadata.internal_subscription_id)
    const providerSubscriptionIdFromObject = readString(eventObject.id)
    const providerSubscriptionId =
        event.type.startsWith('customer.subscription')
            ? providerSubscriptionIdFromObject
            : readString(eventObject.subscription)
    const providerCheckoutSessionId = event.type.startsWith('checkout.session')
        ? readString(eventObject.id)
        : null
    const providerInvoiceId = event.type.startsWith('invoice.')
        ? readString(eventObject.id)
        : null

    const resolvedSubscriptionId = await findSubscriptionIdByReference({
        internalSubscriptionId,
        providerSubscriptionId,
        providerCheckoutSessionId,
        providerInvoiceId,
    })

    const mirroredInvoice = event.type.startsWith('invoice.')
        ? await mirrorStripeInvoice({
            eventType: event.type,
            eventObject,
            resolvedSubscriptionId,
            providerSubscriptionId,
        })
        : false

    if (!resolvedSubscriptionId) {
        return {
            subscriptionId: null as string | null,
            handled: mirroredInvoice,
        }
    }

    if (event.type === 'checkout.session.completed') {
        const paymentStatus = readString(eventObject.payment_status)
        const subscriptionIdFromSession = readString(eventObject.subscription)
        const status = paymentStatus === 'paid' ? 'active' : 'pending_payment'

        const { error } = await supabaseServer
            .from('subscriptions')
            .update({
                status,
                provider_checkout_session_id: providerCheckoutSessionId,
                provider_subscription_id: subscriptionIdFromSession,
            })
            .eq('id', resolvedSubscriptionId)

        if (error) {
            throw new Error(`Failed to update checkout session status: ${error.message}`)
        }

        return { subscriptionId: resolvedSubscriptionId, handled: true }
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const stripeStatus = readString(eventObject.status)
        const billingStatus = event.type === 'customer.subscription.deleted'
            ? 'cancelled'
            : mapStripeSubscriptionStatus(stripeStatus)
        const periodEndIso = parseIsoFromUnixTimestamp(readNumber(eventObject.current_period_end))
        const existingSubscription = await loadSubscriptionReference(resolvedSubscriptionId)

        // Keep commitment/order end date stable; Stripe current_period_end is the billing-cycle boundary.
        const persistedEndDate = readString(existingSubscription?.end_date)
        const commitmentEndDate = readString(existingSubscription?.commitment_end_at)
        const effectiveEndDate = persistedEndDate ?? commitmentEndDate ?? periodEndIso

        const { error } = await supabaseServer
            .from('subscriptions')
            .update({
                status: billingStatus,
                provider_subscription_id: providerSubscriptionId,
                end_date: effectiveEndDate,
            })
            .eq('id', resolvedSubscriptionId)

        if (error) {
            throw new Error(`Failed to update subscription lifecycle: ${error.message}`)
        }

        return { subscriptionId: resolvedSubscriptionId, handled: true }
    }

    if (event.type === 'invoice.payment_failed') {
        const { error } = await supabaseServer
            .from('subscriptions')
            .update({ status: 'payment_failed' })
            .eq('id', resolvedSubscriptionId)

        if (error) {
            throw new Error(`Failed to mark payment failed: ${error.message}`)
        }

        return { subscriptionId: resolvedSubscriptionId, handled: true }
    }

    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
        const { error } = await supabaseServer
            .from('subscriptions')
            .update({ status: 'active' })
            .eq('id', resolvedSubscriptionId)

        if (error) {
            throw new Error(`Failed to mark invoice paid: ${error.message}`)
        }

        return { subscriptionId: resolvedSubscriptionId, handled: true }
    }

    return {
        subscriptionId: resolvedSubscriptionId,
        handled: mirroredInvoice,
    }
}

/** POST /api/webhooks/stripe — Verify signature and process Stripe events idempotently */
export async function POST(request: NextRequest) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
    if (!webhookSecret) {
        return errorResponse('STRIPE_WEBHOOK_SECRET is not configured', 500)
    }

    const payload = await request.text()
    const signatureHeader = request.headers.get('stripe-signature')
    const verified = verifyStripeWebhookSignature(payload, signatureHeader, webhookSecret)

    if (!verified) {
        return errorResponse('Invalid Stripe webhook signature', 400)
    }

    let event: StripeWebhookEvent
    try {
        event = JSON.parse(payload) as StripeWebhookEvent
    } catch {
        return errorResponse('Invalid webhook payload', 400)
    }

    if (!event.id || !event.type) {
        return errorResponse('Missing event id or type', 400)
    }

    const { data: existingEvent, error: existingEventError } = await supabaseServer
        .from('billing_webhook_events')
        .select('id, status')
        .eq('provider', 'stripe')
        .eq('event_id', event.id)
        .maybeSingle()

    if (existingEventError) {
        return errorResponse(`Failed to check webhook idempotency: ${existingEventError.message}`, 500)
    }

    if ((existingEvent as BillingWebhookEventRecord | null)?.status === 'processed') {
        return successResponse({ received: true, duplicate: true })
    }

    const webhookEventId = (existingEvent as BillingWebhookEventRecord | null)?.id ?? null

    if (!webhookEventId) {
        const { error: insertEventError } = await supabaseServer
            .from('billing_webhook_events')
            .insert({
                provider: 'stripe',
                event_id: event.id,
                event_type: event.type,
                payload: event,
                status: 'received',
            })

        if (insertEventError && insertEventError.code !== '23505') {
            return errorResponse(`Failed to persist webhook event: ${insertEventError.message}`, 500)
        }
    }

    try {
        const processed = await processStripeEvent(event)

        await supabaseServer
            .from('billing_webhook_events')
            .update({
                status: 'processed',
                subscription_id: processed.subscriptionId,
                processed_at: new Date().toISOString(),
                error_message: null,
            })
            .eq('provider', 'stripe')
            .eq('event_id', event.id)

        return successResponse({
            received: true,
            processed: processed.handled,
            subscription_id: processed.subscriptionId,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Webhook processing failed'

        await supabaseServer
            .from('billing_webhook_events')
            .update({
                status: 'failed',
                error_message: message,
            })
            .eq('provider', 'stripe')
            .eq('event_id', event.id)

        return errorResponse(message, 500)
    }
}
