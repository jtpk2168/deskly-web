import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../../lib/apiResponse'
import { parsePaginationParams } from '@/lib/pagination'
import { parseAdminOrderFilters } from '@/lib/adminOrders'

type OrderRecord = {
    id: string
    user_id: string
    monthly_total: number | string | null
    status: string | null
    created_at: string
    bundles: { name: string | null } | { name: string | null }[] | null
    profiles: { full_name: string | null } | { full_name: string | null }[] | null
}

type SubscriptionItemRecord = {
    subscription_id: string
    category: string | null
    product_name: string | null
    quantity: number | string | null
}

type OrderListItem = {
    id: string
    customer: string
    items: string
    total: number | null
    status: string | null
    date: string
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

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

function formatOrderId(value: string) {
    return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8)
}

function matchesOrderSearch(order: OrderListItem, searchQuery: string) {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true

    const compactOrderId = formatOrderId(order.id)
    const haystacks = [
        order.id,
        compactOrderId,
        `#${compactOrderId}`,
        order.customer,
        order.items,
        order.status ?? '',
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
        // Fail open: item summary should not block order list rendering.
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

async function mapOrderRecords(records: OrderRecord[]) {
    const itemSummaryMap = await fetchItemSummaryMap(records.map((record) => record.id))

    const orders = await Promise.all(
        records.map(async (sub) => {
            const profile = unwrapSingle(sub.profiles)
            const bundle = unwrapSingle(sub.bundles)
            return {
                id: sub.id,
                customer: await resolveCustomerName(sub.user_id, profile?.full_name ?? null),
                items: itemSummaryMap.get(sub.id) ?? bundle?.name ?? 'No items captured',
                total: parseMoney(sub.monthly_total),
                status: sub.status,
                date: new Date(sub.created_at).toLocaleDateString(),
            } as OrderListItem
        })
    )

    return orders
}

/** GET /api/admin/orders — List all subscriptions (orders) for admin */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const filters = parseAdminOrderFilters(searchParams)
        const { page, limit, from, to } = parsePaginationParams(searchParams)

        const baseQuery = supabaseServer
            .from('subscriptions')
            .select(`
                id,
                user_id,
                monthly_total,
                status,
                created_at,
                bundles (
                    name
                ),
                profiles (
                    full_name
                )
            `, { count: 'exact' })
            .order(filters.sortBy, { ascending: filters.sortDir === 'asc' })

        const filteredQuery = filters.status
            ? baseQuery.eq('status', filters.status)
            : baseQuery

        if (filters.search) {
            const { data, error } = await filteredQuery
            if (error) return errorResponse(error.message, 500)

            const records = (data ?? []) as unknown as OrderRecord[]
            const orders = await mapOrderRecords(records)
            const filteredOrders = orders.filter((order) => matchesOrderSearch(order, filters.search as string))
            const paginatedOrders = filteredOrders.slice(from, to + 1)

            return successResponse(paginatedOrders, 200, {
                page,
                limit,
                total: filteredOrders.length,
            })
        }

        const { data, error, count } = await filteredQuery.range(from, to)
        if (error) return errorResponse(error.message, 500)

        const records = (data ?? []) as unknown as OrderRecord[]
        const orders = await mapOrderRecords(records)

        return successResponse(orders, 200, {
            page,
            limit,
            total: count ?? 0,
        })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}
