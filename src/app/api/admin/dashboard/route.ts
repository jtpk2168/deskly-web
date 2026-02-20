import { supabaseServer } from '../../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../../lib/apiResponse'
import { fetchAllAuthUsers } from '@/lib/authAdminUsers'

type RevenueSubscriptionRecord = {
    monthly_total: number | string | null
    status: string | null
}

type RecentDeliveryOrderRecord = {
    id: string
    subscription_id: string
    do_status: string | null
    created_at: string
}

type SubscriptionLookupRecord = {
    id: string
    user_id: string
    bundles: { name: string | null } | { name: string | null }[] | null
    profiles: { full_name: string | null } | { full_name: string | null }[] | null
}

type DashboardOrderItem = {
    id: string
    customerName: string
    itemName: string
    status: string | null
    createdAt: string
}

const REVENUE_STATUSES = new Set(['active'])

function parseMoney(value: number | string | null | undefined) {
    if (value == null) return 0
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

function toShortUserId(userId: string) {
    return userId.replace(/-/g, '').toUpperCase().slice(0, 8)
}

function toShortSubscriptionId(subscriptionId: string) {
    return subscriptionId.replace(/-/g, '').toUpperCase().slice(0, 8)
}

function toOrderItems(
    rows: RecentDeliveryOrderRecord[],
    subscriptionsById: Map<string, SubscriptionLookupRecord>,
): DashboardOrderItem[] {
    return rows.map((row) => {
        const subscription = subscriptionsById.get(row.subscription_id)
        const profile = unwrapSingle(subscription?.profiles)
        const bundle = unwrapSingle(subscription?.bundles)
        const customerName = profile?.full_name?.trim()
            || (subscription ? `User ${toShortUserId(subscription.user_id)}` : `Subscription ${toShortSubscriptionId(row.subscription_id)}`)

        return {
            id: row.id,
            customerName,
            itemName: bundle?.name?.trim() || 'Rental plan',
            status: row.do_status,
            createdAt: row.created_at,
        }
    })
}

/** GET /api/admin/dashboard — Aggregated metrics for admin overview */
export async function GET() {
    try {
        const [
            revenueQuery,
            activeRentalsQuery,
            productsCountQuery,
            recentDeliveryOrdersQuery,
            authUsersQuery,
        ] = await Promise.all([
            supabaseServer
                .from('subscriptions')
                .select('monthly_total, status'),
            supabaseServer
                .from('subscriptions')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'active'),
            supabaseServer
                .from('products')
                .select('id', { count: 'exact', head: true }),
            supabaseServer
                .from('delivery_orders')
                .select('id, subscription_id, do_status, created_at')
                .order('created_at', { ascending: false })
                .limit(3),
            fetchAllAuthUsers(),
        ])

        if (revenueQuery.error) return errorResponse(revenueQuery.error.message, 500)
        if (activeRentalsQuery.error) return errorResponse(activeRentalsQuery.error.message, 500)
        if (productsCountQuery.error) return errorResponse(productsCountQuery.error.message, 500)
        if (recentDeliveryOrdersQuery.error) return errorResponse(recentDeliveryOrdersQuery.error.message, 500)
        if (authUsersQuery.error) return errorResponse(authUsersQuery.error.message, 500)

        const subscriptions = (revenueQuery.data ?? []) as RevenueSubscriptionRecord[]
        const totalRevenue = subscriptions.reduce((sum, row) => {
            const normalizedStatus = row.status?.toLowerCase()
            if (!normalizedStatus || !REVENUE_STATUSES.has(normalizedStatus)) return sum
            return sum + parseMoney(row.monthly_total)
        }, 0)

        const totalUsers = authUsersQuery.users.filter((user) => user.app_metadata?.role !== 'admin').length
        const recentDeliveryOrders = (recentDeliveryOrdersQuery.data ?? []) as RecentDeliveryOrderRecord[]
        const subscriptionIds = [...new Set(recentDeliveryOrders.map((row) => row.subscription_id))]

        let subscriptionsById = new Map<string, SubscriptionLookupRecord>()
        if (subscriptionIds.length > 0) {
            const { data: subscriptionRows, error: subscriptionLookupError } = await supabaseServer
                .from('subscriptions')
                .select(`
                    id,
                    user_id,
                    bundles (
                        name
                    ),
                    profiles (
                        full_name
                    )
                `)
                .in('id', subscriptionIds)

            if (subscriptionLookupError) {
                return errorResponse(subscriptionLookupError.message, 500)
            }

            subscriptionsById = new Map(
                ((subscriptionRows ?? []) as SubscriptionLookupRecord[]).map((row) => [row.id, row]),
            )
        }

        const recentOrders = toOrderItems(recentDeliveryOrders, subscriptionsById)

        return successResponse({
            totalRevenue,
            activeRentals: activeRentalsQuery.count ?? 0,
            totalProducts: productsCountQuery.count ?? 0,
            totalUsers,
            recentOrders,
        })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}
