import { NextRequest } from 'next/server'
import { parsePaginationParams } from '@/lib/pagination'
import { errorResponse, successResponse } from '../../../../../../lib/apiResponse'
import { supabaseServer } from '../../../../../../lib/supabaseServer'

const INVOICE_STATUSES = ['draft', 'open', 'paid', 'payment_failed', 'void', 'uncollectible', 'unknown'] as const
const INVOICE_PROVIDERS = ['stripe', 'mock'] as const

type BillingInvoiceStatus = (typeof INVOICE_STATUSES)[number]
type BillingInvoiceProvider = (typeof INVOICE_PROVIDERS)[number]

type BillingInvoiceRecord = {
    id: string
    provider: BillingInvoiceProvider
    provider_invoice_id: string
    provider_subscription_id: string | null
    subscription_id: string | null
    invoice_number: string | null
    status: BillingInvoiceStatus
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

function normalizeStatus(value: string | null): BillingInvoiceStatus | null {
    const normalized = (value ?? '').trim().toLowerCase()
    if (!normalized) return null
    return INVOICE_STATUSES.includes(normalized as BillingInvoiceStatus)
        ? (normalized as BillingInvoiceStatus)
        : null
}

function normalizeProvider(value: string | null): BillingInvoiceProvider | null {
    const normalized = (value ?? '').trim().toLowerCase()
    if (!normalized) return null
    return INVOICE_PROVIDERS.includes(normalized as BillingInvoiceProvider)
        ? (normalized as BillingInvoiceProvider)
        : null
}

function normalizeSearch(value: string | null) {
    const normalized = (value ?? '').trim()
    if (!normalized) return null
    return normalized.replace(/,/g, ' ')
}

function parseMoney(value: number | string | null | undefined) {
    if (value == null) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

/** GET /api/admin/billing/invoices — List mirrored billing invoices */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const { page, limit, from, to } = parsePaginationParams(searchParams)
        const status = normalizeStatus(searchParams.get('status'))
        const provider = normalizeProvider(searchParams.get('provider'))
        const search = normalizeSearch(searchParams.get('search'))

        let query = supabaseServer
            .from('billing_invoices')
            .select(`
                id,
                provider,
                provider_invoice_id,
                provider_subscription_id,
                subscription_id,
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
            `, { count: 'exact' })
            .order('created_at', { ascending: false })

        if (status) query = query.eq('status', status)
        if (provider) query = query.eq('provider', provider)
        if (search) {
            query = query.or(`provider_invoice_id.ilike.%${search}%,invoice_number.ilike.%${search}%,subscription_id.ilike.%${search}%`)
        }

        const { data, error, count } = await query.range(from, to)
        if (error) return errorResponse(error.message, 500)

        const invoices = ((data ?? []) as BillingInvoiceRecord[]).map((row) => ({
            ...row,
            subtotal_amount: parseMoney(row.subtotal_amount),
            tax_amount: parseMoney(row.tax_amount),
            total_amount: parseMoney(row.total_amount),
            amount_paid: parseMoney(row.amount_paid),
            amount_due: parseMoney(row.amount_due),
        }))

        return successResponse(invoices, 200, {
            page,
            limit,
            total: count ?? 0,
        })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}
