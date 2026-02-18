'use client'

import { useCallback, useEffect, useState } from 'react'
import { DatabaseZap, ExternalLink, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { PaginationControls } from '@/components/ui/PaginationControls'
import {
    backfillBillingInvoices,
    BillingInvoice,
    BillingInvoiceBackfillResult,
    BillingInvoiceProvider,
    BillingInvoiceStatus,
    getBillingInvoices,
} from '@/lib/api'
import type { ReactNode } from 'react'

const INVOICE_STATUS_FILTER_OPTIONS: Array<{ value: 'all' | BillingInvoiceStatus; label: string }> = [
    { value: 'all', label: 'All Statuses' },
    { value: 'paid', label: 'Paid' },
    { value: 'open', label: 'Open' },
    { value: 'draft', label: 'Draft' },
    { value: 'payment_failed', label: 'Payment Failed' },
    { value: 'void', label: 'Void' },
    { value: 'uncollectible', label: 'Uncollectible' },
    { value: 'unknown', label: 'Unknown' },
]

const INVOICE_PROVIDER_FILTER_OPTIONS: Array<{ value: 'all' | BillingInvoiceProvider; label: string }> = [
    { value: 'all', label: 'All Providers' },
    { value: 'stripe', label: 'Stripe' },
    { value: 'mock', label: 'Mock' },
]

function formatDateTime(value: string | null) {
    if (!value) return '-'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '-'
    return parsed.toLocaleString()
}

function formatCurrency(value: number | null, currency: string) {
    if (value == null) return '-'
    return `${currency.toUpperCase()} ${value.toFixed(2)}`
}

function formatInvoicePeriod(periodStartAt: string | null, periodEndAt: string | null) {
    if (!periodStartAt && !periodEndAt) return '-'

    const start = formatDateTime(periodStartAt)
    const end = formatDateTime(periodEndAt)

    if (start === '-' && end === '-') return '-'
    if (start === end) return start
    if (start === '-') return end
    if (end === '-') return start

    return `${start} -> ${end}`
}

function getProviderVariant(provider: string): 'default' | 'success' | 'warning' | 'error' | 'outline' {
    if (provider === 'stripe') return 'outline'
    if (provider === 'mock') return 'default'
    return 'default'
}

function getInvoiceStatusVariant(status: BillingInvoiceStatus): 'default' | 'success' | 'warning' | 'error' | 'outline' {
    if (status === 'paid') return 'success'
    if (status === 'open' || status === 'draft') return 'warning'
    if (status === 'payment_failed' || status === 'void' || status === 'uncollectible') return 'error'
    return 'default'
}

function shorten(value: string | null, size = 12) {
    if (!value) return '-'
    if (value.length <= size) return value
    return `${value.slice(0, size)}...`
}

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<BillingInvoice[]>([])
    const [invoicesLoading, setInvoicesLoading] = useState(true)
    const [invoicesError, setInvoicesError] = useState<string | null>(null)
    const [invoicesPage, setInvoicesPage] = useState(1)
    const [invoicesLimit, setInvoicesLimit] = useState(10)
    const [invoicesTotal, setInvoicesTotal] = useState(0)
    const [invoicesStatusFilter, setInvoicesStatusFilter] = useState<'all' | BillingInvoiceStatus>('all')
    const [invoicesProviderFilter, setInvoicesProviderFilter] = useState<'all' | BillingInvoiceProvider>('all')
    const [invoicesSearch, setInvoicesSearch] = useState('')
    const [backfillLimit, setBackfillLimit] = useState(200)
    const [isBackfilling, setIsBackfilling] = useState(false)
    const [backfillResult, setBackfillResult] = useState<BillingInvoiceBackfillResult | null>(null)
    const [backfillError, setBackfillError] = useState<string | null>(null)
    const hasCustomFilters =
        invoicesSearch.trim().length > 0 ||
        invoicesProviderFilter !== 'all' ||
        invoicesStatusFilter !== 'all'

    const loadInvoices = useCallback(async () => {
        setInvoicesLoading(true)
        setInvoicesError(null)

        try {
            const response = await getBillingInvoices({
                page: invoicesPage,
                limit: invoicesLimit,
                status: invoicesStatusFilter,
                provider: invoicesProviderFilter,
                search: invoicesSearch.trim() || undefined,
            })
            setInvoices(response.items)
            setInvoicesTotal(response.total)
        } catch (error) {
            setInvoicesError(error instanceof Error ? error.message : 'Failed to load mirrored invoices')
        } finally {
            setInvoicesLoading(false)
        }
    }, [invoicesLimit, invoicesPage, invoicesProviderFilter, invoicesSearch, invoicesStatusFilter])

    useEffect(() => {
        void loadInvoices()
    }, [loadInvoices])

    const handleBackfill = useCallback(async () => {
        setIsBackfilling(true)
        setBackfillError(null)
        setBackfillResult(null)

        try {
            const result = await backfillBillingInvoices({
                limit: backfillLimit,
                dry_run: false,
            })
            setBackfillResult(result)
            await loadInvoices()
        } catch (error) {
            setBackfillError(error instanceof Error ? error.message : 'Failed to backfill historical invoices')
        } finally {
            setIsBackfilling(false)
        }
    }, [backfillLimit, loadInvoices])

    const resetInvoiceFilters = () => {
        setInvoicesSearch('')
        setInvoicesProviderFilter('all')
        setInvoicesStatusFilter('all')
        setInvoicesPage(1)
    }

    const invoiceColumns: Array<{
        header: string
        accessorKey?: keyof BillingInvoice
        cell?: (row: BillingInvoice) => ReactNode
    }> = [
        {
            header: 'Provider',
            accessorKey: 'provider',
            cell: (row) => <Badge variant={getProviderVariant(row.provider)}>{row.provider}</Badge>,
        },
        {
            header: 'Invoice',
            accessorKey: 'provider_invoice_id',
            cell: (row) => (
                <div className="space-y-1">
                    <div className="font-mono text-xs text-text-light" title={row.provider_invoice_id}>
                        {shorten(row.provider_invoice_id, 22)}
                    </div>
                    <div className="text-xs text-subtext-light">
                        {row.invoice_number?.trim() || '-'}
                    </div>
                </div>
            ),
        },
        {
            header: 'Subscription',
            accessorKey: 'subscription_id',
            cell: (row) => (
                <span className="font-mono text-xs" title={row.subscription_id ?? ''}>
                    {shorten(row.subscription_id, 12)}
                </span>
            ),
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: (row) => <Badge variant={getInvoiceStatusVariant(row.status)}>{row.status}</Badge>,
        },
        {
            header: 'Period',
            accessorKey: 'period_start_at',
            cell: (row) => {
                const period = formatInvoicePeriod(row.period_start_at, row.period_end_at)
                return (
                    <span className="text-xs text-text-light">
                        {period}
                    </span>
                )
            },
        },
        {
            header: 'Total',
            accessorKey: 'total_amount',
            cell: (row) => formatCurrency(row.total_amount, row.currency),
        },
        {
            header: 'Tax',
            accessorKey: 'tax_amount',
            cell: (row) => formatCurrency(row.tax_amount, row.currency),
        },
        {
            header: 'Due',
            accessorKey: 'amount_due',
            cell: (row) => formatCurrency(row.amount_due, row.currency),
        },
        {
            header: 'Issued',
            accessorKey: 'created_at',
            cell: (row) => formatDateTime(row.created_at),
        },
        {
            header: 'Links',
            accessorKey: 'hosted_invoice_url',
            cell: (row) => {
                const links = [
                    row.hosted_invoice_url
                        ? (
                            <a
                                key="hosted"
                                href={row.hosted_invoice_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                                Hosted <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        )
                        : null,
                    row.invoice_pdf
                        ? (
                            <a
                                key="pdf"
                                href={row.invoice_pdf}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                                PDF <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        )
                        : null,
                ].filter(Boolean)

                if (links.length === 0) return '-'
                return <div className="flex flex-col gap-1">{links}</div>
            },
        },
    ]

    return (
        <div className="space-y-6">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Billing</p>
                            <h1 className="mt-1 text-2xl font-bold text-text-light">Invoices</h1>
                            <p className="mt-1 text-sm text-subtext-light">Read-only mirrored invoice records from billing providers.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadInvoices()}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-text-light transition hover:bg-slate-50"
                            disabled={invoicesLoading}
                        >
                            <RefreshCw className={`h-4 w-4 ${invoicesLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>

                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-text-light">Backfill Historical Invoices</h2>
                        <p className="mt-1 text-sm text-subtext-light">
                            Import invoices created before webhook mirroring was enabled. Backfill uses your configured provider and appends invoice records safely.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-text-light">
                            Fetch
                            <input
                                type="number"
                                min={1}
                                max={1000}
                                value={backfillLimit}
                                onChange={(event) => {
                                    const parsed = Number(event.target.value)
                                    if (!Number.isInteger(parsed) || parsed <= 0) {
                                        setBackfillLimit(1)
                                        return
                                    }
                                    setBackfillLimit(Math.min(1000, parsed))
                                }}
                                className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => void handleBackfill()}
                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isBackfilling}
                        >
                            <DatabaseZap className={`h-4 w-4 ${isBackfilling ? 'animate-spin' : ''}`} />
                            {isBackfilling ? 'Backfilling...' : 'Backfill Old Invoices'}
                        </button>
                    </div>
                </div>

                {backfillError ? (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{backfillError}</div>
                ) : null}

                {backfillResult ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                        Imported {backfillResult.mirrored_count} of {backfillResult.fetched_count} fetched invoice(s).
                        {' '}Linked subscriptions: {backfillResult.linked_subscription_count}.
                        {' '}Unresolved: {backfillResult.unresolved_total}.
                        {backfillResult.has_more_available ? ' More historical invoices are available. Increase fetch size and run again.' : ''}
                    </div>
                ) : null}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
                    <input
                        value={invoicesSearch}
                        onChange={(event) => {
                            setInvoicesSearch(event.target.value)
                            setInvoicesPage(1)
                        }}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="Search invoice id, number, subscription..."
                    />
                    <select
                        value={invoicesProviderFilter}
                        onChange={(event) => {
                            setInvoicesProviderFilter(event.target.value as 'all' | BillingInvoiceProvider)
                            setInvoicesPage(1)
                        }}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                        {INVOICE_PROVIDER_FILTER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <select
                        value={invoicesStatusFilter}
                        onChange={(event) => {
                            setInvoicesStatusFilter(event.target.value as 'all' | BillingInvoiceStatus)
                            setInvoicesPage(1)
                        }}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                        {INVOICE_STATUS_FILTER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={resetInvoiceFilters}
                        disabled={!hasCustomFilters}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-text-light transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Reset
                    </button>
                </div>

                {invoicesError ? (
                    <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{invoicesError}</div>
                ) : null}
                {invoicesLoading ? (
                    <p className="mb-3 text-sm text-subtext-light">Loading mirrored invoices...</p>
                ) : null}

                <div className="space-y-4">
                    <DataTable columns={invoiceColumns} data={invoices} />
                    <PaginationControls
                        page={invoicesPage}
                        limit={invoicesLimit}
                        total={invoicesTotal}
                        loading={invoicesLoading}
                        onPageChange={setInvoicesPage}
                        onLimitChange={(nextLimit) => {
                            setInvoicesLimit(nextLimit)
                            setInvoicesPage(1)
                        }}
                    />
                </div>
            </section>
        </div>
    )
}
