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
    last_provider_event_at: string | null
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

function readStringArray(value: unknown) {
    if (!Array.isArray(value)) return [] as string[]
    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
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
        .select('id, billing_customer_id, end_date, commitment_end_at, last_provider_event_at')
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

    const lines = readRecord(eventObject.lines)
    const linesData = Array.isArray(lines?.data) ? lines.data : []
    let linePeriodStart: number | null = null
    let linePeriodEnd: number | null = null

    for (const line of linesData) {
        const lineRecord = readRecord(line)
        const linePeriod = readRecord(lineRecord?.period)
        const start = readNumber(linePeriod?.start)
        const end = readNumber(linePeriod?.end)

        if (start != null && (linePeriodStart == null || start < linePeriodStart)) {
            linePeriodStart = start
        }

        if (end != null && (linePeriodEnd == null || end > linePeriodEnd)) {
            linePeriodEnd = end
        }
    }

    const resolvedPeriodStart = linePeriodStart ?? directPeriodStart
    const resolvedPeriodEnd = linePeriodEnd ?? directPeriodEnd

    return {
        periodStartAt: parseIsoFromUnixTimestamp(resolvedPeriodStart),
        periodEndAt: parseIsoFromUnixTimestamp(resolvedPeriodEnd),
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

async function syncSubscriptionInventory(subscriptionId: string) {
    const { data, error } = await supabaseServer.rpc('sync_subscription_inventory', {
        p_subscription_id: subscriptionId,
    })

    if (error) {
        throw new Error(`Failed to sync subscription inventory: ${error.message}`)
    }

    const result = readRecord(data)
    const ok = readBoolean(result?.ok)

    if (ok === true) return

    const syncError = readString(result?.error) ?? 'inventory_sync_failed'
    if (syncError === 'insufficient_stock') {
        const productIds = readStringArray(result?.product_ids)
        const details = productIds.length > 0 ? ` (product_id: ${productIds.join(', ')})` : ''
        throw new Error(`Insufficient stock to fulfill this subscription${details}`)
    }

    if (syncError === 'subscription_not_found') {
        throw new Error(`Subscription not found while syncing inventory: ${subscriptionId}`)
    }

    throw new Error(`Subscription inventory sync failed: ${syncError}`)
}

/** Returns true if the incoming event is stale (older than the last processed event for this subscription). */
function isStaleEvent(eventCreatedEpoch: number | null, lastProviderEventAt: string | null) {
    if (!eventCreatedEpoch || !lastProviderEventAt) return false
    const eventDate = new Date(eventCreatedEpoch * 1000)
    const lastDate = new Date(lastProviderEventAt)
    if (Number.isNaN(eventDate.getTime()) || Number.isNaN(lastDate.getTime())) return false
    return eventDate.getTime() < lastDate.getTime()
}

async function updateSubscriptionStatusWithOrdering(
    subscriptionId: string,
    updatePayload: Record<string, unknown>,
    eventCreatedEpoch: number | null,
) {
    const eventIso = eventCreatedEpoch ? parseIsoFromUnixTimestamp(eventCreatedEpoch) : new Date().toISOString()
    const { error } = await supabaseServer
        .from('subscriptions')
        .update({
            ...updatePayload,
            last_provider_event_at: eventIso,
        })
        .eq('id', subscriptionId)
    return error
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

    const eventCreatedEpoch = readNumber(event.created) ?? readNumber((event as Record<string, unknown>).created)

    if (event.type === 'checkout.session.completed') {
        const paymentStatus = readString(eventObject.payment_status)
        const subscriptionIdFromSession = readString(eventObject.subscription)
        const status = paymentStatus === 'paid' ? 'active' : 'pending_payment'

        const error = await updateSubscriptionStatusWithOrdering(
            resolvedSubscriptionId,
            {
                status,
                provider_checkout_session_id: providerCheckoutSessionId,
                provider_subscription_id: subscriptionIdFromSession,
            },
            eventCreatedEpoch,
        )

        if (error) {
            throw new Error(`Failed to update checkout session status: ${error.message}`)
        }

        if (status === 'active') {
            try {
                await syncSubscriptionInventory(resolvedSubscriptionId)
            } catch (syncError) {
                // Rollback status so the subscription doesn't stay active without inventory.
                await supabaseServer
                    .from('subscriptions')
                    .update({ status: 'pending_payment' })
                    .eq('id', resolvedSubscriptionId)
                throw syncError
            }
        }

        return { subscriptionId: resolvedSubscriptionId, handled: true }
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const stripeStatus = readString(eventObject.status)
        const billingStatus = event.type === 'customer.subscription.deleted'
            ? 'cancelled'
            : mapStripeSubscriptionStatus(stripeStatus)
        const cancelAtPeriodEnd = readBoolean(eventObject.cancel_at_period_end) === true
        const periodEndIso = parseIsoFromUnixTimestamp(readNumber(eventObject.current_period_end))
        const canceledAtIso = parseIsoFromUnixTimestamp(readNumber(eventObject.canceled_at))
        const existingSubscription = await loadSubscriptionReference(resolvedSubscriptionId)

        // Guard: skip out-of-order events that would regress subscription status.
        if (isStaleEvent(eventCreatedEpoch, existingSubscription?.last_provider_event_at ?? null)) {
            return { subscriptionId: resolvedSubscriptionId, handled: true }
        }

        // Stripe timestamps differ for immediate cancel vs period-end cancel.
        // For cancel-at-period-end, service end should mirror current_period_end.
        const persistedEndDate = readString(existingSubscription?.end_date)
        const commitmentEndDate = readString(existingSubscription?.commitment_end_at)
        const effectiveEndDate = cancelAtPeriodEnd
            ? (periodEndIso ?? persistedEndDate ?? commitmentEndDate ?? canceledAtIso)
            : event.type === 'customer.subscription.deleted'
                ? (canceledAtIso ?? periodEndIso ?? persistedEndDate ?? commitmentEndDate)
                : (persistedEndDate ?? commitmentEndDate ?? periodEndIso)

        const error = await updateSubscriptionStatusWithOrdering(
            resolvedSubscriptionId,
            {
                status: billingStatus,
                provider_subscription_id: providerSubscriptionId,
                end_date: effectiveEndDate,
            },
            eventCreatedEpoch,
        )

        if (error) {
            throw new Error(`Failed to update subscription lifecycle: ${error.message}`)
        }

        if (billingStatus === 'active') {
            try {
                await syncSubscriptionInventory(resolvedSubscriptionId)
            } catch (syncError) {
                await supabaseServer
                    .from('subscriptions')
                    .update({ status: 'pending_payment' })
                    .eq('id', resolvedSubscriptionId)
                throw syncError
            }
        }

        return { subscriptionId: resolvedSubscriptionId, handled: true }
    }

    if (event.type === 'invoice.payment_failed') {
        const existingForInvoiceFailed = await loadSubscriptionReference(resolvedSubscriptionId)
        if (isStaleEvent(eventCreatedEpoch, existingForInvoiceFailed?.last_provider_event_at ?? null)) {
            return { subscriptionId: resolvedSubscriptionId, handled: true }
        }

        const error = await updateSubscriptionStatusWithOrdering(
            resolvedSubscriptionId,
            { status: 'payment_failed' },
            eventCreatedEpoch,
        )

        if (error) {
            throw new Error(`Failed to mark payment failed: ${error.message}`)
        }

        return { subscriptionId: resolvedSubscriptionId, handled: true }
    }

    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
        const existingForInvoicePaid = await loadSubscriptionReference(resolvedSubscriptionId)
        if (isStaleEvent(eventCreatedEpoch, existingForInvoicePaid?.last_provider_event_at ?? null)) {
            return { subscriptionId: resolvedSubscriptionId, handled: true }
        }

        const previousStatus = existingForInvoicePaid
            ? (await supabaseServer
                .from('subscriptions')
                .select('status')
                .eq('id', resolvedSubscriptionId)
                .maybeSingle()
            ).data?.status as string | null ?? null
            : null

        const error = await updateSubscriptionStatusWithOrdering(
            resolvedSubscriptionId,
            { status: 'active' },
            eventCreatedEpoch,
        )

        if (error) {
            throw new Error(`Failed to mark invoice paid: ${error.message}`)
        }

        try {
            await syncSubscriptionInventory(resolvedSubscriptionId)
        } catch (syncError) {
            // Rollback to previous status so the subscription doesn't stay active without inventory.
            const rollbackStatus = previousStatus ?? 'pending_payment'
            await supabaseServer
                .from('subscriptions')
                .update({ status: rollbackStatus })
                .eq('id', resolvedSubscriptionId)
            throw syncError
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
