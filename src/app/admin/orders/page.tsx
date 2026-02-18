'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Eye, Pencil, X } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { AdminOrder, AdminOrderDetail, AdminOrderSortColumn, AdminOrderStatus, AdminOrderUpdatePayload, getOrder, getOrders, updateOrder } from '@/lib/api'

function getStatusVariant(status: string | null): 'default' | 'success' | 'warning' | 'error' | 'outline' {
    const normalizedStatus = status?.toLowerCase()
    if (normalizedStatus === 'active') return 'success'
    if (normalizedStatus === 'pending') return 'warning'
    if (normalizedStatus === 'pending_payment') return 'warning'
    if (normalizedStatus === 'payment_failed') return 'error'
    if (normalizedStatus === 'incomplete') return 'warning'
    if (normalizedStatus === 'cancelled') return 'error'
    if (normalizedStatus === 'completed') return 'outline'
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

function formatOrderId(value: string) {
    const normalized = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    return normalized.slice(0, 8)
}

function toDateInputValue(value: string | null) {
    if (!value) return ''
    const matches = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (matches?.[1]) return matches[1]
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ''
    return parsed.toISOString().slice(0, 10)
}

const STATUS_FILTER_OPTIONS: Array<{ value: 'all' | AdminOrderStatus; label: string }> = [
    { value: 'all', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'pending_payment', label: 'Pending Payment' },
    { value: 'incomplete', label: 'Incomplete' },
    { value: 'payment_failed', label: 'Payment Failed' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
]

function normalizeStatus(status: AdminOrderStatus | null | undefined): AdminOrderStatus {
    if (status && STATUS_FILTER_OPTIONS.some((option) => option.value === status)) return status
    return 'pending'
}

function getSortIndicator(activeSortBy: AdminOrderSortColumn, activeSortDir: 'asc' | 'desc', column: AdminOrderSortColumn) {
    if (activeSortBy !== column) return '↕'
    return activeSortDir === 'asc' ? '↑' : '↓'
}

export default function OrdersPage() {
    const [orders, setOrders] = useState<AdminOrder[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(10)
    const [total, setTotal] = useState(0)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | AdminOrderStatus>('all')
    const [sortBy, setSortBy] = useState<AdminOrderSortColumn>('created_at')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
    const [selectedOrder, setSelectedOrder] = useState<AdminOrderDetail | null>(null)
    const [detailMode, setDetailMode] = useState<'view' | 'edit'>('view')
    const [orderStatusDraft, setOrderStatusDraft] = useState<AdminOrderStatus>('pending')
    const [orderMonthlyRateDraft, setOrderMonthlyRateDraft] = useState('')
    const [orderStartDateDraft, setOrderStartDateDraft] = useState('')
    const [orderEndDateDraft, setOrderEndDateDraft] = useState('')
    const [detailLoading, setDetailLoading] = useState(false)
    const [detailSaving, setDetailSaving] = useState(false)
    const [detailError, setDetailError] = useState<string | null>(null)
    const hasCustomFilters = search.trim().length > 0 || statusFilter !== 'all' || sortBy !== 'created_at' || sortDir !== 'desc'

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await getOrders({
                page,
                limit,
                search: search.trim() || undefined,
                status: statusFilter,
                sortBy,
                sortDir,
            })
            setOrders(result.items)
            setTotal(result.total)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load orders')
        } finally {
            setLoading(false)
        }
    }, [limit, page, search, sortBy, sortDir, statusFilter])

    useEffect(() => {
        loadData()
    }, [loadData])

    const closeOrderDetails = useCallback(() => {
        setSelectedOrderId(null)
        setSelectedOrder(null)
        setDetailMode('view')
        setDetailLoading(false)
        setDetailSaving(false)
        setDetailError(null)
        setOrderStatusDraft('pending')
        setOrderMonthlyRateDraft('')
        setOrderStartDateDraft('')
        setOrderEndDateDraft('')
    }, [])

    const openOrderDetails = useCallback(async (orderId: string, mode: 'view' | 'edit') => {
        setSelectedOrderId(orderId)
        setSelectedOrder(null)
        setDetailMode(mode)
        setDetailError(null)
        setDetailLoading(true)
        try {
            const details = await getOrder(orderId)
            setSelectedOrder(details)
            setOrderStatusDraft(normalizeStatus(details.status))
            setOrderMonthlyRateDraft(details.total == null ? '' : details.total.toFixed(2))
            setOrderStartDateDraft(toDateInputValue(details.startDate))
            setOrderEndDateDraft(toDateInputValue(details.endDate))
        } catch (loadError) {
            setDetailError(loadError instanceof Error ? loadError.message : 'Failed to load order details')
        } finally {
            setDetailLoading(false)
        }
    }, [])

    const saveOrderDetails = useCallback(async () => {
        if (!selectedOrderId || !selectedOrder) return
        setDetailSaving(true)
        setDetailError(null)

        try {
            const updatePayload: AdminOrderUpdatePayload = {}

            if (orderStatusDraft !== normalizeStatus(selectedOrder.status)) {
                updatePayload.status = orderStatusDraft
            }

            const trimmedMonthlyRate = orderMonthlyRateDraft.trim()
            const nextMonthlyRate = trimmedMonthlyRate === '' ? null : Number(trimmedMonthlyRate)
            if (trimmedMonthlyRate !== '') {
                if (nextMonthlyRate == null || !Number.isFinite(nextMonthlyRate) || nextMonthlyRate < 0) {
                    setDetailError('Monthly rate must be a valid number greater than or equal to 0')
                    setDetailSaving(false)
                    return
                }
            }

            const currentMonthlyRate = selectedOrder.total == null ? null : Number(selectedOrder.total.toFixed(2))
            const normalizedNextMonthlyRate = nextMonthlyRate == null ? null : Number(nextMonthlyRate.toFixed(2))
            if (normalizedNextMonthlyRate !== currentMonthlyRate) {
                updatePayload.monthly_total = normalizedNextMonthlyRate
            }

            const currentStartDate = toDateInputValue(selectedOrder.startDate)
            if (orderStartDateDraft !== currentStartDate) {
                updatePayload.start_date = orderStartDateDraft || null
            }

            const currentEndDate = toDateInputValue(selectedOrder.endDate)
            if (orderEndDateDraft !== currentEndDate) {
                updatePayload.end_date = orderEndDateDraft || null
            }

            if (Object.keys(updatePayload).length === 0) {
                setDetailMode('view')
                setDetailSaving(false)
                return
            }

            const updated = await updateOrder(selectedOrderId, updatePayload)
            setSelectedOrder(updated)
            setOrderStatusDraft(normalizeStatus(updated.status))
            setOrderMonthlyRateDraft(updated.total == null ? '' : updated.total.toFixed(2))
            setOrderStartDateDraft(toDateInputValue(updated.startDate))
            setOrderEndDateDraft(toDateInputValue(updated.endDate))
            setDetailMode('view')
            await loadData()
        } catch (saveError) {
            setDetailError(saveError instanceof Error ? saveError.message : 'Failed to update order')
        } finally {
            setDetailSaving(false)
        }
    }, [loadData, orderEndDateDraft, orderMonthlyRateDraft, orderStartDateDraft, orderStatusDraft, selectedOrder, selectedOrderId])

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
        accessorKey?: keyof AdminOrder
        cell?: (row: AdminOrder) => ReactNode
    }> = [
        {
            header: 'Order ID',
            accessorKey: 'id',
            cell: (row) => (
                <span className="font-semibold tracking-wide text-text-light">{formatOrderId(row.id)}</span>
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
                    STATUS {getSortIndicator(sortBy, sortDir, 'status')}
                </button>
            ),
            accessorKey: 'status',
            cell: (row) => <Badge variant={getStatusVariant(row.status)}>{row.status ?? '-'}</Badge>,
        },
    ]

    const actions = (row: AdminOrder) => (
        <div className="flex items-center justify-end gap-2">
            <button
                type="button"
                onClick={() => void openOrderDetails(row.id, 'view')}
                className="text-subtext-light hover:text-primary transition-colors"
                aria-label={`View order ${formatOrderId(row.id)}`}
            >
                <Eye className="h-4 w-4" />
            </button>
            <button
                type="button"
                onClick={() => void openOrderDetails(row.id, 'edit')}
                className="text-subtext-light hover:text-primary transition-colors"
                aria-label={`Edit order ${formatOrderId(row.id)}`}
            >
                <Pencil className="h-4 w-4" />
            </button>
        </div>
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-bold text-text-light">Orders</h1>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-3">
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value)
                            setPage(1)
                        }}
                        placeholder="Search order ID, customer, items..."
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <select
                        value={statusFilter}
                        onChange={(event) => {
                            const nextStatus = event.target.value as 'all' | AdminOrderStatus
                            setStatusFilter(nextStatus)
                            setPage(1)
                        }}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-text-light transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Reset Filters
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-subtext-light">
                    Loading orders...
                </div>
            ) : error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            ) : (
                <>
                    <DataTable
                        columns={columns}
                        data={orders}
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
                </>
            )}

            {selectedOrderId && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/55 p-4 backdrop-blur-sm md:p-8">
                    <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-subtext-light">
                                        {detailMode === 'edit' ? 'Edit Order' : 'Order Details'}
                                    </p>
                                    <h2 className="mt-1 text-3xl font-bold tracking-tight text-text-light">
                                        #{formatOrderId(selectedOrderId)}
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeOrderDetails}
                                    className="rounded-full border border-slate-200 bg-white p-2 text-subtext-light transition-colors hover:border-slate-300 hover:text-text-light"
                                    aria-label="Close order details"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-6 py-6">
                            {detailLoading ? (
                                <div className="py-14 text-center text-sm text-subtext-light">Loading order details...</div>
                            ) : detailError ? (
                                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                    {detailError}
                                </div>
                            ) : selectedOrder ? (
                                <div className="space-y-6">
                                    <div className="grid gap-4 lg:grid-cols-[1fr,1.45fr]">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Customer</p>
                                            <p className="mt-2 text-2xl font-bold leading-tight text-text-light">
                                                {selectedOrder.customer.name ?? 'Unknown Customer'}
                                            </p>
                                            {selectedOrder.customer.companyName && (
                                                <p className="mt-3 text-sm text-subtext-light">{selectedOrder.customer.companyName}</p>
                                            )}
                                            {selectedOrder.customer.phoneNumber && (
                                                <p className="mt-1 text-sm text-subtext-light">{selectedOrder.customer.phoneNumber}</p>
                                            )}
                                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Office Address</p>
                                                    <p className="mt-1 text-sm leading-relaxed text-text-light">
                                                        {formatAddress(selectedOrder.customer.officeAddress ?? selectedOrder.customer.address)}
                                                    </p>
                                                </div>
                                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Delivery Address</p>
                                                    <p className="mt-1 text-sm leading-relaxed text-text-light">
                                                        {formatAddress(selectedOrder.customer.deliveryAddress ?? selectedOrder.customer.address)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Item Listing</p>
                                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                                                    {selectedOrder.items.reduce((sum, item) => sum + item.quantity, 0)} units
                                                </p>
                                            </div>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{selectedOrder.itemsSummary}</p>

                                            {selectedOrder.items.length > 0 ? (
                                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                                    {selectedOrder.items.map((item, index) => (
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
                                                    No items captured for this order.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Created</p>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{formatDate(selectedOrder.createdAt)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Subtotal</p>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{formatCurrencyOrDash(selectedOrder.subtotalAmount)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">SST</p>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{formatCurrencyOrDash(selectedOrder.taxAmount)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Monthly Total</p>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{formatCurrency(selectedOrder.total)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Start Date</p>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{formatDate(selectedOrder.startDate)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">End Date</p>
                                            <p className="mt-2 text-lg font-semibold text-text-light">{formatDate(selectedOrder.endDate)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Status</p>
                                            <div className="mt-2">
                                                <Badge variant={getStatusVariant(selectedOrder.status)}>
                                                    {selectedOrder.status ?? '-'}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>

                                    {detailMode === 'edit' ? (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="mb-4 flex items-center justify-between gap-2">
                                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Edit Details</p>
                                                <p className="text-xs text-subtext-light">Changes apply immediately after saving.</p>
                                            </div>

                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div>
                                                    <label htmlFor="order-monthly-rate" className="block text-xs uppercase tracking-wide text-subtext-light">
                                                        Monthly Rate
                                                    </label>
                                                    <input
                                                        id="order-monthly-rate"
                                                        type="number"
                                                        min={0}
                                                        step="0.01"
                                                        value={orderMonthlyRateDraft}
                                                        onChange={(event) => setOrderMonthlyRateDraft(event.target.value)}
                                                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                                <div>
                                                    <label htmlFor="order-status" className="block text-xs uppercase tracking-wide text-subtext-light">
                                                        Status
                                                    </label>
                                                    <select
                                                        id="order-status"
                                                        value={orderStatusDraft}
                                                        onChange={(event) => setOrderStatusDraft(event.target.value as AdminOrderStatus)}
                                                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                    >
                                                        {STATUS_FILTER_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label htmlFor="order-start-date" className="block text-xs uppercase tracking-wide text-subtext-light">
                                                        Start Date
                                                    </label>
                                                    <input
                                                        id="order-start-date"
                                                        type="date"
                                                        value={orderStartDateDraft}
                                                        onChange={(event) => setOrderStartDateDraft(event.target.value)}
                                                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                    />
                                                </div>
                                                <div>
                                                    <label htmlFor="order-end-date" className="block text-xs uppercase tracking-wide text-subtext-light">
                                                        End Date
                                                    </label>
                                                    <input
                                                        id="order-end-date"
                                                        type="date"
                                                        value={orderEndDateDraft}
                                                        onChange={(event) => setOrderEndDateDraft(event.target.value)}
                                                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                    />
                                                </div>
                                            </div>

                                            <div className="mt-5 flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDetailMode('view')
                                                        setOrderStatusDraft(normalizeStatus(selectedOrder.status))
                                                        setOrderMonthlyRateDraft(selectedOrder.total == null ? '' : selectedOrder.total.toFixed(2))
                                                        setOrderStartDateDraft(toDateInputValue(selectedOrder.startDate))
                                                        setOrderEndDateDraft(toDateInputValue(selectedOrder.endDate))
                                                    }}
                                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light hover:bg-slate-50"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void saveOrderDetails()}
                                                    disabled={detailSaving}
                                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {detailSaving ? 'Saving...' : 'Save Changes'}
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
                                                Edit Details
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                    Order details are unavailable.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
