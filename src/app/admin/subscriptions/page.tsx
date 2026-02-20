'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Eye, X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { PaginationControls } from '@/components/ui/PaginationControls'
import {
    AdminOrderSortColumn,
    AdminOrderStatus,
    AdminSubscriptionAction,
    AdminSubscription,
    AdminSubscriptionDetail,
    getAdminSubscription,
    getAdminSubscriptions,
    runAdminSubscriptionAction,
} from '@/lib/api'

function getStatusVariant(status: string | null): 'default' | 'success' | 'warning' | 'error' | 'outline' {
    const normalizedStatus = status?.toLowerCase()
    if (normalizedStatus === 'active') return 'success'
    if (normalizedStatus === 'pending_payment') return 'warning'
    if (normalizedStatus === 'payment_failed') return 'error'
    if (normalizedStatus === 'cancelled') return 'error'
    return 'default'
}

function formatCurrency(value: number | null) {
    return `RM ${value?.toFixed(2) ?? '0.00'}`
}

function formatCurrencyOrDash(value: number | null) {
    if (value == null) return '-'
    return formatCurrency(value)
}

function formatDate(value: string | null) {
    if (!value) return '-'
    return new Date(value).toLocaleDateString()
}

function formatAddress(value: string | null) {
    if (!value || value.trim().length === 0) return '-'
    return value
}

function formatId(value: string) {
    const normalized = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    return normalized.slice(0, 8)
}

const STATUS_FILTER_OPTIONS: Array<{ value: 'all' | AdminOrderStatus; label: string }> = [
    { value: 'all', label: 'All Status' },
    { value: 'pending_payment', label: 'Pending Payment' },
    { value: 'payment_failed', label: 'Payment Failed' },
    { value: 'active', label: 'Active' },
    { value: 'cancelled', label: 'Cancelled' },
]

function getSortIndicator(activeSortBy: AdminOrderSortColumn, activeSortDir: 'asc' | 'desc', column: AdminOrderSortColumn) {
    if (activeSortBy !== column) return '↕'
    return activeSortDir === 'asc' ? '↑' : '↓'
}

export default function SubscriptionsPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(10)
    const [total, setTotal] = useState(0)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | AdminOrderStatus>('all')
    const [sortBy, setSortBy] = useState<AdminOrderSortColumn>('created_at')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
    const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string | null>(null)
    const [selectedSubscription, setSelectedSubscription] = useState<AdminSubscriptionDetail | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [billingActionLoading, setBillingActionLoading] = useState<AdminSubscriptionAction | null>(null)
    const [detailError, setDetailError] = useState<string | null>(null)
    const [userIdFilter, setUserIdFilter] = useState<string | null>(() => searchParams.get('user_id')?.trim() || null)
    const [customerFilterLabel, setCustomerFilterLabel] = useState<string | null>(() => searchParams.get('customer')?.trim() || null)
    const hasCustomFilters = search.trim().length > 0 || statusFilter !== 'all' || sortBy !== 'created_at' || sortDir !== 'desc'

    useEffect(() => {
        const nextUserId = searchParams.get('user_id')?.trim() ?? ''
        const nextCustomerLabel = searchParams.get('customer')?.trim() ?? ''
        setUserIdFilter(nextUserId || null)
        setCustomerFilterLabel(nextCustomerLabel || null)
    }, [searchParams])

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await getAdminSubscriptions({
                page,
                limit,
                search: search.trim() || undefined,
                status: statusFilter,
                userId: userIdFilter ?? undefined,
                sortBy,
                sortDir,
            })
            setSubscriptions(result.items)
            setTotal(result.total)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load subscriptions')
        } finally {
            setLoading(false)
        }
    }, [limit, page, search, sortBy, sortDir, statusFilter, userIdFilter])

    useEffect(() => {
        loadData()
    }, [loadData])

    const closeDetails = useCallback(() => {
        setSelectedSubscriptionId(null)
        setSelectedSubscription(null)
        setDetailLoading(false)
        setBillingActionLoading(null)
        setDetailError(null)
    }, [])

    const openDetails = useCallback(async (subscriptionId: string) => {
        setSelectedSubscriptionId(subscriptionId)
        setSelectedSubscription(null)
        setBillingActionLoading(null)
        setDetailError(null)
        setDetailLoading(true)
        try {
            const details = await getAdminSubscription(subscriptionId)
            setSelectedSubscription(details)
        } catch (loadError) {
            setDetailError(loadError instanceof Error ? loadError.message : 'Failed to load subscription details')
        } finally {
            setDetailLoading(false)
        }
    }, [])

    const executeBillingAction = useCallback(async (action: AdminSubscriptionAction) => {
        if (!selectedSubscriptionId || !selectedSubscription) return
        const actionLabel = action === 'cancel_now' ? 'cancel now' : 'cancel at period end'
        const confirmed = confirm(`Are you sure you want to ${actionLabel} for this Stripe subscription?`)
        if (!confirmed) return

        setBillingActionLoading(action)
        setDetailError(null)

        try {
            await runAdminSubscriptionAction(selectedSubscriptionId, action)
            const [refreshedDetails] = await Promise.all([
                getAdminSubscription(selectedSubscriptionId),
                loadData(),
            ])
            setSelectedSubscription(refreshedDetails)
        } catch (actionError) {
            setDetailError(actionError instanceof Error ? actionError.message : 'Failed to run billing action')
        } finally {
            setBillingActionLoading(null)
        }
    }, [
        loadData,
        selectedSubscription,
        selectedSubscriptionId,
    ])

    const handleInlineSort = useCallback((column: AdminOrderSortColumn) => {
        setPage(1)
        if (sortBy === column) {
            setSortDir((previous) => (previous === 'asc' ? 'desc' : 'asc'))
            return
        }
        setSortBy(column)
        setSortDir('asc')
    }, [sortBy])

    const columns: Array<{
        header: ReactNode
        accessorKey?: keyof AdminSubscription
        cell?: (row: AdminSubscription) => ReactNode
    }> = [
        {
            header: 'Subscription ID',
            accessorKey: 'id',
            cell: (row) => (
                <span className="font-semibold tracking-wide text-text-light">{formatId(row.id)}</span>
            ),
        },
        { header: 'Customer', accessorKey: 'customer' },
        { header: 'Items', accessorKey: 'items' },
        {
            header: (
                <button type="button" onClick={() => handleInlineSort('monthly_total')} className="inline-flex items-center gap-1">
                    MONTHLY RATE {getSortIndicator(sortBy, sortDir, 'monthly_total')}
                </button>
            ),
            accessorKey: 'total',
            cell: (row) => formatCurrency(row.total),
        },
        {
            header: (
                <button type="button" onClick={() => handleInlineSort('created_at')} className="inline-flex items-center gap-1">
                    DATE {getSortIndicator(sortBy, sortDir, 'created_at')}
                </button>
            ),
            accessorKey: 'date',
        },
        {
            header: (
                <button type="button" onClick={() => handleInlineSort('status')} className="inline-flex items-center gap-1">
                    BILLING STATUS {getSortIndicator(sortBy, sortDir, 'status')}
                </button>
            ),
            accessorKey: 'status',
            cell: (row) => <Badge variant={getStatusVariant(row.billing_status)}>{row.billing_status ?? '-'}</Badge>,
        },
    ]

    const actions = (row: AdminSubscription) => (
        <div className="flex items-center justify-end gap-2">
            <button
                type="button"
                onClick={() => void openDetails(row.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-subtext-light transition hover:border-primary/40 hover:text-primary"
                aria-label={`View subscription ${formatId(row.id)}`}
            >
                <Eye className="h-4 w-4" />
            </button>
        </div>
    )

    return (
        <div className="space-y-6">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Subscriptions</p>
                            <h1 className="mt-1 text-2xl font-bold text-text-light">Billing Subscriptions</h1>
                            <p className="mt-1 text-sm text-subtext-light">Review Stripe-synced billing state and run safe billing actions.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadData()}
                            disabled={loading}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            Refresh
                        </button>
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Filters</p>
                    <p className="mt-1 text-sm text-subtext-light">Search by subscription ID, customer, items, and billing status.</p>
                </div>

                {userIdFilter ? (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-sm text-text-light">
                            Showing subscriptions for <span className="font-semibold">{customerFilterLabel || userIdFilter}</span>
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                const nextParams = new URLSearchParams(searchParams.toString())
                                nextParams.delete('user_id')
                                nextParams.delete('customer')
                                const qs = nextParams.toString()
                                router.replace(`/admin/subscriptions${qs ? `?${qs}` : ''}`)
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-text-light transition hover:bg-slate-50"
                        >
                            Show all customers
                        </button>
                    </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value)
                            setPage(1)
                        }}
                        placeholder={userIdFilter ? 'Search this customer subscriptions...' : 'Search subscription ID, customer, items...'}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <select
                        value={statusFilter}
                        onChange={(event) => {
                            const nextStatus = event.target.value as 'all' | AdminOrderStatus
                            setStatusFilter(nextStatus)
                            setPage(1)
                        }}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                        {STATUS_FILTER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => {
                            setSearch('')
                            setStatusFilter('all')
                            setSortBy('created_at')
                            setSortDir('desc')
                            setPage(1)
                        }}
                        disabled={!hasCustomFilters}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-text-light transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Reset Filters
                    </button>
                </div>
            </section>

            {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-subtext-light shadow-sm">
                    Loading subscriptions...
                </div>
            ) : error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            ) : (
                <div className="space-y-4">
                    <DataTable
                        columns={columns}
                        data={subscriptions}
                        actions={actions}
                    />
                    <PaginationControls
                        page={page}
                        limit={limit}
                        total={total}
                        loading={loading}
                        onPageChange={setPage}
                        onLimitChange={(nextLimit) => {
                            setLimit(nextLimit)
                            setPage(1)
                        }}
                    />
                </div>
            )}

            {selectedSubscriptionId && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/55 p-4 backdrop-blur-sm md:p-8">
                    <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-subtext-light">
                                        Subscription Details
                                    </p>
                                    <h2 className="mt-1 text-3xl font-bold tracking-tight text-text-light">
                                        #{formatId(selectedSubscriptionId)}
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeDetails}
                                    className="rounded-full border border-slate-200 bg-white p-2 text-subtext-light transition-colors hover:border-slate-300 hover:text-text-light"
                                    aria-label="Close subscription details"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-6 py-6">
                            {detailLoading ? (
                                <div className="py-14 text-center text-sm text-subtext-light">Loading subscription details...</div>
                            ) : detailError ? (
                                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                    {detailError}
                                </div>
                            ) : selectedSubscription ? (
                                <div className="space-y-6">
                                    <div className="grid gap-4 lg:grid-cols-[1fr,1.45fr]">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Customer</p>
                                            <p className="mt-2 text-2xl font-bold leading-tight text-text-light">
                                                {selectedSubscription.customer.name ?? 'Unknown Customer'}
                                            </p>
                                            {selectedSubscription.customer.companyName && (
                                                <p className="mt-3 text-sm text-subtext-light">{selectedSubscription.customer.companyName}</p>
                                            )}
                                            {selectedSubscription.customer.phoneNumber && (
                                                <p className="mt-1 text-sm text-subtext-light">{selectedSubscription.customer.phoneNumber}</p>
                                            )}
                                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Office Address</p>
                                                    <p className="mt-1 text-sm leading-relaxed text-text-light">
                                                        {formatAddress(selectedSubscription.customer.officeAddress ?? selectedSubscription.customer.address)}
                                                    </p>
                                                </div>
                                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Delivery Address</p>
                                                    <p className="mt-1 text-sm leading-relaxed text-text-light">
                                                        {formatAddress(selectedSubscription.customer.deliveryAddress ?? selectedSubscription.customer.address)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Item Listing</p>
                                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                                                    {selectedSubscription.items.reduce((sum, item) => sum + item.quantity, 0)} units
                                                </p>
                                            </div>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{selectedSubscription.itemsSummary}</p>
                                            {selectedSubscription.items.length > 0 ? (
                                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                                    {selectedSubscription.items.map((item, index) => (
                                                        <div
                                                            key={`${item.productName}-${index}`}
                                                            className="rounded-xl border border-slate-200 bg-white p-3"
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                                                    {item.imageUrl ? (
                                                                        <>
                                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                            <img
                                                                                src={item.imageUrl}
                                                                                alt={item.productName}
                                                                                className="h-full w-full object-cover"
                                                                                loading="lazy"
                                                                            />
                                                                        </>
                                                                    ) : (
                                                                        <div className="flex h-full w-full items-center justify-center text-[11px] font-medium uppercase tracking-wide text-subtext-light">
                                                                            No Image
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="truncate text-base font-semibold text-text-light">{item.productName}</p>
                                                                    <p className="mt-1 text-xs uppercase tracking-wide text-subtext-light">
                                                                        {(item.category ?? 'General')} • x {item.quantity}
                                                                    </p>
                                                                    <p className="mt-2 text-sm font-semibold text-primary">
                                                                        {formatCurrency(item.monthlyPrice == null ? 0 : item.monthlyPrice * item.quantity)}
                                                                        <span className="ml-1 text-xs font-medium text-subtext-light">/mo</span>
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-subtext-light">
                                                    No items captured for this subscription.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Created</p>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{formatDate(selectedSubscription.createdAt)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Subtotal</p>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{formatCurrencyOrDash(selectedSubscription.subtotalAmount)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">SST</p>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{formatCurrencyOrDash(selectedSubscription.taxAmount)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Monthly Total</p>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{formatCurrency(selectedSubscription.total)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Start Date</p>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{formatDate(selectedSubscription.startDate)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">End Date</p>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{formatDate(selectedSubscription.endDate)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Billing Status</p>
                                            <div className="mt-2">
                                                <Badge variant={getStatusVariant(selectedSubscription.billingStatus)}>
                                                    {selectedSubscription.billingStatus ?? '-'}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="mb-4 flex items-center justify-between gap-2">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Billing Actions</p>
                                            <p className="text-xs text-subtext-light">Billing fields are read-only and synced from Stripe.</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void executeBillingAction('cancel_now')}
                                                disabled={billingActionLoading != null}
                                                className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {billingActionLoading === 'cancel_now' ? 'Cancelling...' : 'Cancel Now'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void executeBillingAction('cancel_at_period_end')}
                                                disabled={billingActionLoading != null}
                                                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {billingActionLoading === 'cancel_at_period_end' ? 'Scheduling...' : 'Cancel At Period End'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                    Subscription details are unavailable.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
