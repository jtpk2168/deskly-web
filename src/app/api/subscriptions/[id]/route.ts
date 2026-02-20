import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../../lib/apiResponse'
import { normalizeBillingStatus } from '@/lib/billing/types'
import { BILLING_FIELDS_READONLY_ERROR, hasLockedBillingFieldEdits } from '@/lib/billing/manualEditGuard'

type RouteParams = { params: Promise<{ id: string }> }

type SubscriptionItemRecord = {
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

type BillingInvoiceRecord = {
    id: string
    provider_invoice_id: string
    invoice_number: string | null
    status: string
    currency: string
    subtotal_amount: number | string | null
    tax_amount: number | string | null
    total_amount: number | string | null
    amount_paid: number | string | null
    amount_due: number | string | null
    hosted_invoice_url: string | null
    invoice_pdf: string | null
    due_date: string | null
    paid_at: string | null
    period_start_at: string | null
    period_end_at: string | null
    created_at: string
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

/** GET /api/subscriptions/:id — Get subscription details */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid subscription ID format', 400)

        const { data, error } = await supabaseServer
            .from('subscriptions')
            .select('*, bundles(*)')
            .eq('id', uuid)
            .single()

        if (error || !data) return errorResponse('Subscription not found', 404)

        let itemRows: SubscriptionItemRecord[] = []
        const { data: itemData, error: itemError } = await supabaseServer
            .from('subscription_items')
            .select(`
                product_name,
                category,
                monthly_price,
                duration_months,
                quantity,
                products (
                    image_url
                )
            `)
            .eq('subscription_id', uuid)
            .order('created_at', { ascending: true })

        // Fail open: details page should still load even when order-item rows are unavailable.
        if (!itemError) {
            itemRows = (itemData ?? []) as SubscriptionItemRecord[]
        }

        const subscriptionItems = itemRows.map((item) => {
            const product = unwrapSingle(item.products)
            return {
                product_name: item.product_name?.trim() || item.category?.trim() || 'Item',
                category: item.category?.trim() || null,
                monthly_price: parseMoney(item.monthly_price),
                duration_months: parsePositiveInteger(item.duration_months),
                quantity: parsePositiveInteger(item.quantity) ?? 1,
                image_url: product?.image_url ?? null,
            }
        })

        let invoiceRows: BillingInvoiceRecord[] = []
        const { data: invoiceData, error: invoiceError } = await supabaseServer
            .from('billing_invoices')
            .select(`
                id,
                provider_invoice_id,
                invoice_number,
                status,
                currency,
                subtotal_amount,
                tax_amount,
                total_amount,
                amount_paid,
                amount_due,
                hosted_invoice_url,
                invoice_pdf,
                due_date,
                paid_at,
                period_start_at,
                period_end_at,
                created_at
            `)
            .eq('subscription_id', uuid)
            .order('created_at', { ascending: false })

        // Fail open: order detail remains available even if invoice mirror rows are unavailable.
        if (!invoiceError) {
            invoiceRows = (invoiceData ?? []) as BillingInvoiceRecord[]
        }

        const normalizedStatus = normalizeBillingStatus(data.status)

        const billingInvoices = invoiceRows.map((invoice) => ({
            id: invoice.id,
            provider_invoice_id: invoice.provider_invoice_id,
            invoice_number: invoice.invoice_number,
            status: invoice.status,
            currency: invoice.currency,
            subtotal_amount: parseMoney(invoice.subtotal_amount),
            tax_amount: parseMoney(invoice.tax_amount),
            total_amount: parseMoney(invoice.total_amount),
            amount_paid: parseMoney(invoice.amount_paid),
            amount_due: parseMoney(invoice.amount_due),
            hosted_invoice_url: invoice.hosted_invoice_url,
            invoice_pdf: invoice.invoice_pdf,
            due_date: invoice.due_date,
            paid_at: invoice.paid_at,
            period_start_at: invoice.period_start_at,
            period_end_at: invoice.period_end_at,
            created_at: invoice.created_at,
        }))

        return successResponse({
            ...data,
            status: normalizedStatus,
            billing_status: normalizedStatus,
            subscription_items: subscriptionItems,
            billing_invoices: billingInvoices,
        })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** PATCH /api/subscriptions/:id — Billing fields are Stripe-managed and cannot be edited manually */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid subscription ID format', 400)

        const body = await request.json()
        if (hasLockedBillingFieldEdits(body)) {
            return errorResponse(BILLING_FIELDS_READONLY_ERROR, 400)
        }

        return errorResponse('No editable fields are available on this endpoint.', 400)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}
