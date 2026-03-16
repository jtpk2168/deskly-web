import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '../../../../../../lib/apiResponse'
import { rejectInProduction } from '../../../../../../lib/devOnly'

const SUPPORTED_EVENTS = [
    'invoice.paid',
    'invoice.payment_failed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
] as const

type SupportedEvent = (typeof SUPPORTED_EVENTS)[number]

function isSupportedEvent(value: unknown): value is SupportedEvent {
    return typeof value === 'string' && (SUPPORTED_EVENTS as readonly string[]).includes(value)
}

/**
 * POST /api/admin/simulator/webhook
 *
 * Server-side proxy that constructs a properly signed Stripe webhook payload
 * and dispatches it to the real webhook endpoint. This avoids exposing the
 * webhook secret to the client while exercising the real processing pipeline.
 */
export async function POST(request: NextRequest) {
    const blocked = rejectInProduction()
    if (blocked) return blocked

    try {
        const body = await request.json()
        const eventType = body?.event_type
        const subscriptionId = body?.subscription_id
        const subscriptionStatus = body?.subscription_status

        if (!isSupportedEvent(eventType)) {
            return errorResponse(`Invalid event_type. Must be: ${SUPPORTED_EVENTS.join(', ')}`, 400)
        }
        if (typeof subscriptionId !== 'string' || !subscriptionId.trim()) {
            return errorResponse('subscription_id is required', 400)
        }

        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
        if (!webhookSecret) {
            return errorResponse('STRIPE_WEBHOOK_SECRET is not configured', 500)
        }

        const nowEpoch = Math.floor(Date.now() / 1000)
        const sequence = Math.random().toString(36).slice(2, 10)
        const eventId = `evt_sim_${sequence}_${nowEpoch}`
        const providerSubscriptionId = `sub_sim_${sequence}`
        const providerInvoiceId = `in_sim_${sequence}`

        const eventObject: Record<string, unknown> = {
            metadata: { internal_subscription_id: subscriptionId },
        }

        if (eventType.startsWith('invoice.')) {
            const paid = eventType === 'invoice.paid'
            eventObject.id = providerInvoiceId
            eventObject.subscription = providerSubscriptionId
            eventObject.customer = `cus_sim_${sequence}`
            eventObject.status = paid ? 'paid' : 'open'
            eventObject.paid = paid
            eventObject.currency = 'myr'
            eventObject.subtotal = 10000
            eventObject.total = 10800
            eventObject.amount_paid = paid ? 10800 : 0
            eventObject.amount_due = paid ? 0 : 10800
            eventObject.period_start = nowEpoch
            eventObject.period_end = nowEpoch + 60 * 60 * 24 * 30
            eventObject.status_transitions = { paid_at: paid ? nowEpoch : null }
        } else {
            eventObject.id = providerSubscriptionId
            eventObject.customer = `cus_sim_${sequence}`
            eventObject.status = subscriptionStatus ?? (eventType === 'customer.subscription.deleted' ? 'canceled' : 'active')
            eventObject.cancel_at_period_end = false
            eventObject.current_period_end = nowEpoch + 60 * 60 * 24 * 30
            eventObject.canceled_at = eventType === 'customer.subscription.deleted' ? nowEpoch : null
        }

        const payload = JSON.stringify({
            id: eventId,
            type: eventType,
            created: nowEpoch,
            data: { object: eventObject },
        })

        const signedPayload = `${nowEpoch}.${payload}`
        const digest = createHmac('sha256', webhookSecret).update(signedPayload, 'utf8').digest('hex')
        const signature = `t=${nowEpoch},v1=${digest}`

        const apiBaseUrl = process.env.API_BASE_URL?.trim() || `http://127.0.0.1:${process.env.PORT || 3000}`
        const response = await fetch(`${apiBaseUrl}/api/webhooks/stripe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'stripe-signature': signature,
            },
            body: payload,
        })

        const responseBody = await response.json().catch(() => null)

        return successResponse({
            event_id: eventId,
            event_type: eventType,
            webhook_status: response.status,
            webhook_response: responseBody,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Simulator webhook failed'
        return errorResponse(message, 500)
    }
}
