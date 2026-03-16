import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../../../lib/apiResponse'
import { normalizeDeliveryOrderStatus } from '@/lib/deliveryOrders'
import { normalizeBillingStatus } from '@/lib/billing/types'

type RouteParams = { params: Promise<{ id: string }> }

const FULFILLMENT_ACTIONS = [
    'mark_partially_collected',
    'mark_collected_and_close',
] as const

type FulfillmentAction = (typeof FULFILLMENT_ACTIONS)[number]
type FulfillmentEventAction = FulfillmentAction | 'request_offboarding' | 'force_offboarding'
const LOCKED_FULFILLMENT_FIELDS = new Set([
    'service_state',
    'collection_status',
])

type DeliveryOrderRecord = {
    id: string
    subscription_id: string
    do_status: string
    failure_reason: string | null
    rescheduled_at: string | null
    cancelled_reason: string | null
    created_at: string
    updated_at: string
}

type SubscriptionRecord = {
    id: string
    user_id: string
    status: string | null
    monthly_total: number | string | null
    start_date: string | null
    end_date: string | null
    delivery_company_name: string | null
    delivery_address: string | null
    delivery_city: string | null
    delivery_zip_postal: string | null
    delivery_contact_name: string | null
    delivery_contact_phone: string | null
    profiles: {
        full_name: string | null
    } | {
        full_name: string | null
    }[] | null
}

type SubscriptionFulfillmentRecord = {
    subscription_id: string
    service_state: string
    collection_status: string
    first_delivery_at: string | null
}

type SubscriptionItemRecord = {
    product_name: string | null
    category: string | null
    quantity: number | string | null
}

type FulfillmentEventRecord = {
    id: string
    action: FulfillmentEventAction
    from_service_state: string | null
    to_service_state: string | null
    from_collection_status: string | null
    to_collection_status: string | null
    note: string | null
    actor_label: string
    created_at: string
}

function parseFulfillmentAction(value: unknown): FulfillmentAction | null {
    if (typeof value !== 'string') return null
    return FULFILLMENT_ACTIONS.includes(value as FulfillmentAction)
        ? (value as FulfillmentAction)
        : null
}

function normalizeFieldKey(key: string) {
    return key
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase()
}

function hasLockedFulfillmentFieldEdits(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
    return Object.keys(payload).some((key) => LOCKED_FULFILLMENT_FIELDS.has(normalizeFieldKey(key)))
}

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

function parseMoney(value: number | string | null | undefined) {
    if (value == null) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function parseQuantity(value: number | string | null | undefined) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) return 0
    return parsed
}

function hasText(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function normalizeIsoDate(value: unknown) {
    if (!hasText(value)) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString()
}

function formatAddress(line1: string | null, city: string | null, zipPostal: string | null) {
    const parts = [line1?.trim(), [city?.trim(), zipPostal?.trim()].filter(Boolean).join(' ').trim()]
        .filter((value) => value && value.length > 0) as string[]
    return parts.length > 0 ? parts.join(', ') : null
}

async function resolveCustomerName(userId: string, profileName: string | null) {
    const normalizedProfileName = profileName?.trim()
    if (normalizedProfileName) return normalizedProfileName

    try {
        const { data, error } = await supabaseServer.auth.admin.getUserById(userId)
        if (!error && data.user) {
            const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>
            const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : ''
            if (fullName) return fullName
            const name = typeof metadata.name === 'string' ? metadata.name.trim() : ''
            if (name) return name
            if (data.user.email) return data.user.email
        }
    } catch {
        // Ignore lookup failures and fall back to deterministic label.
    }

    return `User ${userId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

async function fetchDeliveryOrderDetails(deliveryOrderId: string) {
    const { data: orderData, error: orderError } = await supabaseServer
        .from('delivery_orders')
        .select('id, subscription_id, do_status, failure_reason, rescheduled_at, cancelled_reason, created_at, updated_at')
        .eq('id', deliveryOrderId)
        .maybeSingle()

    if (orderError) {
        throw new Error(`Failed to load delivery order: ${orderError.message}`)
    }
    if (!orderData) return null

    const order = orderData as DeliveryOrderRecord

    const { data: subscriptionData, error: subscriptionError } = await supabaseServer
        .from('subscriptions')
        .select(`
            id,
            user_id,
            status,
            monthly_total,
            start_date,
            end_date,
            delivery_company_name,
            delivery_address,
            delivery_city,
            delivery_zip_postal,
            delivery_contact_name,
            delivery_contact_phone,
            profiles (
                full_name
            )
        `)
        .eq('id', order.subscription_id)
        .maybeSingle()

    if (subscriptionError) {
        throw new Error(`Failed to load linked subscription: ${subscriptionError.message}`)
    }
    if (!subscriptionData) {
        return {
            id: order.id,
            subscription_id: order.subscription_id,
            do_status: order.do_status,
            failure_reason: order.failure_reason,
            rescheduled_at: order.rescheduled_at,
            cancelled_reason: order.cancelled_reason,
            created_at: order.created_at,
            updated_at: order.updated_at,
            subscription: null,
            fulfillment_events: [],
        }
    }

    const subscription = subscriptionData as SubscriptionRecord
    const profile = unwrapSingle(subscription.profiles)
    const customerName = await resolveCustomerName(subscription.user_id, profile?.full_name ?? null)

    const [fulfillmentResult, itemsResult, fulfillmentEventsResult] = await Promise.all([
        supabaseServer
            .from('subscription_fulfillment')
            .select('subscription_id, service_state, collection_status, first_delivery_at')
            .eq('subscription_id', order.subscription_id)
            .maybeSingle(),
        supabaseServer
            .from('subscription_items')
            .select('product_name, category, quantity')
            .eq('subscription_id', order.subscription_id)
            .order('created_at', { ascending: true }),
        supabaseServer
            .from('subscription_fulfillment_events')
            .select('id, action, from_service_state, to_service_state, from_collection_status, to_collection_status, note, actor_label, created_at')
            .eq('subscription_id', order.subscription_id)
            .order('created_at', { ascending: false }),
    ])

    if (fulfillmentResult.error) {
        throw new Error(`Failed to load subscription fulfillment: ${fulfillmentResult.error.message}`)
    }
    if (itemsResult.error) {
        throw new Error(`Failed to load subscription items: ${itemsResult.error.message}`)
    }
    if (fulfillmentEventsResult.error) {
        throw new Error(`Failed to load fulfillment events: ${fulfillmentEventsResult.error.message}`)
    }

    const fulfillment = (fulfillmentResult.data as SubscriptionFulfillmentRecord | null) ?? null
    const itemRows = (itemsResult.data ?? []) as SubscriptionItemRecord[]
    const fulfillmentEvents = (fulfillmentEventsResult.data ?? []) as FulfillmentEventRecord[]
    const items = itemRows.map((row) => ({
        name: row.product_name?.trim() || row.category?.trim() || 'Item',
        category: row.category?.trim() || null,
        quantity: parseQuantity(row.quantity) || 1,
    }))
    const itemsSummary = items.length > 0
        ? items.map((item) => `${item.name} x ${item.quantity}`).join(', ')
        : 'No items captured'
    const normalizedSubscriptionStatus = normalizeBillingStatus(subscription.status)

    return {
        id: order.id,
        subscription_id: order.subscription_id,
        do_status: order.do_status,
        failure_reason: order.failure_reason,
        rescheduled_at: order.rescheduled_at,
        cancelled_reason: order.cancelled_reason,
        created_at: order.created_at,
        updated_at: order.updated_at,
        subscription: {
            id: subscription.id,
            user_id: subscription.user_id,
            customer_name: customerName,
            billing_status: normalizedSubscriptionStatus,
            status: normalizedSubscriptionStatus,
            monthly_total: parseMoney(subscription.monthly_total),
            start_date: subscription.start_date,
            end_date: subscription.end_date,
            service_state: fulfillment?.service_state ?? null,
            collection_status: fulfillment?.collection_status ?? null,
            first_delivery_at: fulfillment?.first_delivery_at ?? null,
            delivery: {
                company_name: subscription.delivery_company_name,
                contact_name: subscription.delivery_contact_name,
                contact_phone: subscription.delivery_contact_phone,
                address: formatAddress(subscription.delivery_address, subscription.delivery_city, subscription.delivery_zip_postal),
            },
            items_summary: itemsSummary,
            items,
        },
        fulfillment_events: fulfillmentEvents.map((event) => ({
            id: event.id,
            action: event.action,
            from_service_state: event.from_service_state,
            to_service_state: event.to_service_state,
            from_collection_status: event.from_collection_status,
            to_collection_status: event.to_collection_status,
            note: event.note,
            actor_label: event.actor_label,
            created_at: event.created_at,
        })),
    }
}

function getAllowedNextStatuses(current: string) {
    const normalized = current.toLowerCase()
    if (normalized === 'confirmed') return new Set(['dispatched', 'cancelled'])
    if (normalized === 'dispatched') return new Set(['delivered', 'partially_delivered', 'failed'])
    if (normalized === 'partially_delivered') return new Set(['delivered', 'failed'])
    if (normalized === 'failed') return new Set(['rescheduled', 'cancelled'])
    if (normalized === 'rescheduled') return new Set(['dispatched', 'cancelled'])
    return new Set<string>()
}

async function loadDispatchContext(subscriptionId: string) {
    const [subscriptionResult, fulfillmentResult] = await Promise.all([
        supabaseServer
            .from('subscriptions')
            .select('id, status')
            .eq('id', subscriptionId)
            .maybeSingle(),
        supabaseServer
            .from('subscription_fulfillment')
            .select('subscription_id, service_state, collection_status, first_delivery_at')
            .eq('subscription_id', subscriptionId)
            .maybeSingle(),
    ])

    return {
        billingStatus: normalizeBillingStatus((subscriptionResult.data as { status: string | null } | null)?.status ?? null),
        fulfillment: (fulfillmentResult.data as SubscriptionFulfillmentRecord | null) ?? null,
    }
}

async function applyDeliveredSideEffects(subscriptionId: string, currentFulfillment: SubscriptionFulfillmentRecord | null) {
    const nowIso = new Date().toISOString()
    if (!currentFulfillment) {
        const { error } = await supabaseServer
            .from('subscription_fulfillment')
            .insert({
                subscription_id: subscriptionId,
                service_state: 'in_service',
                collection_status: 'not_collected',
                first_delivery_at: nowIso,
            })
        if (error && error.code !== '23505') {
            throw new Error(`Failed to initialize subscription fulfillment: ${error.message}`)
        }
        if (!error) return
    }

    const nextServiceState = currentFulfillment?.service_state === 'offboarding_requested' || currentFulfillment?.service_state === 'closed'
        ? currentFulfillment.service_state
        : 'in_service'

    const { error } = await supabaseServer
        .from('subscription_fulfillment')
        .update({
            service_state: nextServiceState,
            first_delivery_at: currentFulfillment?.first_delivery_at ?? nowIso,
        })
        .eq('subscription_id', subscriptionId)

    if (error) {
        throw new Error(`Failed to update subscription fulfillment after delivery: ${error.message}`)
    }
}

async function logDeliveryOrderEvent(
    deliveryOrderId: string,
    fromStatus: string | null,
    toStatus: string,
    fields: { failure_reason?: string | null; rescheduled_at?: string | null; cancelled_reason?: string | null },
) {
    try {
        await supabaseServer
            .from('delivery_order_events')
            .insert({
                delivery_order_id: deliveryOrderId,
                from_status: fromStatus,
                to_status: toStatus,
                failure_reason: fields.failure_reason ?? null,
                rescheduled_at: fields.rescheduled_at ?? null,
                cancelled_reason: fields.cancelled_reason ?? null,
            })
    } catch {
        // Audit logging must not block the transition itself.
    }
}

/** GET /api/admin/delivery-orders/:id — Get one delivery order for admin */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid delivery order ID format', 400)

        const details = await fetchDeliveryOrderDetails(uuid)
        if (!details) return errorResponse('Delivery order not found', 404)
        return successResponse(details)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error'
        return errorResponse(message, 500)
    }
}

/** PATCH /api/admin/delivery-orders/:id — Transition a delivery order */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid delivery order ID format', 400)

        const body = await request.json().catch(() => ({}))
        if (hasLockedFulfillmentFieldEdits(body)) {
            return errorResponse('Fulfillment fields are managed by admin actions and cannot be edited directly.', 400)
        }

        const nextStatus = normalizeDeliveryOrderStatus(body?.do_status ?? body?.status)
        if (!nextStatus) {
            return errorResponse('Invalid do_status. Must be: confirmed, dispatched, delivered, partially_delivered, failed, rescheduled, cancelled', 400)
        }

        const { data: currentOrderData, error: currentOrderError } = await supabaseServer
            .from('delivery_orders')
            .select('id, subscription_id, do_status, failure_reason, rescheduled_at, cancelled_reason, created_at, updated_at')
            .eq('id', uuid)
            .maybeSingle()

        if (currentOrderError) return errorResponse(currentOrderError.message, 500)
        if (!currentOrderData) return errorResponse('Delivery order not found', 404)

        const currentOrder = currentOrderData as DeliveryOrderRecord
        const currentStatus = currentOrder.do_status.toLowerCase()
        if (currentStatus === nextStatus) {
            const details = await fetchDeliveryOrderDetails(uuid)
            return successResponse(details)
        }

        const allowedNextStatuses = getAllowedNextStatuses(currentStatus)
        if (!allowedNextStatuses.has(nextStatus)) {
            return errorResponse(`Invalid transition: ${currentStatus} -> ${nextStatus}`, 409)
        }

        const failureReason = hasText(body?.failure_reason) ? body.failure_reason.trim() : null
        const cancelledReason = hasText(body?.cancelled_reason) ? body.cancelled_reason.trim() : null
        const rescheduledAt = normalizeIsoDate(body?.rescheduled_at)

        if (nextStatus === 'failed' && !failureReason) {
            return errorResponse('failure_reason is required when do_status is failed', 400)
        }
        if (nextStatus === 'cancelled' && !cancelledReason) {
            return errorResponse('cancelled_reason is required when do_status is cancelled', 400)
        }
        if (nextStatus === 'rescheduled' && !rescheduledAt) {
            return errorResponse('rescheduled_at must be a valid datetime when do_status is rescheduled', 400)
        }

        const dispatchContext = await loadDispatchContext(currentOrder.subscription_id)
        if (nextStatus === 'dispatched') {
            if (dispatchContext.billingStatus !== 'active') {
                return errorResponse('Dispatch blocked: billing status must be active', 409)
            }
            if (dispatchContext.fulfillment?.service_state === 'offboarding_requested' || dispatchContext.fulfillment?.service_state === 'closed') {
                return errorResponse(`Dispatch blocked: service state ${dispatchContext.fulfillment.service_state} does not allow dispatch`, 409)
            }
        }

        const { data: updatedRow, error: updateError } = await supabaseServer
            .from('delivery_orders')
            .update({
                do_status: nextStatus,
                failure_reason: nextStatus === 'failed' ? failureReason : null,
                rescheduled_at: nextStatus === 'rescheduled' ? rescheduledAt : null,
                cancelled_reason: nextStatus === 'cancelled' ? cancelledReason : null,
            })
            .eq('id', uuid)
            .eq('do_status', currentStatus)
            .select('id')
            .maybeSingle()

        if (updateError) return errorResponse(updateError.message, 500)

        let wonTransition = true
        if (!updatedRow) {
            // Another request may have already applied this transition — check if the row
            // now holds the target status (idempotent) or a different one (real conflict).
            const { data: recheckData } = await supabaseServer
                .from('delivery_orders')
                .select('do_status')
                .eq('id', uuid)
                .maybeSingle()
            const recheckStatus = (recheckData as { do_status: string } | null)?.do_status?.toLowerCase()
            if (recheckStatus !== nextStatus) {
                return errorResponse(`Invalid transition: ${currentStatus} -> ${nextStatus} (concurrent modification)`, 409)
            }
            wonTransition = false
        }

        // Audit trail: log every successful transition (only for the request that won the CAS).
        if (wonTransition) {
            await logDeliveryOrderEvent(uuid, currentStatus, nextStatus, {
                failure_reason: nextStatus === 'failed' ? failureReason : null,
                rescheduled_at: nextStatus === 'rescheduled' ? rescheduledAt : null,
                cancelled_reason: nextStatus === 'cancelled' ? cancelledReason : null,
            })
        }

        // Side effects run for the winning request. The race loser skips them because
        // the winner already applied them (applyDeliveredSideEffects is idempotent on
        // first_delivery_at, and service_state preserves terminal states).
        if (wonTransition && (nextStatus === 'delivered' || nextStatus === 'partially_delivered')) {
            await applyDeliveredSideEffects(currentOrder.subscription_id, dispatchContext.fulfillment)
        }

        const details = await fetchDeliveryOrderDetails(uuid)
        if (!details) return errorResponse('Delivery order updated but failed to load details', 500)
        return successResponse(details)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid request body'
        return errorResponse(message, 400)
    }
}

/** POST /api/admin/delivery-orders/:id — Apply fulfillment action */
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid delivery order ID format', 400)

        const body = await request.json().catch(() => ({}))
        const action = parseFulfillmentAction(body?.action)
        if (!action) {
            return errorResponse('Invalid action. Must be: mark_partially_collected, mark_collected_and_close', 400)
        }

        const note = hasText(body?.note) ? body.note.trim() : null
        if (action === 'mark_collected_and_close' && !note) {
            return errorResponse(`note is required for ${action}`, 400)
        }

        const { error: actionError } = await supabaseServer.rpc('admin_apply_fulfillment_action', {
            p_delivery_order_id: uuid,
            p_action: action,
            p_note: note,
        })

        if (actionError) {
            if (actionError.code === 'P0002') {
                return errorResponse('Delivery order not found', 404)
            }
            if (actionError.code === 'P0001') {
                return errorResponse(actionError.message, 409)
            }
            if (actionError.code === '22023') {
                return errorResponse(actionError.message, 400)
            }
            return errorResponse(actionError.message, 500)
        }

        const details = await fetchDeliveryOrderDetails(uuid)
        if (!details) return errorResponse('Delivery order not found', 404)

        return successResponse({
            action,
            delivery_order: details,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid request body'
        return errorResponse(message, 400)
    }
}
