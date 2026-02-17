import { NextRequest } from 'next/server'
import { mapStripeSubscriptionStatus, StripeWebhookEvent, verifyStripeWebhookSignature } from '@/lib/billing/stripeWebhook'
import { errorResponse, successResponse } from '../../../../../lib/apiResponse'
import { supabaseServer } from '../../../../../lib/supabaseServer'

export const runtime = 'nodejs'

type BillingWebhookEventRecord = {
    id: string
    status: 'received' | 'processed' | 'failed'
}

function readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null
}

function readNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

async function findSubscriptionIdByReference({
    internalSubscriptionId,
    providerSubscriptionId,
    providerCheckoutSessionId,
}: {
    internalSubscriptionId?: string | null
    providerSubscriptionId?: string | null
    providerCheckoutSessionId?: string | null
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

    return null
}

async function processStripeEvent(event: StripeWebhookEvent) {
    const eventObject = event.data?.object ?? {}
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

    const resolvedSubscriptionId = await findSubscriptionIdByReference({
        internalSubscriptionId,
        providerSubscriptionId,
        providerCheckoutSessionId,
    })

    if (!resolvedSubscriptionId) {
        return { subscriptionId: null as string | null, handled: false }
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
        const periodEndUnix = readNumber(eventObject.current_period_end)
        const periodEndIso = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null

        const { error } = await supabaseServer
            .from('subscriptions')
            .update({
                status: billingStatus,
                provider_subscription_id: providerSubscriptionId,
                end_date: periodEndIso,
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

    if (event.type === 'invoice.paid') {
        const { error } = await supabaseServer
            .from('subscriptions')
            .update({ status: 'active' })
            .eq('id', resolvedSubscriptionId)

        if (error) {
            throw new Error(`Failed to mark invoice paid: ${error.message}`)
        }

        return { subscriptionId: resolvedSubscriptionId, handled: true }
    }

    return { subscriptionId: resolvedSubscriptionId, handled: false }
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
