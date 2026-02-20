import type { BillingStatus } from './billing/types'

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

export type AdminOrderStatus = BillingStatus
export type AdminOrderSortColumn = 'created_at' | 'monthly_total' | 'status'
export type AdminOrderFilters = PaginationQuery & {
    search?: string
    status?: AdminOrderStatus | 'all'
    userId?: string
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

export type AdminSubscription = {
    id: string
    customer: string
    items: string
    total: number | null
    billing_status: AdminOrderStatus | null
    status: AdminOrderStatus | null
    date: string
}

export type AdminSubscriptionDetail = {
    id: string
    userId: string
    bundleId: string | null
    billingStatus: AdminOrderStatus | null
    status: AdminOrderStatus | null
    total: number | null
    subtotalAmount: number | null
    taxAmount: number | null
    createdAt: string
    startDate: string | null
    endDate: string | null
    serviceState: string | null
    collectionStatus: string | null
    firstDeliveryAt: string | null
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

export type AdminSubscriptionAction = 'cancel_now' | 'cancel_at_period_end'

export type AdminSubscriptionActionResult = {
    action: AdminSubscriptionAction
    provider: 'stripe'
    providerStatus: string | null
    providerSubscriptionId: string
    currentPeriodEnd: string | null
    cancelledAt: string | null
    cancelAtPeriodEnd: boolean
    subscription: AdminSubscriptionDetail
}

export type DeliveryOrderStatus =
    | 'confirmed'
    | 'dispatched'
    | 'delivered'
    | 'partially_delivered'
    | 'failed'
    | 'rescheduled'
    | 'cancelled'

export type DeliveryOrderSortColumn = 'created_at' | 'updated_at' | 'do_status'

export type AdminDeliveryOrderFilters = PaginationQuery & {
    search?: string
    status?: DeliveryOrderStatus | 'all'
    subscriptionId?: string
    sortBy?: DeliveryOrderSortColumn
    sortDir?: 'asc' | 'desc'
}

export type AdminDeliveryOrder = {
    id: string
    subscription_id: string
    customer: string
    items: string
    do_status: DeliveryOrderStatus
    billing_status: AdminOrderStatus | null
    service_state: string | null
    collection_status: string | null
    date: string
}

export type AdminDeliveryOrderDetail = {
    id: string
    subscription_id: string
    do_status: DeliveryOrderStatus
    failure_reason: string | null
    rescheduled_at: string | null
    cancelled_reason: string | null
    created_at: string
    updated_at: string
    subscription: {
        id: string
        user_id: string
        customer_name: string
        billing_status: AdminOrderStatus | null
        status: AdminOrderStatus | null
        monthly_total: number | null
        start_date: string | null
        end_date: string | null
        service_state: string | null
        collection_status: string | null
        first_delivery_at: string | null
        delivery: {
            company_name: string | null
            contact_name: string | null
            contact_phone: string | null
            address: string | null
        }
        items_summary: string
        items: Array<{
            name: string
            category: string | null
            quantity: number
        }>
    } | null
}

export type AdminDeliveryOrderUpdatePayload = {
    do_status: DeliveryOrderStatus
    failure_reason?: string | null
    rescheduled_at?: string | null
    cancelled_reason?: string | null
}

export type AdminUser = {
    id: string
    name: string
    email: string
    role: 'Admin' | 'Customer'
    joinedDate: string
}

export type CustomerProfile = {
    id: string
    full_name: string | null
    job_title: string | null
    phone_number: string | null
    marketing_consent?: boolean | null
    company: {
        profile_id: string
        company_name: string | null
        registration_number: string | null
        address: string | null
        office_city: string | null
        office_zip_postal: string | null
        delivery_address: string | null
        delivery_city: string | null
        delivery_zip_postal: string | null
        industry: string | null
        team_size: string | null
    } | null
}

export type AdminDashboardOrder = {
    id: string
    customerName: string
    itemName: string
    status: string | null
    createdAt: string
}

export type AdminDashboard = {
    totalRevenue: number
    activeRentals: number
    totalProducts: number
    totalUsers: number
    recentOrders: AdminDashboardOrder[]
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
    if (filters.userId?.trim()) params.set('user_id', filters.userId.trim())
    if (filters.sortBy) params.set('sort_by', filters.sortBy)
    if (filters.sortDir) params.set('sort_dir', filters.sortDir)

    return params
}

function buildDeliveryOrderQueryParams(filters: AdminDeliveryOrderFilters = {}) {
    const params = buildPaginationParams(filters)

    if (filters.search?.trim()) params.set('search', filters.search.trim())
    if (filters.status && filters.status !== 'all') params.set('status', filters.status)
    if (filters.subscriptionId?.trim()) params.set('subscription_id', filters.subscriptionId.trim())
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

// Dashboard
export async function getAdminDashboard(): Promise<AdminDashboard> {
    const res = await fetch('/api/admin/dashboard', { cache: 'no-store' })
    return parseResponse<AdminDashboard>(res)
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

// Subscriptions (Monetary)
export async function getAdminSubscriptions(query: AdminOrderFilters = {}): Promise<PaginatedResult<AdminSubscription>> {
    const params = buildOrderQueryParams(query)
    const qs = params.toString()
    const res = await fetch(`/api/admin/subscriptions${qs ? `?${qs}` : ''}`, { cache: 'no-store' })
    return parsePaginatedResponse<AdminSubscription>(res)
}

export async function getAdminSubscription(id: string): Promise<AdminSubscriptionDetail> {
    const res = await fetch(`/api/admin/subscriptions/${id}`, { cache: 'no-store' })
    return parseResponse<AdminSubscriptionDetail>(res)
}

export async function runAdminSubscriptionAction(
    id: string,
    action: AdminSubscriptionAction,
): Promise<AdminSubscriptionActionResult> {
    const res = await fetch(`/api/admin/subscriptions/${id}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
    })
    return parseResponse<AdminSubscriptionActionResult>(res)
}

// Backward-compatible aliases used by existing order UI code paths.
export async function getOrders(query: AdminOrderFilters = {}): Promise<PaginatedResult<AdminOrder>> {
    const result = await getAdminSubscriptions(query)
    return {
        ...result,
        items: result.items.map((item) => ({
            id: item.id,
            customer: item.customer,
            items: item.items,
            total: item.total,
            status: item.billing_status,
            date: item.date,
        })),
    }
}

export async function getOrder(id: string): Promise<AdminOrderDetail> {
    const detail = await getAdminSubscription(id)
    return {
        id: detail.id,
        userId: detail.userId,
        bundleId: detail.bundleId,
        status: detail.billingStatus,
        total: detail.total,
        subtotalAmount: detail.subtotalAmount,
        taxAmount: detail.taxAmount,
        createdAt: detail.createdAt,
        startDate: detail.startDate,
        endDate: detail.endDate,
        itemsSummary: detail.itemsSummary,
        items: detail.items,
        customer: detail.customer,
        bundle: detail.bundle,
    }
}

// Delivery Orders (Fulfillment)
export async function getDeliveryOrders(filters: AdminDeliveryOrderFilters = {}): Promise<PaginatedResult<AdminDeliveryOrder>> {
    const params = buildDeliveryOrderQueryParams(filters)
    const qs = params.toString()
    const res = await fetch(`/api/admin/delivery-orders${qs ? `?${qs}` : ''}`, { cache: 'no-store' })
    return parsePaginatedResponse<AdminDeliveryOrder>(res)
}

export async function getDeliveryOrder(id: string): Promise<AdminDeliveryOrderDetail> {
    const res = await fetch(`/api/admin/delivery-orders/${id}`, { cache: 'no-store' })
    return parseResponse<AdminDeliveryOrderDetail>(res)
}

export async function updateDeliveryOrder(id: string, payload: AdminDeliveryOrderUpdatePayload): Promise<AdminDeliveryOrderDetail> {
    const res = await fetch(`/api/admin/delivery-orders/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })
    return parseResponse<AdminDeliveryOrderDetail>(res)
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

export async function getCustomerProfile(userId: string): Promise<CustomerProfile> {
    const params = new URLSearchParams()
    params.set('user_id', userId)
    const res = await fetch(`/api/profile?${params.toString()}`, { cache: 'no-store' })
    return parseResponse<CustomerProfile>(res)
}
