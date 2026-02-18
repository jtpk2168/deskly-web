import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../../lib/apiResponse'
import { parsePaginationParams } from '@/lib/pagination'
import { parseDeliveryOrderFilters } from '@/lib/deliveryOrders'

type DeliveryOrderRecord = {
    id: string
    subscription_id: string
    do_status: string
    created_at: string
    updated_at: string
}

type SubscriptionLookupRecord = {
    id: string
    user_id: string
    status: string | null
}

type ProfileLookupRecord = {
    id: string
    full_name: string | null
}

type FulfillmentLookupRecord = {
    subscription_id: string
    service_state: string
    collection_status: string
}

type SubscriptionItemRecord = {
    subscription_id: string
    category: string | null
    product_name: string | null
    quantity: number | string | null
}

type DeliveryOrderListItem = {
    id: string
    subscription_id: string
    customer: string
    items: string
    do_status: string
    billing_status: string | null
    service_state: string | null
    collection_status: string | null
    date: string
}

function parseQuantity(value: number | string | null | undefined) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) return 0
    return parsed
}

function formatCompactId(value: string) {
    return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8)
}

function matchesDeliveryOrderSearch(order: DeliveryOrderListItem, searchQuery: string) {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true

    const compactOrderId = formatCompactId(order.id)
    const compactSubscriptionId = formatCompactId(order.subscription_id)
    const haystacks = [
        order.id,
        compactOrderId,
        `#${compactOrderId}`,
        order.subscription_id,
        compactSubscriptionId,
        `#${compactSubscriptionId}`,
        order.customer,
        order.items,
        order.do_status,
        order.billing_status ?? '',
        order.service_state ?? '',
        order.collection_status ?? '',
        order.date,
    ]

    return haystacks.some((value) => value.toLowerCase().includes(query))
}

function buildItemSummaryRows(rows: SubscriptionItemRecord[]) {
    const groupedBySubscription = new Map<string, Map<string, number>>()

    for (const row of rows) {
        const subscriptionId = row.subscription_id
        const category = row.category?.trim()
        const productName = row.product_name?.trim()
        const label = category || productName || 'Item'
        const quantity = parseQuantity(row.quantity) || 1

        const subscriptionMap = groupedBySubscription.get(subscriptionId) ?? new Map<string, number>()
        subscriptionMap.set(label, (subscriptionMap.get(label) ?? 0) + quantity)
        groupedBySubscription.set(subscriptionId, subscriptionMap)
    }

    const summaryBySubscription = new Map<string, string>()

    for (const [subscriptionId, categoryMap] of groupedBySubscription.entries()) {
        const summary = [...categoryMap.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([label, qty]) => `${label} x ${qty}`)
            .join(', ')
        summaryBySubscription.set(subscriptionId, summary)
    }

    return summaryBySubscription
}

async function fetchItemSummaryMap(subscriptionIds: string[]) {
    if (subscriptionIds.length === 0) return new Map<string, string>()

    const { data, error } = await supabaseServer
        .from('subscription_items')
        .select('subscription_id, category, product_name, quantity')
        .in('subscription_id', subscriptionIds)

    if (error) {
        // Fail open: item summary should not block list rendering.
        return new Map<string, string>()
    }

    return buildItemSummaryRows((data ?? []) as SubscriptionItemRecord[])
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
        // Ignore auth lookup failures and use deterministic fallback below.
    }

    return `User ${userId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

async function mapDeliveryOrderRecords(records: DeliveryOrderRecord[]) {
    const subscriptionIds = [...new Set(records.map((record) => record.subscription_id))]
    if (subscriptionIds.length === 0) return [] as DeliveryOrderListItem[]

    const [subscriptionsResult, fulfillmentsResult, itemSummaryMap] = await Promise.all([
        supabaseServer
            .from('subscriptions')
            .select('id, user_id, status')
            .in('id', subscriptionIds),
        supabaseServer
            .from('subscription_fulfillment')
            .select('subscription_id, service_state, collection_status')
            .in('subscription_id', subscriptionIds),
        fetchItemSummaryMap(subscriptionIds),
    ])

    const subscriptionRows = (subscriptionsResult.data ?? []) as SubscriptionLookupRecord[]
    const subscriptionMap = new Map(subscriptionRows.map((row) => [row.id, row]))
    const userIds = [...new Set(subscriptionRows.map((row) => row.user_id))]

    let profileMap = new Map<string, ProfileLookupRecord>()
    if (userIds.length > 0) {
        const { data: profilesData } = await supabaseServer
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds)
        profileMap = new Map(((profilesData ?? []) as ProfileLookupRecord[]).map((row) => [row.id, row]))
    }

    const fulfillmentRows = (fulfillmentsResult.data ?? []) as FulfillmentLookupRecord[]
    const fulfillmentMap = new Map(fulfillmentRows.map((row) => [row.subscription_id, row]))

    const mapped = await Promise.all(records.map(async (record) => {
        const subscription = subscriptionMap.get(record.subscription_id) ?? null
        const profileName = subscription ? profileMap.get(subscription.user_id)?.full_name ?? null : null
        const customer = subscription
            ? await resolveCustomerName(subscription.user_id, profileName)
            : `Subscription ${formatCompactId(record.subscription_id)}`
        const fulfillment = fulfillmentMap.get(record.subscription_id) ?? null
        return {
            id: record.id,
            subscription_id: record.subscription_id,
            customer,
            items: itemSummaryMap.get(record.subscription_id) ?? 'No items captured',
            do_status: record.do_status,
            billing_status: subscription?.status ?? null,
            service_state: fulfillment?.service_state ?? null,
            collection_status: fulfillment?.collection_status ?? null,
            date: new Date(record.created_at).toLocaleDateString(),
        } as DeliveryOrderListItem
    }))

    return mapped
}

/** GET /api/admin/delivery-orders — List delivery orders */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const filters = parseDeliveryOrderFilters(searchParams)
        const { page, limit, from, to } = parsePaginationParams(searchParams)

        let baseQuery = supabaseServer
            .from('delivery_orders')
            .select('id, subscription_id, do_status, created_at, updated_at', { count: 'exact' })
            .order(filters.sortBy, { ascending: filters.sortDir === 'asc' })

        if (filters.status) {
            baseQuery = baseQuery.eq('do_status', filters.status)
        }
        if (filters.subscriptionId) {
            baseQuery = baseQuery.eq('subscription_id', filters.subscriptionId)
        }

        if (filters.search) {
            const { data, error } = await baseQuery
            if (error) return errorResponse(error.message, 500)

            const records = (data ?? []) as DeliveryOrderRecord[]
            const mapped = await mapDeliveryOrderRecords(records)
            const filteredItems = mapped.filter((row) => matchesDeliveryOrderSearch(row, filters.search as string))
            const paginated = filteredItems.slice(from, to + 1)

            return successResponse(paginated, 200, {
                page,
                limit,
                total: filteredItems.length,
            })
        }

        const { data, error, count } = await baseQuery.range(from, to)
        if (error) return errorResponse(error.message, 500)

        const mapped = await mapDeliveryOrderRecords((data ?? []) as DeliveryOrderRecord[])
        return successResponse(mapped, 200, {
            page,
            limit,
            total: count ?? 0,
        })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}
