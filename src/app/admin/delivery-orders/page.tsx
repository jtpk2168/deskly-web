'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, Pencil, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { PaginationControls } from '@/components/ui/PaginationControls'
import {
    AdminDeliveryOrder,
    AdminDeliveryOrderDetail,
    AdminDeliveryOrderUpdatePayload,
    DeliveryOrderStatus,
    getDeliveryOrder,
    getDeliveryOrders,
    updateDeliveryOrder,
} from '@/lib/api'

const DELIVERY_ORDER_STATUS_OPTIONS: Array<{ value: DeliveryOrderStatus; label: string }> = [
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'dispatched', label: 'Dispatched' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'partially_delivered', label: 'Partially Delivered' },
    { value: 'failed', label: 'Failed' },
    { value: 'rescheduled', label: 'Rescheduled' },
    { value: 'cancelled', label: 'Cancelled' },
]

function getStatusVariant(status: string | null): 'default' | 'success' | 'warning' | 'error' | 'outline' {
    const normalizedStatus = status?.toLowerCase()
    if (normalizedStatus === 'delivered' || normalizedStatus === 'partially_delivered') return 'success'
    if (normalizedStatus === 'dispatched' || normalizedStatus === 'confirmed' || normalizedStatus === 'rescheduled') return 'warning'
    if (normalizedStatus === 'failed' || normalizedStatus === 'cancelled') return 'error'
    return 'default'
}

function formatDeliveryOrderId(value: string) {
    const normalized = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    return normalized.slice(0, 8)
}

function formatSubscriptionId(value: string) {
    const normalized = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    return normalized.slice(0, 8)
}

function formatDate(value: string | null) {
    if (!value) return '-'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '-'
    return parsed.toLocaleString()
}

function toStatusLabel(status: string | null) {
    if (!status) return '-'
    return status
        .split('_')
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join(' ')
}

export default function DeliveryOrdersPage() {
    const [orders, setOrders] = useState<AdminDeliveryOrder[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(10)
    const [total, setTotal] = useState(0)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | DeliveryOrderStatus>('all')

    const [selectedDeliveryOrderId, setSelectedDeliveryOrderId] = useState<string | null>(null)
    const [selectedDeliveryOrder, setSelectedDeliveryOrder] = useState<AdminDeliveryOrderDetail | null>(null)
    const [detailMode, setDetailMode] = useState<'view' | 'edit'>('view')
    const [detailLoading, setDetailLoading] = useState(false)
    const [detailSaving, setDetailSaving] = useState(false)
    const [detailError, setDetailError] = useState<string | null>(null)
    const [doStatusDraft, setDoStatusDraft] = useState<DeliveryOrderStatus>('confirmed')
    const [failureReasonDraft, setFailureReasonDraft] = useState('')
    const [rescheduledAtDraft, setRescheduledAtDraft] = useState('')
    const [cancelledReasonDraft, setCancelledReasonDraft] = useState('')

    const hasCustomFilters = search.trim().length > 0 || statusFilter !== 'all'

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await getDeliveryOrders({
                page,
                limit,
                search: search.trim() || undefined,
                status: statusFilter,
                sortBy: 'created_at',
                sortDir: 'desc',
            })
            setOrders(result.items)
            setTotal(result.total)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load delivery orders')
        } finally {
            setLoading(false)
        }
    }, [limit, page, search, statusFilter])

    useEffect(() => {
        void loadData()
    }, [loadData])

    const resetDrafts = useCallback(() => {
        setDoStatusDraft('confirmed')
        setFailureReasonDraft('')
        setRescheduledAtDraft('')
        setCancelledReasonDraft('')
    }, [])

    const closeDetails = useCallback(() => {
        setSelectedDeliveryOrderId(null)
        setSelectedDeliveryOrder(null)
        setDetailMode('view')
        setDetailLoading(false)
        setDetailSaving(false)
        setDetailError(null)
        resetDrafts()
    }, [resetDrafts])

    const hydrateDraftsFromDetail = useCallback((detail: AdminDeliveryOrderDetail) => {
        setDoStatusDraft(detail.do_status)
        setFailureReasonDraft(detail.failure_reason ?? '')
        setRescheduledAtDraft(detail.rescheduled_at ? detail.rescheduled_at.slice(0, 16) : '')
        setCancelledReasonDraft(detail.cancelled_reason ?? '')
    }, [])

    const openDetails = useCallback(async (deliveryOrderId: string, mode: 'view' | 'edit') => {
        setSelectedDeliveryOrderId(deliveryOrderId)
        setSelectedDeliveryOrder(null)
        setDetailMode(mode)
        setDetailError(null)
        setDetailLoading(true)
        try {
            const detail = await getDeliveryOrder(deliveryOrderId)
            setSelectedDeliveryOrder(detail)
            hydrateDraftsFromDetail(detail)
        } catch (loadError) {
            setDetailError(loadError instanceof Error ? loadError.message : 'Failed to load delivery order details')
        } finally {
            setDetailLoading(false)
        }
    }, [hydrateDraftsFromDetail])

    const requiredFieldHint = useMemo(() => {
        if (doStatusDraft === 'failed') return 'Failure reason is required.'
        if (doStatusDraft === 'rescheduled') return 'Rescheduled datetime is required.'
        if (doStatusDraft === 'cancelled') return 'Cancellation reason is required.'
        return null
    }, [doStatusDraft])

    const saveDetails = useCallback(async () => {
        if (!selectedDeliveryOrderId) return
        setDetailSaving(true)
        setDetailError(null)

        try {
            const payload: AdminDeliveryOrderUpdatePayload = {
                do_status: doStatusDraft,
                failure_reason: doStatusDraft === 'failed' ? (failureReasonDraft.trim() || null) : null,
                rescheduled_at: doStatusDraft === 'rescheduled' ? (rescheduledAtDraft ? new Date(rescheduledAtDraft).toISOString() : null) : null,
                cancelled_reason: doStatusDraft === 'cancelled' ? (cancelledReasonDraft.trim() || null) : null,
            }

            const updated = await updateDeliveryOrder(selectedDeliveryOrderId, payload)
            setSelectedDeliveryOrder(updated)
            hydrateDraftsFromDetail(updated)
            setDetailMode('view')
            await loadData()
        } catch (saveError) {
            setDetailError(saveError instanceof Error ? saveError.message : 'Failed to update delivery order')
        } finally {
            setDetailSaving(false)
        }
    }, [
        cancelledReasonDraft,
        doStatusDraft,
        failureReasonDraft,
        hydrateDraftsFromDetail,
        loadData,
        rescheduledAtDraft,
        selectedDeliveryOrderId,
    ])

    const columns: Array<{
        header: string
        accessorKey?: keyof AdminDeliveryOrder
        cell?: (row: AdminDeliveryOrder) => ReactNode
    }> = [
        {
            header: 'Delivery Order ID',
            accessorKey: 'id',
            cell: (row) => <span className="font-semibold tracking-wide text-text-light">{formatDeliveryOrderId(row.id)}</span>,
        },
        {
            header: 'Subscription',
            accessorKey: 'subscription_id',
            cell: (row) => <span className="font-semibold tracking-wide text-text-light">{formatSubscriptionId(row.subscription_id)}</span>,
        },
        { header: 'Customer', accessorKey: 'customer' },
        { header: 'Items', accessorKey: 'items' },
        {
            header: 'Delivery Status',
            accessorKey: 'do_status',
            cell: (row) => <Badge variant={getStatusVariant(row.do_status)}>{row.do_status}</Badge>,
        },
        {
            header: 'Billing Status',
            accessorKey: 'billing_status',
            cell: (row) => <Badge variant={getStatusVariant(row.billing_status)}>{row.billing_status ?? '-'}</Badge>,
        },
        {
            header: 'Service State',
            accessorKey: 'service_state',
            cell: (row) => <span className="text-sm text-text-light">{toStatusLabel(row.service_state)}</span>,
        },
        {
            header: 'Created',
            accessorKey: 'date',
        },
    ]

    const actions = (row: AdminDeliveryOrder) => (
        <div className="flex items-center justify-end gap-2">
            <button
                type="button"
                onClick={() => void openDetails(row.id, 'view')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-subtext-light transition hover:border-primary/40 hover:text-primary"
                aria-label={`View delivery order ${formatDeliveryOrderId(row.id)}`}
            >
                <Eye className="h-4 w-4" />
            </button>
            <button
                type="button"
                onClick={() => void openDetails(row.id, 'edit')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-subtext-light transition hover:border-primary/40 hover:text-primary"
                aria-label={`Edit delivery order ${formatDeliveryOrderId(row.id)}`}
            >
                <Pencil className="h-4 w-4" />
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
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Fulfillment</p>
                            <h1 className="mt-1 text-2xl font-bold text-text-light">Delivery Orders</h1>
                            <p className="mt-1 text-sm text-subtext-light">Track dispatch, delivery outcomes, and guard transitions by billing and service state.</p>
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
                    <p className="mt-1 text-sm text-subtext-light">Search by delivery order, subscription, customer, item, or statuses.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value)
                            setPage(1)
                        }}
                        placeholder="Search delivery order, subscription, customer..."
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <select
                        value={statusFilter}
                        onChange={(event) => {
                            setStatusFilter(event.target.value as 'all' | DeliveryOrderStatus)
                            setPage(1)
                        }}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                        <option value="all">All Status</option>
                        {DELIVERY_ORDER_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => {
                            setSearch('')
                            setStatusFilter('all')
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
                    Loading delivery orders...
                </div>
            ) : error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            ) : (
                <div className="space-y-4">
                    <DataTable columns={columns} data={orders} actions={actions} />
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

            {selectedDeliveryOrderId && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/55 p-4 backdrop-blur-sm md:p-8">
                    <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-subtext-light">
                                        {detailMode === 'edit' ? 'Edit Delivery Order' : 'Delivery Order Details'}
                                    </p>
                                    <h2 className="mt-1 text-3xl font-bold tracking-tight text-text-light">
                                        #{formatDeliveryOrderId(selectedDeliveryOrderId)}
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeDetails}
                                    className="rounded-full border border-slate-200 bg-white p-2 text-subtext-light transition-colors hover:border-slate-300 hover:text-text-light"
                                    aria-label="Close delivery order details"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-6 py-6">
                            {detailLoading ? (
                                <div className="py-14 text-center text-sm text-subtext-light">Loading delivery order details...</div>
                            ) : detailError ? (
                                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                    {detailError}
                                </div>
                            ) : selectedDeliveryOrder ? (
                                <div className="space-y-5">
                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Delivery Status</p>
                                            <div className="mt-2">
                                                <Badge variant={getStatusVariant(selectedDeliveryOrder.do_status)}>{selectedDeliveryOrder.do_status}</Badge>
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Billing Status</p>
                                            <div className="mt-2">
                                                <Badge variant={getStatusVariant(selectedDeliveryOrder.subscription?.billing_status ?? null)}>
                                                    {selectedDeliveryOrder.subscription?.billing_status ?? '-'}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Service State</p>
                                            <p className="mt-2 text-sm font-semibold text-text-light">{toStatusLabel(selectedDeliveryOrder.subscription?.service_state ?? null)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Collection</p>
                                            <p className="mt-2 text-sm font-semibold text-text-light">{toStatusLabel(selectedDeliveryOrder.subscription?.collection_status ?? null)}</p>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Subscription Context</p>
                                            <p className="mt-2 text-xl font-bold text-text-light">
                                                #{selectedDeliveryOrder.subscription ? formatSubscriptionId(selectedDeliveryOrder.subscription.id) : '-'}
                                            </p>
                                            <p className="mt-2 text-sm text-subtext-light">
                                                {selectedDeliveryOrder.subscription?.customer_name ?? 'Unknown Customer'}
                                            </p>
                                            <p className="mt-1 text-sm text-subtext-light">
                                                {selectedDeliveryOrder.subscription?.items_summary ?? 'No items captured'}
                                            </p>
                                            <p className="mt-2 text-sm text-subtext-light">
                                                Start: {formatDate(selectedDeliveryOrder.subscription?.start_date ?? null)}
                                            </p>
                                            <p className="mt-1 text-sm text-subtext-light">
                                                End: {formatDate(selectedDeliveryOrder.subscription?.end_date ?? null)}
                                            </p>
                                        </div>

                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Delivery Snapshot</p>
                                            <p className="mt-2 text-sm text-text-light">{selectedDeliveryOrder.subscription?.delivery.company_name ?? '-'}</p>
                                            <p className="mt-1 text-sm text-subtext-light">{selectedDeliveryOrder.subscription?.delivery.contact_name ?? '-'}</p>
                                            <p className="mt-1 text-sm text-subtext-light">{selectedDeliveryOrder.subscription?.delivery.contact_phone ?? '-'}</p>
                                            <p className="mt-2 text-sm text-text-light">{selectedDeliveryOrder.subscription?.delivery.address ?? '-'}</p>
                                            <p className="mt-3 text-xs text-subtext-light">Created: {formatDate(selectedDeliveryOrder.created_at)}</p>
                                            <p className="mt-1 text-xs text-subtext-light">Updated: {formatDate(selectedDeliveryOrder.updated_at)}</p>
                                        </div>
                                    </div>

                                    {detailMode === 'edit' ? (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="mb-4 flex items-center justify-between gap-2">
                                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Transition Delivery Status</p>
                                                {requiredFieldHint ? <p className="text-xs text-amber-700">{requiredFieldHint}</p> : null}
                                            </div>
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div>
                                                    <label htmlFor="delivery-order-status" className="block text-xs uppercase tracking-wide text-subtext-light">
                                                        Next Status
                                                    </label>
                                                    <select
                                                        id="delivery-order-status"
                                                        value={doStatusDraft}
                                                        onChange={(event) => setDoStatusDraft(event.target.value as DeliveryOrderStatus)}
                                                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                    >
                                                        {DELIVERY_ORDER_STATUS_OPTIONS.map((option) => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {doStatusDraft === 'rescheduled' ? (
                                                    <div>
                                                        <label htmlFor="delivery-order-rescheduled-at" className="block text-xs uppercase tracking-wide text-subtext-light">
                                                            Rescheduled At
                                                        </label>
                                                        <input
                                                            id="delivery-order-rescheduled-at"
                                                            type="datetime-local"
                                                            value={rescheduledAtDraft}
                                                            onChange={(event) => setRescheduledAtDraft(event.target.value)}
                                                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                        />
                                                    </div>
                                                ) : null}

                                                {doStatusDraft === 'failed' ? (
                                                    <div className="sm:col-span-2">
                                                        <label htmlFor="delivery-order-failure-reason" className="block text-xs uppercase tracking-wide text-subtext-light">
                                                            Failure Reason
                                                        </label>
                                                        <input
                                                            id="delivery-order-failure-reason"
                                                            value={failureReasonDraft}
                                                            onChange={(event) => setFailureReasonDraft(event.target.value)}
                                                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                            placeholder="Reason for failed dispatch/delivery"
                                                        />
                                                    </div>
                                                ) : null}

                                                {doStatusDraft === 'cancelled' ? (
                                                    <div className="sm:col-span-2">
                                                        <label htmlFor="delivery-order-cancelled-reason" className="block text-xs uppercase tracking-wide text-subtext-light">
                                                            Cancellation Reason
                                                        </label>
                                                        <input
                                                            id="delivery-order-cancelled-reason"
                                                            value={cancelledReasonDraft}
                                                            onChange={(event) => setCancelledReasonDraft(event.target.value)}
                                                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                            placeholder="Reason for cancellation"
                                                        />
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="mt-5 flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDetailMode('view')
                                                        if (selectedDeliveryOrder) hydrateDraftsFromDetail(selectedDeliveryOrder)
                                                    }}
                                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light hover:bg-slate-50"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void saveDetails()}
                                                    disabled={detailSaving}
                                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {detailSaving ? 'Saving...' : 'Apply Transition'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => setDetailMode('edit')}
                                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
                                            >
                                                <Pencil className="h-4 w-4" />
                                                Update Delivery Status
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                    Delivery order details are unavailable.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
