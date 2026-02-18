import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../../../lib/apiResponse'
import { normalizeDeliveryOrderStatus } from '@/lib/deliveryOrders'

type RouteParams = { params: Promise<{ id: string }> }

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
        }
    }

    const subscription = subscriptionData as SubscriptionRecord
    const profile = unwrapSingle(subscription.profiles)
    const customerName = await resolveCustomerName(subscription.user_id, profile?.full_name ?? null)

    const [fulfillmentResult, itemsResult] = await Promise.all([
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
    ])

    const fulfillment = (fulfillmentResult.data as SubscriptionFulfillmentRecord | null) ?? null
    const itemRows = (itemsResult.data ?? []) as SubscriptionItemRecord[]
    const items = itemRows.map((row) => ({
        name: row.product_name?.trim() || row.category?.trim() || 'Item',
        category: row.category?.trim() || null,
        quantity: parseQuantity(row.quantity) || 1,
    }))
    const itemsSummary = items.length > 0
        ? items.map((item) => `${item.name} x ${item.quantity}`).join(', ')
        : 'No items captured'

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
            billing_status: subscription.status,
            status: subscription.status,
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
    }
}

function getAllowedNextStatuses(current: string) {
    const normalized = current.toLowerCase()
    if (normalized === 'confirmed') return new Set(['dispatched', 'cancelled'])
    if (normalized === 'dispatched') return new Set(['delivered', 'partially_delivered', 'failed'])
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
        billingStatus: (subscriptionResult.data as { status: string | null } | null)?.status ?? null,
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

        const { error: updateError } = await supabaseServer
            .from('delivery_orders')
            .update({
                do_status: nextStatus,
                failure_reason: nextStatus === 'failed' ? failureReason : null,
                rescheduled_at: nextStatus === 'rescheduled' ? rescheduledAt : null,
                cancelled_reason: nextStatus === 'cancelled' ? cancelledReason : null,
            })
            .eq('id', uuid)

        if (updateError) return errorResponse(updateError.message, 500)

        if (nextStatus === 'delivered' || nextStatus === 'partially_delivered') {
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
