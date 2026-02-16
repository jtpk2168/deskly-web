import { parseOptionalNumber, normalizeCategory, normalizeStatus } from './products'

export const ADMIN_PRODUCT_SORT_COLUMNS = ['name', 'monthly_price', 'stock_quantity', 'created_at'] as const
export type AdminProductSortColumn = (typeof ADMIN_PRODUCT_SORT_COLUMNS)[number]

export type AdminProductFilters = {
    search: string | null
    category: string | null
    status: string | null
    minPrice: number | null
    maxPrice: number | null
    minStock: number | null
    maxStock: number | null
    sortBy: AdminProductSortColumn
    sortDir: 'asc' | 'desc'
}

type ProductQueryBuilder = {
    order: (column: string, options: { ascending: boolean }) => ProductQueryBuilder
    ilike: (column: string, value: string) => ProductQueryBuilder
    eq: (column: string, value: string) => ProductQueryBuilder
    gte: (column: string, value: number) => ProductQueryBuilder
    lte: (column: string, value: number) => ProductQueryBuilder
}

export function parseAdminProductFilters(searchParams: URLSearchParams): AdminProductFilters {
    const searchRaw = searchParams.get('search')?.trim() ?? ''
    const categoryRaw = searchParams.get('category')
    const statusRaw = searchParams.get('status')
    const sortByRaw = searchParams.get('sort_by')
    const sortDirRaw = searchParams.get('sort_dir')

    const category = categoryRaw ? normalizeCategory(categoryRaw) : null
    const status = statusRaw ? normalizeStatus(statusRaw) : null

    return {
        search: searchRaw.length > 0 ? searchRaw : null,
        category,
        status,
        minPrice: parseOptionalNumber(searchParams.get('min_price')),
        maxPrice: parseOptionalNumber(searchParams.get('max_price')),
        minStock: parseOptionalNumber(searchParams.get('min_stock')),
        maxStock: parseOptionalNumber(searchParams.get('max_stock')),
        sortBy: ADMIN_PRODUCT_SORT_COLUMNS.includes(sortByRaw as AdminProductSortColumn)
            ? (sortByRaw as AdminProductSortColumn)
            : 'created_at',
        sortDir: sortDirRaw === 'asc' ? 'asc' : 'desc',
    }
}

export function applyAdminProductFilters<T extends ProductQueryBuilder>(query: T, filters: AdminProductFilters): T {
    let nextQuery = query.order(filters.sortBy, { ascending: filters.sortDir === 'asc' }) as T

    if (filters.search) {
        nextQuery = nextQuery.ilike('name', `%${filters.search}%`) as T
    }

    if (filters.category) {
        nextQuery = nextQuery.eq('category', filters.category) as T
    }

    if (filters.status) {
        nextQuery = nextQuery.eq('status', filters.status) as T
    }

    if (filters.minPrice != null) {
        nextQuery = nextQuery.gte('monthly_price', filters.minPrice) as T
    }

    if (filters.maxPrice != null) {
        nextQuery = nextQuery.lte('monthly_price', filters.maxPrice) as T
    }

    if (filters.minStock != null) {
        nextQuery = nextQuery.gte('stock_quantity', Math.floor(filters.minStock)) as T
    }

    if (filters.maxStock != null) {
        nextQuery = nextQuery.lte('stock_quantity', Math.floor(filters.maxStock)) as T
    }

    return nextQuery
}
