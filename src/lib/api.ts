export type ProductStatus = 'draft' | 'active' | 'inactive'
export type ProductPricingMode = 'fixed' | 'tiered'
export type ProductPricingTier = {
    min_months: number
    monthly_price: number
}
export type PaginationQuery = { page?: number; limit?: number }
export type PaginatedResult<T> = {
    items: T[]
    page: number
    limit: number
    total: number
}

export type AdminProduct = {
    id: string
    product_code: string
    name: string
    description: string | null
    category: string | null
    monthly_price: number
    pricing_mode: ProductPricingMode
    pricing_tiers: ProductPricingTier[]
    image_url: string | null
    video_url: string | null
    stock_quantity: number
    status: ProductStatus
    is_active: boolean
    created_at: string
    updated_at: string
    published_at: string | null
}

export type AdminProductFilters = {
    search?: string
    sortBy?: 'name' | 'monthly_price' | 'stock_quantity' | 'created_at'
    sortDir?: 'asc' | 'desc'
    category?: string
    status?: ProductStatus
    minPrice?: string | number
    maxPrice?: string | number
    minStock?: string | number
    maxStock?: string | number
    page?: number
    limit?: number
}

export type AdminOrder = {
    id: string
    customer: string
    items: string
    total: number | null
    status: string | null
    date: string
}

export type AdminUser = {
    id: string
    name: string
    email: string
    role: 'Admin' | 'Customer'
    joinedDate: string
}

export type ProductUpsertPayload = {
    name: string
    description?: string | null
    category: string
    monthly_price: number
    pricing_mode: ProductPricingMode
    pricing_tiers?: ProductPricingTier[]
    stock_quantity: number
    image_url?: string | null
    video_url?: string | null
    status: ProductStatus
}

type ApiMeta = {
    page?: number
    limit?: number
    total?: number
    errors?: string[]
}

type ApiResult<T> = {
    data: T
    error: string | null
    meta: ApiMeta | null
}

async function parseApiBody<T>(res: Response): Promise<ApiResult<T>> {
    const json = await res.json().catch(() => null)
    if (!res.ok) {
        const message =
            json?.meta?.errors?.join('\n') ||
            json?.error ||
            `Request failed (${res.status})`
        throw new Error(message)
    }

    return json as ApiResult<T>
}

async function parseResponse<T>(res: Response): Promise<T> {
    const json = await parseApiBody<T>(res)
    return json.data
}

async function parsePaginatedResponse<T>(res: Response): Promise<PaginatedResult<T>> {
    const json = await parseApiBody<T[]>(res)
    const items = Array.isArray(json.data) ? json.data : []
    const page = json.meta?.page ?? 1
    const limit = json.meta?.limit ?? (items.length > 0 ? items.length : 10)
    const total = json.meta?.total ?? items.length
    return { items, page, limit, total }
}

function buildPaginationParams(query: PaginationQuery = {}) {
    const params = new URLSearchParams()
    if (query.page && query.page > 0) params.set('page', String(query.page))
    if (query.limit && query.limit > 0) params.set('limit', String(query.limit))
    return params
}

function buildProductQueryParams(filters: AdminProductFilters = {}) {
    const params = buildPaginationParams(filters)

    if (filters.search?.trim()) params.set('search', filters.search.trim())
    if (filters.sortBy) params.set('sort_by', filters.sortBy)
    if (filters.sortDir) params.set('sort_dir', filters.sortDir)
    if (filters.category) params.set('category', filters.category)
    if (filters.status) params.set('status', filters.status)
    if (filters.minPrice !== undefined && String(filters.minPrice) !== '') params.set('min_price', String(filters.minPrice))
    if (filters.maxPrice !== undefined && String(filters.maxPrice) !== '') params.set('max_price', String(filters.maxPrice))
    if (filters.minStock !== undefined && String(filters.minStock) !== '') params.set('min_stock', String(filters.minStock))
    if (filters.maxStock !== undefined && String(filters.maxStock) !== '') params.set('max_stock', String(filters.maxStock))

    return params
}

export async function fetchAdminData(endpoint: string) {
    try {
        const res = await fetch(`/api/${endpoint}`, { cache: 'no-store' })
        if (!res.ok) {
            throw new Error(`Failed to fetch ${endpoint}: ${res.statusText}`)
        }
        const json = await res.json()
        return json.data || json
    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error)
        return []
    }
}

// Products
export async function getAdminProducts(filters: AdminProductFilters = {}): Promise<PaginatedResult<AdminProduct>> {
    const params = buildProductQueryParams(filters)
    const qs = params.toString()
    const url = `/api/admin/products${qs ? `?${qs}` : ''}`
    const res = await fetch(url, { cache: 'no-store' })
    return parsePaginatedResponse<AdminProduct>(res)
}

export async function getAdminProduct(id: string): Promise<AdminProduct> {
    const res = await fetch(`/api/admin/products/${id}`, { cache: 'no-store' })
    return parseResponse<AdminProduct>(res)
}

export async function createAdminProduct(payload: ProductUpsertPayload): Promise<AdminProduct> {
    const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })
    return parseResponse<AdminProduct>(res)
}

export async function updateAdminProduct(id: string, payload: Partial<ProductUpsertPayload>): Promise<AdminProduct> {
    const res = await fetch(`/api/admin/products/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })
    return parseResponse<AdminProduct>(res)
}

export async function uploadProductMedia(file: File, mediaType: 'image' | 'video'): Promise<string> {
    const formData = new FormData()
    formData.set('mediaType', mediaType)
    formData.set('file', file)

    const res = await fetch('/api/admin/products/media-upload', {
        method: 'POST',
        body: formData,
    })

    const data = await parseResponse<{ url: string }>(res)
    return data.url
}

export async function importProductsCsv(file: File): Promise<{ imported: number }> {
    const formData = new FormData()
    formData.set('file', file)

    const res = await fetch('/api/admin/products/import', {
        method: 'POST',
        body: formData,
    })

    return parseResponse<{ imported: number }>(res)
}

export async function exportProductsCsv(filters: AdminProductFilters = {}): Promise<Blob> {
    const params = buildProductQueryParams({
        ...filters,
        page: undefined,
        limit: undefined,
    })
    const qs = params.toString()
    const url = `/api/admin/products/export${qs ? `?${qs}` : ''}`
    const res = await fetch(url)
    if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error || `Export failed (${res.status})`)
    }
    return res.blob()
}

// Backward-compatible aliases used by older page code paths
export async function getProducts() {
    const result = await getAdminProducts()
    return result.items
}

export async function createProduct(productData: ProductUpsertPayload) {
    return createAdminProduct(productData)
}

// Orders (Subscriptions)
export async function getOrders(query: PaginationQuery = {}): Promise<PaginatedResult<AdminOrder>> {
    const params = buildPaginationParams(query)
    const qs = params.toString()
    const res = await fetch(`/api/orders${qs ? `?${qs}` : ''}`, { cache: 'no-store' })
    return parsePaginatedResponse<AdminOrder>(res)
}

// Admins
export async function getAdmins(query: PaginationQuery = {}): Promise<PaginatedResult<AdminUser>> {
    const params = buildPaginationParams(query)
    const qs = params.toString()
    const res = await fetch(`/api/admins${qs ? `?${qs}` : ''}`, { cache: 'no-store' })
    return parsePaginatedResponse<AdminUser>(res)
}

export async function deleteAdmin(userId: string) {
    const res = await fetch(`/api/admins?id=${userId}`, { method: 'DELETE' })
    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || 'Failed to delete admin')
    }
    return res.json()
}

// Customers
export async function getCustomers(query: PaginationQuery = {}): Promise<PaginatedResult<AdminUser>> {
    const params = buildPaginationParams(query)
    const qs = params.toString()
    const res = await fetch(`/api/customers${qs ? `?${qs}` : ''}`, { cache: 'no-store' })
    return parsePaginatedResponse<AdminUser>(res)
}

export async function deleteCustomer(userId: string) {
    const res = await fetch(`/api/customers?id=${userId}`, { method: 'DELETE' })
    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || 'Failed to delete customer')
    }
    return res.json()
}
