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
    status: AdminOrderStatus | null
    date: string
}

export type AdminOrderStatus = 'active' | 'pending' | 'pending_payment' | 'payment_failed' | 'incomplete' | 'cancelled' | 'completed'
export type AdminOrderSortColumn = 'created_at' | 'monthly_total' | 'status'
export type AdminOrderFilters = PaginationQuery & {
    search?: string
    status?: AdminOrderStatus | 'all'
    sortBy?: AdminOrderSortColumn
    sortDir?: 'asc' | 'desc'
}

export type AdminOrderDetail = {
    id: string
    userId: string
    bundleId: string | null
    status: AdminOrderStatus | null
    total: number | null
    subtotalAmount: number | null
    taxAmount: number | null
    createdAt: string
    startDate: string | null
    endDate: string | null
    itemsSummary: string
    items: Array<{
        productName: string
        category: string | null
        monthlyPrice: number | null
        durationMonths: number | null
        quantity: number
        imageUrl: string | null
    }>
    customer: {
        id: string | null
        name: string | null
        phoneNumber: string | null
        jobTitle: string | null
        companyName: string | null
        industry: string | null
        teamSize: string | null
        address: string | null
        officeAddress: string | null
        deliveryAddress: string | null
    }
    bundle: {
        id: string | null
        name: string | null
        description: string | null
        imageUrl: string | null
        monthlyPrice: number | null
    }
}

export type AdminOrderUpdatePayload = {
    status?: AdminOrderStatus
    start_date?: string | null
    end_date?: string | null
    monthly_total?: number | null
}

export type AdminUser = {
    id: string
    name: string
    email: string
    role: 'Admin' | 'Customer'
    joinedDate: string
}

export type BillingProviderName = 'mock' | 'stripe'
export type BillingWebhookEventStatus = 'received' | 'processed' | 'failed'
export type BillingWebhookEventProvider = BillingProviderName
export type BillingInvoiceStatus = 'draft' | 'open' | 'paid' | 'payment_failed' | 'void' | 'uncollectible' | 'unknown'
export type BillingInvoiceProvider = BillingProviderName

export type BillingRuntimeConfig = {
    provider: BillingProviderName | string
    currency: string
    minimum_term_months: number
    sst_rate: number
    stripe_automatic_tax_enabled: boolean
    stripe_manual_tax_rate_id?: string | null
}

export type BillingCatalogSyncPayload = {
    dry_run?: boolean
    currency?: string
    product_ids?: string[]
}

export type BillingCatalogSyncItem = {
    product_id: string
    product_name: string
    action: 'skipped' | 'created'
    provider_product_id: string
    provider_price_id: string
    unit_amount: number
    currency: string
}

export type BillingCatalogSyncResult = {
    provider: BillingProviderName | string
    dry_run: boolean
    total_products: number
    created_count: number
    skipped_count: number
    synced: BillingCatalogSyncItem[]
}

export type BillingWebhookEvent = {
    id: string
    provider: BillingWebhookEventProvider
    event_id: string
    event_type: string
    status: BillingWebhookEventStatus
    error_message: string | null
    processed_at: string | null
    created_at: string
    subscription_id: string | null
}

export type BillingWebhookEventFilters = PaginationQuery & {
    status?: BillingWebhookEventStatus | 'all'
    provider?: BillingWebhookEventProvider | 'all'
    search?: string
}

export type BillingInvoice = {
    id: string
    provider: BillingInvoiceProvider
    provider_invoice_id: string
    provider_subscription_id: string | null
    subscription_id: string | null
    invoice_number: string | null
    status: BillingInvoiceStatus
    currency: string
    subtotal_amount: number | null
    tax_amount: number | null
    total_amount: number | null
    amount_paid: number | null
    amount_due: number | null
    hosted_invoice_url: string | null
    invoice_pdf: string | null
    due_date: string | null
    paid_at: string | null
    period_start_at: string | null
    period_end_at: string | null
    created_at: string
}

export type BillingInvoiceFilters = PaginationQuery & {
    status?: BillingInvoiceStatus | 'all'
    provider?: BillingInvoiceProvider | 'all'
    search?: string
}

export type BillingInvoiceBackfillPayload = {
    limit?: number
    dry_run?: boolean
}

export type BillingInvoiceBackfillResult = {
    provider: BillingInvoiceProvider | string
    dry_run: boolean
    requested_limit: number
    fetched_count: number
    mirrored_count: number
    linked_subscription_count: number
    linked_billing_customer_count: number
    unresolved_invoice_ids: string[]
    unresolved_total: number
    has_more_available: boolean
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

function buildOrderQueryParams(filters: AdminOrderFilters = {}) {
    const params = buildPaginationParams(filters)

    if (filters.search?.trim()) params.set('search', filters.search.trim())
    if (filters.status && filters.status !== 'all') params.set('status', filters.status)
    if (filters.sortBy) params.set('sort_by', filters.sortBy)
    if (filters.sortDir) params.set('sort_dir', filters.sortDir)

    return params
}

function buildBillingWebhookEventQueryParams(filters: BillingWebhookEventFilters = {}) {
    const params = buildPaginationParams(filters)
    if (filters.search?.trim()) params.set('search', filters.search.trim())
    if (filters.status && filters.status !== 'all') params.set('status', filters.status)
    if (filters.provider && filters.provider !== 'all') params.set('provider', filters.provider)
    return params
}

function buildBillingInvoiceQueryParams(filters: BillingInvoiceFilters = {}) {
    const params = buildPaginationParams(filters)
    if (filters.search?.trim()) params.set('search', filters.search.trim())
    if (filters.status && filters.status !== 'all') params.set('status', filters.status)
    if (filters.provider && filters.provider !== 'all') params.set('provider', filters.provider)
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
export async function getOrders(query: AdminOrderFilters = {}): Promise<PaginatedResult<AdminOrder>> {
    const params = buildOrderQueryParams(query)
    const qs = params.toString()
    const res = await fetch(`/api/admin/orders${qs ? `?${qs}` : ''}`, { cache: 'no-store' })
    return parsePaginatedResponse<AdminOrder>(res)
}

export async function getOrder(id: string): Promise<AdminOrderDetail> {
    const res = await fetch(`/api/admin/orders/${id}`, { cache: 'no-store' })
    return parseResponse<AdminOrderDetail>(res)
}

export async function updateOrder(id: string, payload: AdminOrderUpdatePayload): Promise<AdminOrderDetail> {
    const res = await fetch(`/api/admin/orders/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })
    return parseResponse<AdminOrderDetail>(res)
}

// Billing
export async function getBillingRuntimeConfig(): Promise<BillingRuntimeConfig> {
    const res = await fetch('/api/billing/config', { cache: 'no-store' })
    return parseResponse<BillingRuntimeConfig>(res)
}

export async function syncBillingCatalog(payload: BillingCatalogSyncPayload): Promise<BillingCatalogSyncResult> {
    const res = await fetch('/api/billing/catalog/sync', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })
    return parseResponse<BillingCatalogSyncResult>(res)
}

export async function getBillingWebhookEvents(filters: BillingWebhookEventFilters = {}): Promise<PaginatedResult<BillingWebhookEvent>> {
    const params = buildBillingWebhookEventQueryParams(filters)
    const qs = params.toString()
    const res = await fetch(`/api/admin/billing/webhook-events${qs ? `?${qs}` : ''}`, { cache: 'no-store' })
    return parsePaginatedResponse<BillingWebhookEvent>(res)
}

export async function getBillingInvoices(filters: BillingInvoiceFilters = {}): Promise<PaginatedResult<BillingInvoice>> {
    const params = buildBillingInvoiceQueryParams(filters)
    const qs = params.toString()
    const res = await fetch(`/api/admin/billing/invoices${qs ? `?${qs}` : ''}`, { cache: 'no-store' })
    return parsePaginatedResponse<BillingInvoice>(res)
}

export async function backfillBillingInvoices(payload: BillingInvoiceBackfillPayload = {}): Promise<BillingInvoiceBackfillResult> {
    const res = await fetch('/api/admin/billing/invoices/backfill', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })
    return parseResponse<BillingInvoiceBackfillResult>(res)
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
