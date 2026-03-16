import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../../../lib/apiResponse'
import { rejectInProduction } from '../../../../../../lib/devOnly'

/**
 * GET /api/admin/simulator/state?subscription_id=...&delivery_order_id=...
 *
 * Returns a unified snapshot of subscription billing status, delivery order
 * status, fulfillment service/collection state, and recent event history.
 */
export async function GET(request: NextRequest) {
    const blocked = rejectInProduction()
    if (blocked) return blocked

    try {
        const url = new URL(request.url)
        const subscriptionId = parseUUID(url.searchParams.get('subscription_id') ?? '')
        const deliveryOrderId = parseUUID(url.searchParams.get('delivery_order_id') ?? '')

        if (!subscriptionId && !deliveryOrderId) {
            return errorResponse('At least one of subscription_id or delivery_order_id is required', 400)
        }

        let resolvedSubscriptionId = subscriptionId
        let resolvedDeliveryOrderId = deliveryOrderId

        // If only one ID is given, resolve the other
        if (deliveryOrderId && !resolvedSubscriptionId) {
            const { data } = await supabaseServer
                .from('delivery_orders')
                .select('subscription_id')
                .eq('id', deliveryOrderId)
                .maybeSingle()
            resolvedSubscriptionId = (data as { subscription_id: string } | null)?.subscription_id ?? null
        }

        if (resolvedSubscriptionId && !resolvedDeliveryOrderId) {
            const { data } = await supabaseServer
                .from('delivery_orders')
                .select('id')
                .eq('subscription_id', resolvedSubscriptionId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            resolvedDeliveryOrderId = (data as { id: string } | null)?.id ?? null
        }

        // Load subscription
        let subscription: {
            id: string
            status: string | null
            monthly_total: number | null
            start_date: string | null
            end_date: string | null
            last_provider_event_at: string | null
        } | null = null

        if (resolvedSubscriptionId) {
            const { data } = await supabaseServer
                .from('subscriptions')
                .select('id, status, monthly_total, start_date, end_date, last_provider_event_at')
                .eq('id', resolvedSubscriptionId)
                .maybeSingle()
            subscription = data as typeof subscription
        }

        // Load delivery order
        let deliveryOrder: {
            id: string
            do_status: string
            failure_reason: string | null
            rescheduled_at: string | null
            cancelled_reason: string | null
            created_at: string
            updated_at: string
        } | null = null

        if (resolvedDeliveryOrderId) {
            const { data } = await supabaseServer
                .from('delivery_orders')
                .select('id, do_status, failure_reason, rescheduled_at, cancelled_reason, created_at, updated_at')
                .eq('id', resolvedDeliveryOrderId)
                .maybeSingle()
            deliveryOrder = data as typeof deliveryOrder
        }

        // Load fulfillment
        let fulfillment: {
            service_state: string
            collection_status: string
            first_delivery_at: string | null
        } | null = null

        if (resolvedSubscriptionId) {
            const { data } = await supabaseServer
                .from('subscription_fulfillment')
                .select('service_state, collection_status, first_delivery_at')
                .eq('subscription_id', resolvedSubscriptionId)
                .maybeSingle()
            fulfillment = data as typeof fulfillment
        }

        // Load recent DO events
        let doEvents: Array<{
            from_status: string | null
            to_status: string
            failure_reason: string | null
            cancelled_reason: string | null
            created_at: string
        }> = []

        if (resolvedDeliveryOrderId) {
            const { data } = await supabaseServer
                .from('delivery_order_events')
                .select('from_status, to_status, failure_reason, cancelled_reason, created_at')
                .eq('delivery_order_id', resolvedDeliveryOrderId)
                .order('created_at', { ascending: false })
                .limit(10)
            doEvents = (data ?? []) as typeof doEvents
        }

        // Load recent fulfillment events
        let fulfillmentEvents: Array<{
            action: string
            from_service_state: string | null
            to_service_state: string | null
            from_collection_status: string | null
            to_collection_status: string | null
            note: string | null
            created_at: string
        }> = []

        if (resolvedSubscriptionId) {
            const { data } = await supabaseServer
                .from('subscription_fulfillment_events')
                .select('action, from_service_state, to_service_state, from_collection_status, to_collection_status, note, created_at')
                .eq('subscription_id', resolvedSubscriptionId)
                .order('created_at', { ascending: false })
                .limit(10)
            fulfillmentEvents = (data ?? []) as typeof fulfillmentEvents
        }

        return successResponse({
            subscription_id: resolvedSubscriptionId,
            delivery_order_id: resolvedDeliveryOrderId,
            billing: {
                status: subscription?.status ?? null,
                monthly_total: subscription?.monthly_total ?? null,
                start_date: subscription?.start_date ?? null,
                end_date: subscription?.end_date ?? null,
                last_provider_event_at: subscription?.last_provider_event_at ?? null,
            },
            delivery_order: {
                status: deliveryOrder?.do_status ?? null,
                failure_reason: deliveryOrder?.failure_reason ?? null,
                rescheduled_at: deliveryOrder?.rescheduled_at ?? null,
                cancelled_reason: deliveryOrder?.cancelled_reason ?? null,
            },
            fulfillment: {
                service_state: fulfillment?.service_state ?? null,
                collection_status: fulfillment?.collection_status ?? null,
                first_delivery_at: fulfillment?.first_delivery_at ?? null,
            },
            recent_do_events: doEvents,
            recent_fulfillment_events: fulfillmentEvents,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load simulator state'
        return errorResponse(message, 500)
    }
}
