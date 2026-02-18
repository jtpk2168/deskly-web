import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '../../../../../../../lib/apiResponse'
import { supabaseServer } from '../../../../../../../lib/supabaseServer'

export const runtime = 'nodejs'

const STRIPE_API_BASE = 'https://api.stripe.com/v1'
const DEFAULT_BACKFILL_LIMIT = 200
const MAX_BACKFILL_LIMIT = 1000
const STRIPE_PAGE_LIMIT = 100

type SubscriptionReferenceRow = {
    id: string
    provider_subscription_id: string | null
    billing_customer_id: string | null
}

type BillingCustomerReferenceRow = {
    id: string
    provider_customer_id: string
}

function readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null
}

function readNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readBoolean(value: unknown) {
    return typeof value === 'boolean' ? value : null
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value != null ? (value as Record<string, unknown>) : null
}

function parseIsoFromUnixTimestamp(value: number | null) {
    if (value == null) return null
    const parsed = new Date(value * 1000)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function fromMinorUnit(value: number | null) {
    if (value == null) return null
    return Number((value / 100).toFixed(2))
}

function normalizeMirrorStatus(rawStatus: string | null, paid: boolean | null) {
    if (paid === true) return 'paid'

    switch (rawStatus) {
        case 'draft':
            return 'draft'
        case 'open':
            return 'open'
        case 'paid':
            return 'paid'
        case 'void':
            return 'void'
        case 'uncollectible':
            return 'uncollectible'
        default:
            return 'unknown'
    }
}

function resolveInvoicePeriodTimestamps(invoiceRecord: Record<string, unknown>) {
    const directPeriodStart = readNumber(invoiceRecord.period_start)
    const directPeriodEnd = readNumber(invoiceRecord.period_end)

    if (directPeriodStart != null || directPeriodEnd != null) {
        return {
            periodStartAt: parseIsoFromUnixTimestamp(directPeriodStart),
            periodEndAt: parseIsoFromUnixTimestamp(directPeriodEnd),
        }
    }

    const lines = readRecord(invoiceRecord.lines)
    const linesData = Array.isArray(lines?.data) ? lines.data : []
    const firstLine = readRecord(linesData[0])
    const linePeriod = readRecord(firstLine?.period)

    return {
        periodStartAt: parseIsoFromUnixTimestamp(readNumber(linePeriod?.start)),
        periodEndAt: parseIsoFromUnixTimestamp(readNumber(linePeriod?.end)),
    }
}

function parseBackfillLimit(value: unknown) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_BACKFILL_LIMIT
    return Math.min(MAX_BACKFILL_LIMIT, parsed)
}

function parseDryRun(value: unknown) {
    return value === true
}

function requireStripeSecretKey() {
    const key = process.env.STRIPE_SECRET_KEY?.trim()
    if (!key) {
        throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    return key
}

async function stripeGet(path: string, params: URLSearchParams) {
    const secretKey = requireStripeSecretKey()
    const url = `${STRIPE_API_BASE}${path}?${params.toString()}`
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        cache: 'no-store',
    })

    const rawBody = await response.text()
    let parsed: Record<string, unknown> | null = null
    try {
        parsed = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null
    } catch {
        parsed = null
    }

    if (!response.ok) {
        const message =
            typeof parsed?.error === 'object' &&
                parsed.error != null &&
                typeof (parsed.error as { message?: unknown }).message === 'string'
                ? String((parsed.error as { message?: string }).message)
                : `Stripe API request failed (${response.status})`
        throw new Error(message)
    }

    return parsed ?? {}
}

async function fetchStripeInvoices(limit: number) {
    const invoices: Array<Record<string, unknown>> = []
    let startingAfter: string | null = null
    let hasMoreAfterFetch = false

    while (invoices.length < limit) {
        const remaining = limit - invoices.length
        const pageLimit = Math.min(STRIPE_PAGE_LIMIT, remaining)
        const params = new URLSearchParams()
        params.set('limit', String(pageLimit))
        if (startingAfter) params.set('starting_after', startingAfter)

        const stripeResponse = await stripeGet('/invoices', params)
        const pageData = Array.isArray(stripeResponse.data) ? stripeResponse.data : []

        if (pageData.length === 0) {
            hasMoreAfterFetch = false
            break
        }

        for (const row of pageData) {
            const record = readRecord(row)
            if (record) invoices.push(record)
        }

        const hasMore = readBoolean(stripeResponse.has_more) === true
        if (!hasMore || invoices.length >= limit) {
            hasMoreAfterFetch = hasMore
            break
        }

        const last = readRecord(pageData[pageData.length - 1])
        const lastInvoiceId = readString(last?.id)
        if (!lastInvoiceId) {
            hasMoreAfterFetch = false
            break
        }
        startingAfter = lastInvoiceId
    }

    return {
        invoices,
        hasMoreAfterFetch,
    }
}

function normalizeUuid(value: string | null) {
    if (!value) return null
    const normalized = value.trim()
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
        ? normalized
        : null
}

type UpsertInvoiceRow = {
    provider: 'stripe'
    provider_invoice_id: string
    provider_subscription_id: string | null
    billing_customer_id: string | null
    subscription_id: string | null
    invoice_number: string | null
    status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible' | 'unknown'
    currency: string
    subtotal_amount: number | null
    tax_amount: number | null
    total_amount: number | null
    amount_paid: number | null
    amount_due: number | null
    hosted_invoice_url: string | null
    invoice_pdf: string | null
    payment_intent_id: string | null
    due_date: string | null
    paid_at: string | null
    period_start_at: string | null
    period_end_at: string | null
    raw_payload: Record<string, unknown>
    updated_at: string
}

function chunkArray<T>(items: T[], size: number) {
    const chunks: T[][] = []
    for (let start = 0; start < items.length; start += size) {
        chunks.push(items.slice(start, start + size))
    }
    return chunks
}

/** POST /api/admin/billing/invoices/backfill — Pull historical Stripe invoices and mirror them locally */
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const requestedLimit = parseBackfillLimit(body.limit)
        const dryRun = parseDryRun(body.dry_run)

        const { invoices, hasMoreAfterFetch } = await fetchStripeInvoices(requestedLimit)
        if (invoices.length === 0) {
            return successResponse({
                provider: 'stripe',
                dry_run: dryRun,
                requested_limit: requestedLimit,
                fetched_count: 0,
                mirrored_count: 0,
                linked_subscription_count: 0,
                linked_billing_customer_count: 0,
                unresolved_invoice_ids: [],
                has_more_available: false,
            })
        }

        const providerSubscriptionIds = new Set<string>()
        const providerCustomerIds = new Set<string>()
        const internalSubscriptionIds = new Set<string>()

        for (const invoice of invoices) {
            const providerSubscriptionId = readString(invoice.subscription)
            if (providerSubscriptionId) providerSubscriptionIds.add(providerSubscriptionId)

            const providerCustomerId = readString(invoice.customer)
            if (providerCustomerId) providerCustomerIds.add(providerCustomerId)

            const metadata = readRecord(invoice.metadata)
            const internalSubscriptionId = normalizeUuid(readString(metadata?.internal_subscription_id))
            if (internalSubscriptionId) internalSubscriptionIds.add(internalSubscriptionId)
        }

        const subscriptionsByProviderSubscriptionId = new Map<string, SubscriptionReferenceRow>()
        const subscriptionsById = new Map<string, SubscriptionReferenceRow>()
        const billingCustomersByProviderCustomerId = new Map<string, BillingCustomerReferenceRow>()

        if (providerSubscriptionIds.size > 0) {
            const { data, error } = await supabaseServer
                .from('subscriptions')
                .select('id, provider_subscription_id, billing_customer_id')
                .eq('billing_provider', 'stripe')
                .in('provider_subscription_id', Array.from(providerSubscriptionIds))

            if (error) {
                return errorResponse(`Failed to load provider subscription references: ${error.message}`, 500)
            }

            for (const row of (data ?? []) as SubscriptionReferenceRow[]) {
                if (row.provider_subscription_id) {
                    subscriptionsByProviderSubscriptionId.set(row.provider_subscription_id, row)
                }
                subscriptionsById.set(row.id, row)
            }
        }

        if (internalSubscriptionIds.size > 0) {
            const { data, error } = await supabaseServer
                .from('subscriptions')
                .select('id, provider_subscription_id, billing_customer_id')
                .in('id', Array.from(internalSubscriptionIds))

            if (error) {
                return errorResponse(`Failed to load internal subscription references: ${error.message}`, 500)
            }

            for (const row of (data ?? []) as SubscriptionReferenceRow[]) {
                subscriptionsById.set(row.id, row)
                if (row.provider_subscription_id) {
                    subscriptionsByProviderSubscriptionId.set(row.provider_subscription_id, row)
                }
            }
        }

        if (providerCustomerIds.size > 0) {
            const { data, error } = await supabaseServer
                .from('billing_customers')
                .select('id, provider_customer_id')
                .eq('provider', 'stripe')
                .in('provider_customer_id', Array.from(providerCustomerIds))

            if (error) {
                return errorResponse(`Failed to load billing customer references: ${error.message}`, 500)
            }

            for (const row of (data ?? []) as BillingCustomerReferenceRow[]) {
                billingCustomersByProviderCustomerId.set(row.provider_customer_id, row)
            }
        }

        const unresolvedInvoiceIds: string[] = []
        const upsertRows: UpsertInvoiceRow[] = []
        let linkedSubscriptionCount = 0
        let linkedBillingCustomerCount = 0

        for (const invoice of invoices) {
            const providerInvoiceId = readString(invoice.id)
            if (!providerInvoiceId) continue

            const metadata = readRecord(invoice.metadata)
            const internalSubscriptionId = normalizeUuid(readString(metadata?.internal_subscription_id))
            const providerSubscriptionId = readString(invoice.subscription)
            const providerCustomerId = readString(invoice.customer)

            const internalSubscriptionRef = internalSubscriptionId
                ? subscriptionsById.get(internalSubscriptionId) ?? null
                : null
            const providerSubscriptionRef = providerSubscriptionId
                ? subscriptionsByProviderSubscriptionId.get(providerSubscriptionId) ?? null
                : null
            const subscriptionRef = internalSubscriptionRef ?? providerSubscriptionRef

            const billingCustomerFromProviderLookup = providerCustomerId
                ? billingCustomersByProviderCustomerId.get(providerCustomerId) ?? null
                : null
            const billingCustomerId = subscriptionRef?.billing_customer_id ?? billingCustomerFromProviderLookup?.id ?? null

            if (subscriptionRef?.id) linkedSubscriptionCount += 1
            if (billingCustomerId) linkedBillingCustomerCount += 1
            if (!subscriptionRef?.id) unresolvedInvoiceIds.push(providerInvoiceId)

            const subtotalMinor = readNumber(invoice.subtotal)
            const totalMinor = readNumber(invoice.total)
            const explicitTaxMinor = readNumber(invoice.tax) ?? readNumber(invoice.amount_tax)
            const computedTaxMinor =
                explicitTaxMinor != null
                    ? explicitTaxMinor
                    : subtotalMinor != null && totalMinor != null
                        ? totalMinor - subtotalMinor
                        : null

            const statusTransitions = readRecord(invoice.status_transitions)
            const { periodStartAt, periodEndAt } = resolveInvoicePeriodTimestamps(invoice)

            upsertRows.push({
                provider: 'stripe',
                provider_invoice_id: providerInvoiceId,
                provider_subscription_id: providerSubscriptionId,
                billing_customer_id: billingCustomerId,
                subscription_id: subscriptionRef?.id ?? null,
                invoice_number: readString(invoice.number),
                status: normalizeMirrorStatus(readString(invoice.status), readBoolean(invoice.paid)),
                currency: readString(invoice.currency)?.toLowerCase() ?? 'myr',
                subtotal_amount: fromMinorUnit(subtotalMinor),
                tax_amount: fromMinorUnit(computedTaxMinor),
                total_amount: fromMinorUnit(totalMinor),
                amount_paid: fromMinorUnit(readNumber(invoice.amount_paid)),
                amount_due: fromMinorUnit(readNumber(invoice.amount_due)),
                hosted_invoice_url: readString(invoice.hosted_invoice_url),
                invoice_pdf: readString(invoice.invoice_pdf),
                payment_intent_id: readString(invoice.payment_intent),
                due_date: parseIsoFromUnixTimestamp(readNumber(invoice.due_date)),
                paid_at: parseIsoFromUnixTimestamp(readNumber(statusTransitions?.paid_at)),
                period_start_at: periodStartAt,
                period_end_at: periodEndAt,
                raw_payload: invoice,
                updated_at: new Date().toISOString(),
            })
        }

        if (!dryRun && upsertRows.length > 0) {
            const chunks = chunkArray(upsertRows, 200)
            for (const chunk of chunks) {
                const { error } = await supabaseServer
                    .from('billing_invoices')
                    .upsert(chunk, { onConflict: 'provider,provider_invoice_id' })

                if (error) {
                    return errorResponse(`Failed to mirror backfilled invoices: ${error.message}`, 500)
                }
            }
        }

        return successResponse({
            provider: 'stripe',
            dry_run: dryRun,
            requested_limit: requestedLimit,
            fetched_count: invoices.length,
            mirrored_count: upsertRows.length,
            linked_subscription_count: linkedSubscriptionCount,
            linked_billing_customer_count: linkedBillingCustomerCount,
            unresolved_invoice_ids: unresolvedInvoiceIds.slice(0, 20),
            unresolved_total: unresolvedInvoiceIds.length,
            has_more_available: hasMoreAfterFetch,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error'
        return errorResponse(message, 500)
    }
}
