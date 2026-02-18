export const DELIVERY_ORDER_STATUSES = [
    'confirmed',
    'dispatched',
    'delivered',
    'partially_delivered',
    'failed',
    'rescheduled',
    'cancelled',
] as const

export type DeliveryOrderStatus = (typeof DELIVERY_ORDER_STATUSES)[number]

export const DELIVERY_ORDER_SORT_COLUMNS = ['created_at', 'updated_at', 'do_status'] as const
export type DeliveryOrderSortColumn = (typeof DELIVERY_ORDER_SORT_COLUMNS)[number]

export type DeliveryOrderFilters = {
    search: string | null
    status: DeliveryOrderStatus | null
    subscriptionId: string | null
    sortBy: DeliveryOrderSortColumn
    sortDir: 'asc' | 'desc'
}

type DeliveryOrderQueryBuilder = {
    order: (column: string, options: { ascending: boolean }) => DeliveryOrderQueryBuilder
    eq: (column: string, value: string) => DeliveryOrderQueryBuilder
}

export function normalizeDeliveryOrderStatus(input: string | null | undefined): DeliveryOrderStatus | null {
    const key = (input ?? '').trim().toLowerCase()
    if (!key) return null
    if (DELIVERY_ORDER_STATUSES.includes(key as DeliveryOrderStatus)) return key as DeliveryOrderStatus
    return null
}

export function parseDeliveryOrderFilters(searchParams: URLSearchParams): DeliveryOrderFilters {
    const searchRaw = searchParams.get('search')
    const statusRaw = searchParams.get('status')
    const subscriptionIdRaw = searchParams.get('subscription_id')
    const sortByRaw = searchParams.get('sort_by')
    const sortDirRaw = searchParams.get('sort_dir')

    const search = searchRaw?.trim() ? searchRaw.trim() : null
    const status = statusRaw ? normalizeDeliveryOrderStatus(statusRaw) : null
    const subscriptionId = subscriptionIdRaw?.trim() ? subscriptionIdRaw.trim() : null

    return {
        search,
        status,
        subscriptionId,
        sortBy: DELIVERY_ORDER_SORT_COLUMNS.includes(sortByRaw as DeliveryOrderSortColumn)
            ? (sortByRaw as DeliveryOrderSortColumn)
            : 'created_at',
        sortDir: sortDirRaw === 'asc' ? 'asc' : 'desc',
    }
}

export function applyDeliveryOrderFilters<T extends DeliveryOrderQueryBuilder>(query: T, filters: DeliveryOrderFilters): T {
    let nextQuery = query.order(filters.sortBy, { ascending: filters.sortDir === 'asc' }) as T

    if (filters.status) {
        nextQuery = nextQuery.eq('do_status', filters.status) as T
    }

    if (filters.subscriptionId) {
        nextQuery = nextQuery.eq('subscription_id', filters.subscriptionId) as T
    }

    return nextQuery
}
