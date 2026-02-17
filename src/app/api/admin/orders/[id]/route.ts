import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../../../lib/apiResponse'
import { normalizeOrderStatus } from '@/lib/adminOrders'

type RouteParams = { params: Promise<{ id: string }> }

type OrderRecord = {
    id: string
    user_id: string
    bundle_id: string | null
    status: string | null
    monthly_total: number | string | null
    start_date: string | null
    end_date: string | null
    created_at: string
    bundles: {
        id: string
        name: string | null
        description: string | null
        image_url: string | null
        monthly_price: number | string | null
    } | {
        id: string
        name: string | null
        description: string | null
        image_url: string | null
        monthly_price: number | string | null
    }[] | null
    profiles: {
        id: string
        full_name: string | null
        phone_number: string | null
        job_title: string | null
    } | {
        id: string
        full_name: string | null
        phone_number: string | null
        job_title: string | null
    }[] | null
}

type CompanyRecord = {
    company_name: string | null
    industry: string | null
    team_size: string | null
    address: string | null
}

type SubscriptionItemRecord = {
    subscription_id: string
    product_name: string | null
    category: string | null
    monthly_price: number | string | null
    duration_months: number | string | null
    quantity: number | string | null
    products: {
        image_url: string | null
    } | {
        image_url: string | null
    }[] | null
}

type OrderDetailsResponse = {
    id: string
    userId: string
    bundleId: string | null
    status: string | null
    total: number | null
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
    }
    bundle: {
        id: string | null
        name: string | null
        description: string | null
        imageUrl: string | null
        monthlyPrice: number | null
    }
}

function parseMoney(value: number | string | null | undefined) {
    if (value == null) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function parsePositiveInteger(value: number | string | null | undefined) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) return null
    return parsed
}

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
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

function parseNullableDate(input: unknown): string | null | undefined {
    if (input === undefined) return undefined
    if (input === null || input === '') return null
    if (typeof input !== 'string') return undefined
    const parsed = new Date(input)
    if (Number.isNaN(parsed.getTime())) return undefined
    return parsed.toISOString()
}

async function fetchOrderDetails(orderId: string): Promise<OrderDetailsResponse | null> {
    const { data, error } = await supabaseServer
        .from('subscriptions')
        .select(`
            id,
            user_id,
            bundle_id,
            status,
            monthly_total,
            start_date,
            end_date,
            created_at,
            bundles (
                id,
                name,
                description,
                image_url,
                monthly_price
            ),
            profiles (
                id,
                full_name,
                phone_number,
                job_title
            )
        `)
        .eq('id', orderId)
        .single()

    if (error || !data) return null

    const record = data as unknown as OrderRecord
    const profile = unwrapSingle(record.profiles)
    const bundle = unwrapSingle(record.bundles)

    const { data: companyData } = await supabaseServer
        .from('companies')
        .select('company_name, industry, team_size, address')
        .eq('profile_id', record.user_id)
        .maybeSingle()

    const company = (companyData as CompanyRecord | null) ?? null
    const customerName = await resolveCustomerName(record.user_id, profile?.full_name ?? null)

    let itemRows: SubscriptionItemRecord[] = []
    const { data: itemData, error: itemError } = await supabaseServer
        .from('subscription_items')
        .select(`
            subscription_id,
            product_name,
            category,
            monthly_price,
            duration_months,
            quantity,
            products (
                image_url
            )
        `)
        .eq('subscription_id', orderId)
        .order('created_at', { ascending: true })

    if (!itemError) {
        itemRows = (itemData ?? []) as SubscriptionItemRecord[]
    }

    const items = itemRows.map((item) => {
        const product = unwrapSingle(item.products)
        return {
            productName: item.product_name?.trim() || item.category?.trim() || 'Item',
            category: item.category?.trim() || null,
            monthlyPrice: parseMoney(item.monthly_price),
            durationMonths: parsePositiveInteger(item.duration_months),
            quantity: parsePositiveInteger(item.quantity) ?? 1,
            imageUrl: product?.image_url ?? null,
        }
    })

    const groupedItems = new Map<string, number>()
    for (const item of items) {
        const label = item.category ?? item.productName
        groupedItems.set(label, (groupedItems.get(label) ?? 0) + item.quantity)
    }

    const fallbackItemsSummary = bundle?.name ?? 'No items captured'
    const itemsSummary = groupedItems.size > 0
        ? [...groupedItems.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([label, qty]) => `${label} x ${qty}`)
            .join(', ')
        : fallbackItemsSummary

    return {
        id: record.id,
        userId: record.user_id,
        bundleId: record.bundle_id,
        status: record.status,
        total: parseMoney(record.monthly_total),
        createdAt: record.created_at,
        startDate: record.start_date,
        endDate: record.end_date,
        itemsSummary,
        items,
        customer: {
            id: profile?.id ?? null,
            name: customerName,
            phoneNumber: profile?.phone_number ?? null,
            jobTitle: profile?.job_title ?? null,
            companyName: company?.company_name ?? null,
            industry: company?.industry ?? null,
            teamSize: company?.team_size ?? null,
            address: company?.address ?? null,
        },
        bundle: {
            id: bundle?.id ?? null,
            name: bundle?.name ?? null,
            description: bundle?.description ?? null,
            imageUrl: bundle?.image_url ?? null,
            monthlyPrice: parseMoney(bundle?.monthly_price),
        },
    }
}

/** GET /api/admin/orders/:id — Get one order for admin */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid order ID format', 400)

        const details = await fetchOrderDetails(uuid)
        if (!details) return errorResponse('Order not found', 404)
        return successResponse(details)
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** PATCH /api/admin/orders/:id — Update order status/details */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid order ID format', 400)

        const body = await request.json()
        const updatePayload: Record<string, unknown> = {}

        if (body?.status !== undefined) {
            const status = normalizeOrderStatus(body.status)
            if (!status) {
                return errorResponse('Invalid status. Must be: active, pending, pending_payment, payment_failed, incomplete, cancelled, or completed', 400)
            }
            updatePayload.status = status
        }

        if (body?.start_date !== undefined) {
            const startDate = parseNullableDate(body.start_date)
            if (startDate === undefined) return errorResponse('start_date must be a valid date or null', 400)
            updatePayload.start_date = startDate
        }

        if (body?.end_date !== undefined) {
            const endDate = parseNullableDate(body.end_date)
            if (endDate === undefined) return errorResponse('end_date must be a valid date or null', 400)
            updatePayload.end_date = endDate
        }

        if (body?.monthly_total !== undefined) {
            if (body.monthly_total === null || body.monthly_total === '') {
                updatePayload.monthly_total = null
            } else {
                const monthlyTotal = Number(body.monthly_total)
                if (!Number.isFinite(monthlyTotal) || monthlyTotal < 0) {
                    return errorResponse('monthly_total must be a number greater than or equal to 0', 400)
                }
                updatePayload.monthly_total = monthlyTotal
            }
        }

        if (Object.keys(updatePayload).length === 0) {
            return errorResponse('No valid fields to update', 400)
        }

        const { data, error } = await supabaseServer
            .from('subscriptions')
            .update(updatePayload)
            .eq('id', uuid)
            .select('id')
            .single()

        if (error || !data) return errorResponse('Order not found or update failed', 404)

        const details = await fetchOrderDetails(uuid)
        if (!details) return errorResponse('Order updated but failed to load details', 500)
        return successResponse(details)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}
