export const ADMIN_ORDER_STATUSES = ['active', 'pending', 'pending_payment', 'payment_failed', 'incomplete', 'cancelled', 'completed'] as const
export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number]

export const ADMIN_ORDER_SORT_COLUMNS = ['created_at', 'monthly_total', 'status'] as const
export type AdminOrderSortColumn = (typeof ADMIN_ORDER_SORT_COLUMNS)[number]

export type AdminOrderFilters = {
    search: string | null
    status: AdminOrderStatus | null
    sortBy: AdminOrderSortColumn
    sortDir: 'asc' | 'desc'
}

type OrderQueryBuilder = {
    order: (column: string, options: { ascending: boolean }) => OrderQueryBuilder
    eq: (column: string, value: string) => OrderQueryBuilder
}

export function normalizeOrderStatus(input: string | null | undefined): AdminOrderStatus | null {
    const key = (input ?? '').trim().toLowerCase()
    if (!key) return null
    if (ADMIN_ORDER_STATUSES.includes(key as AdminOrderStatus)) return key as AdminOrderStatus
    return null
}

export function parseAdminOrderFilters(searchParams: URLSearchParams): AdminOrderFilters {
    const searchRaw = searchParams.get('search')
    const statusRaw = searchParams.get('status')
    const sortByRaw = searchParams.get('sort_by')
    const sortDirRaw = searchParams.get('sort_dir')

    const search = searchRaw?.trim() ? searchRaw.trim() : null
    const status = statusRaw ? normalizeOrderStatus(statusRaw) : null

    return {
        search,
        status,
        sortBy: ADMIN_ORDER_SORT_COLUMNS.includes(sortByRaw as AdminOrderSortColumn)
            ? (sortByRaw as AdminOrderSortColumn)
            : 'created_at',
        sortDir: sortDirRaw === 'asc' ? 'asc' : 'desc',
    }
}

export function applyAdminOrderFilters<T extends OrderQueryBuilder>(query: T, filters: AdminOrderFilters): T {
    let nextQuery = query.order(filters.sortBy, { ascending: filters.sortDir === 'asc' }) as T

    if (filters.status) {
        nextQuery = nextQuery.eq('status', filters.status) as T
    }

    return nextQuery
}
