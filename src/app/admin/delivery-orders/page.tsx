'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, Pencil } from 'lucide-react'
import { AdminFilterPanel } from '@/components/admin/shared/AdminFilterPanel'
import { AdminModal } from '@/components/admin/shared/AdminModal'
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader'
import { ErrorState } from '@/components/admin/shared/ErrorState'
import { IconActionButton } from '@/components/admin/shared/IconActionButton'
import { LoadingState } from '@/components/admin/shared/LoadingState'
import { Badge } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { DELIVERY_ORDER_STATUS_OPTIONS } from '@/lib/admin-ui/constants'
import { formatDateTime, formatShortId, toTitleStatus } from '@/lib/admin-ui/formatters'
import { getDeliveryStatusVariant } from '@/lib/admin-ui/statusVariants'
import {
    AdminDeliveryOrder,
    AdminDeliveryOrderDetail,
    AdminDeliveryOrderUpdatePayload,
    AdminFulfillmentAction,
    DeliveryOrderStatus,
    getDeliveryOrder,
    getDeliveryOrders,
    runDeliveryOrderFulfillmentAction,
    updateDeliveryOrder,
} from '@/lib/api'

const FULFILLMENT_ACTION_OPTIONS: Array<{ action: AdminFulfillmentAction; label: string; helpText: string }> = [
    {
        action: 'mark_partially_collected',
        label: 'Partially collect',
        helpText: 'Use this when only some items have been collected.',
    },
    {
        action: 'mark_collected_and_close',
        label: 'Collect & close',
        helpText: 'Use this when all items have been collected and the service should be closed.',
    },
]

function fulfillmentActionRequiresNote(action: AdminFulfillmentAction) {
    return action === 'mark_collected_and_close'
}

function getFulfillmentActionConfirmation(action: AdminFulfillmentAction) {
    if (action === 'mark_partially_collected') return 'Confirm partially collected?'
    return 'Confirm collected and close service?'
}

function isAdminFulfillmentAction(value: string): value is AdminFulfillmentAction {
    return value === 'mark_partially_collected' || value === 'mark_collected_and_close'
}

function toFulfillmentActionLabel(action: string | null) {
    if (!action) return '-'
    const match = FULFILLMENT_ACTION_OPTIONS.find((option) => option.action === action)
    if (match) return match.label
    if (action === 'request_offboarding') return 'Offboarding requested'
    if (action === 'force_offboarding') return 'Offboarding requested'
    return toTitleStatus(action)
}

function canRunFulfillmentAction(
    action: AdminFulfillmentAction,
    serviceState: string | null,
    collectionStatus: string | null,
) {
    if (action === 'mark_partially_collected') {
        return serviceState === 'offboarding_requested' && collectionStatus === 'not_collected'
    }
    return serviceState === 'offboarding_requested' && (collectionStatus === 'not_collected' || collectionStatus === 'partially_collected')
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
    const [fulfillmentMode, setFulfillmentMode] = useState<'view' | 'edit'>('view')
    const [detailLoading, setDetailLoading] = useState(false)
    const [detailSaving, setDetailSaving] = useState(false)
    const [detailError, setDetailError] = useState<string | null>(null)
    const [doStatusDraft, setDoStatusDraft] = useState<DeliveryOrderStatus>('confirmed')
    const [failureReasonDraft, setFailureReasonDraft] = useState('')
    const [rescheduledAtDraft, setRescheduledAtDraft] = useState('')
    const [cancelledReasonDraft, setCancelledReasonDraft] = useState('')
    const [fulfillmentActionDraft, setFulfillmentActionDraft] = useState<AdminFulfillmentAction | ''>('')
    const [fulfillmentNoteDraft, setFulfillmentNoteDraft] = useState('')
    const [fulfillmentActionSaving, setFulfillmentActionSaving] = useState<AdminFulfillmentAction | null>(null)
    const [fulfillmentActionError, setFulfillmentActionError] = useState<string | null>(null)

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
        setFulfillmentMode('view')
        setDetailLoading(false)
        setDetailSaving(false)
        setDetailError(null)
        setFulfillmentActionDraft('')
        setFulfillmentNoteDraft('')
        setFulfillmentActionSaving(null)
        setFulfillmentActionError(null)
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
        setFulfillmentMode('view')
        setDetailError(null)
        setFulfillmentActionDraft('')
        setFulfillmentActionError(null)
        setFulfillmentActionSaving(null)
        setFulfillmentNoteDraft('')
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
            alert(saveError instanceof Error ? saveError.message : 'Failed to update delivery order')
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

    const currentServiceState = selectedDeliveryOrder?.subscription?.service_state ?? null
    const currentCollectionStatus = selectedDeliveryOrder?.subscription?.collection_status ?? null
    const hasSubscriptionContext = selectedDeliveryOrder?.subscription != null
    const normalizedBillingStatus = selectedDeliveryOrder?.subscription?.billing_status?.toLowerCase() ?? null
    const isBillingCancelled = normalizedBillingStatus === 'cancelled'
    const hasStripeCancellationSignal = isBillingCancelled
        || currentServiceState === 'offboarding_requested'
        || currentServiceState === 'closed'
    const canOpenCollectionUpdates = hasSubscriptionContext && hasStripeCancellationSignal
    const collectionUpdateDisabledTooltip = !hasSubscriptionContext
        ? 'Collection updates are unavailable because this delivery order has no subscription context.'
        : 'Available only after Stripe cancellation (Cancel now / Cancel at period end), or when billing status becomes Cancelled.'

    const saveFulfillmentUpdate = useCallback(async () => {
        if (!selectedDeliveryOrderId) return
        if (!isAdminFulfillmentAction(fulfillmentActionDraft)) {
            setFulfillmentActionError('Please choose an action before saving.')
            return
        }

        const note = fulfillmentNoteDraft.trim()
        if (!canRunFulfillmentAction(fulfillmentActionDraft, currentServiceState, currentCollectionStatus)) {
            setFulfillmentActionError('This action is not available yet. Offboarding must be requested before collection updates.')
            return
        }
        if (fulfillmentActionRequiresNote(fulfillmentActionDraft) && !note) {
            setFulfillmentActionError(`Please add a note for ${toFulfillmentActionLabel(fulfillmentActionDraft)}.`)
            return
        }

        const confirmed = window.confirm(getFulfillmentActionConfirmation(fulfillmentActionDraft))
        if (!confirmed) return

        setFulfillmentActionError(null)
        setFulfillmentActionSaving(fulfillmentActionDraft)
        try {
            const result = await runDeliveryOrderFulfillmentAction(
                selectedDeliveryOrderId,
                fulfillmentActionDraft,
                note || undefined,
            )
            setSelectedDeliveryOrder(result.delivery_order)
            setFulfillmentMode('view')
            setFulfillmentActionDraft('')
            setFulfillmentNoteDraft('')
            await loadData()
        } catch (actionError) {
            setFulfillmentActionError(actionError instanceof Error ? actionError.message : 'Unable to save collection update')
        } finally {
            setFulfillmentActionSaving(null)
        }
    }, [
        currentCollectionStatus,
        currentServiceState,
        fulfillmentActionDraft,
        fulfillmentNoteDraft,
        loadData,
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
                cell: (row) => <span className="font-semibold tracking-wide text-text-light">{formatShortId(row.id)}</span>,
            },
            {
                header: 'Subscription',
                accessorKey: 'subscription_id',
                cell: (row) => <span className="font-semibold tracking-wide text-text-light">{formatShortId(row.subscription_id)}</span>,
            },
            { header: 'Customer', accessorKey: 'customer' },
            { header: 'Items', accessorKey: 'items' },
            {
                header: 'Delivery Status',
                accessorKey: 'do_status',
                cell: (row) => <Badge variant={getDeliveryStatusVariant(row.do_status)}>{row.do_status}</Badge>,
            },
            {
                header: 'Billing Status',
                accessorKey: 'billing_status',
                cell: (row) => <Badge variant={getDeliveryStatusVariant(row.billing_status)}>{row.billing_status ?? '-'}</Badge>,
            },
            {
                header: 'Service State',
                accessorKey: 'service_state',
                cell: (row) => <span className="text-sm text-text-light">{toTitleStatus(row.service_state)}</span>,
            },
            {
                header: 'Created',
                accessorKey: 'date',
            },
        ]

    const actions = (row: AdminDeliveryOrder) => (
        <div className="flex items-center justify-end gap-2">
            <IconActionButton
                label={`View delivery order ${formatShortId(row.id)}`}
                onClick={() => void openDetails(row.id, 'view')}
                icon={Eye}
            />
            <IconActionButton
                label={`Edit delivery order ${formatShortId(row.id)}`}
                onClick={() => void openDetails(row.id, 'edit')}
                icon={Pencil}
            />
        </div>
    )

    return (
        <div className="space-y-6">
            <AdminPageHeader
                eyebrow="Fulfillment"
                title="Delivery Orders"
                description="Track dispatch, delivery outcomes, and guard transitions by billing and service state."
                actions={(
                    <button
                        type="button"
                        onClick={() => void loadData()}
                        disabled={loading}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Refresh
                    </button>
                )}
            />

            <AdminFilterPanel
                title="Filters"
                description="Search by delivery order, subscription, customer, item, or statuses."
            >
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
            </AdminFilterPanel>

            {loading ? (
                <LoadingState message="Loading delivery orders..." />
            ) : error ? (
                <ErrorState message={error} />
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

            <AdminModal
                open={selectedDeliveryOrderId != null}
                onClose={closeDetails}
                eyebrow={detailMode === 'edit' ? 'Edit Delivery Order' : 'Delivery Order Details'}
                title={selectedDeliveryOrderId ? `#${formatShortId(selectedDeliveryOrderId)}` : '#-'}
                maxWidth="max-w-4xl"
            >
                            {detailLoading ? (
                                <LoadingState message="Loading delivery order details..." />
                            ) : detailError ? (
                                <ErrorState message={detailError} />
                            ) : selectedDeliveryOrder ? (
                                <div className="space-y-5">
                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Delivery Status</p>
                                            <div className="mt-2">
                                                <Badge variant={getDeliveryStatusVariant(selectedDeliveryOrder.do_status)}>{selectedDeliveryOrder.do_status}</Badge>
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Billing Status</p>
                                            <div className="mt-2">
                                                <Badge variant={getDeliveryStatusVariant(selectedDeliveryOrder.subscription?.billing_status ?? null)}>
                                                    {selectedDeliveryOrder.subscription?.billing_status ?? '-'}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Service State</p>
                                            <p className="mt-2 text-sm font-semibold text-text-light">{toTitleStatus(selectedDeliveryOrder.subscription?.service_state ?? null)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">Collection</p>
                                            <p className="mt-2 text-sm font-semibold text-text-light">{toTitleStatus(selectedDeliveryOrder.subscription?.collection_status ?? null)}</p>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Subscription Context</p>
                                            <p className="mt-2 text-xl font-bold text-text-light">
                                                #{selectedDeliveryOrder.subscription ? formatShortId(selectedDeliveryOrder.subscription.id) : '-'}
                                            </p>
                                            <p className="mt-2 text-sm text-subtext-light">
                                                {selectedDeliveryOrder.subscription?.customer_name ?? 'Unknown Customer'}
                                            </p>
                                            <p className="mt-1 text-sm text-subtext-light">
                                                {selectedDeliveryOrder.subscription?.items_summary ?? 'No items captured'}
                                            </p>
                                            <p className="mt-2 text-sm text-subtext-light">
                                                Start: {formatDateTime(selectedDeliveryOrder.subscription?.start_date ?? null)}
                                            </p>
                                            <p className="mt-1 text-sm text-subtext-light">
                                                End: {formatDateTime(selectedDeliveryOrder.subscription?.end_date ?? null)}
                                            </p>
                                        </div>

                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Delivery Snapshot</p>
                                            <p className="mt-2 text-sm text-text-light">{selectedDeliveryOrder.subscription?.delivery.company_name ?? '-'}</p>
                                            <p className="mt-1 text-sm text-subtext-light">{selectedDeliveryOrder.subscription?.delivery.contact_name ?? '-'}</p>
                                            <p className="mt-1 text-sm text-subtext-light">{selectedDeliveryOrder.subscription?.delivery.contact_phone ?? '-'}</p>
                                            <p className="mt-2 text-sm text-text-light">{selectedDeliveryOrder.subscription?.delivery.address ?? '-'}</p>
                                            <p className="mt-3 text-xs text-subtext-light">Created: {formatDateTime(selectedDeliveryOrder.created_at)}</p>
                                            <p className="mt-1 text-xs text-subtext-light">Updated: {formatDateTime(selectedDeliveryOrder.updated_at)}</p>
                                        </div>
                                    </div>

                                    {detailMode === 'view' || fulfillmentMode === 'view' ? (
                                        <div className="flex flex-wrap justify-end gap-2">
                                            {detailMode === 'view' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setDetailMode('edit')}
                                                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                    Update Delivery Status
                                                </button>
                                            ) : null}
                                            {fulfillmentMode === 'view' ? (
                                                <div
                                                    className={`relative inline-flex ${canOpenCollectionUpdates ? '' : 'group cursor-not-allowed'}`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setFulfillmentMode('edit')
                                                            setFulfillmentActionDraft('')
                                                            setFulfillmentActionError(null)
                                                        }}
                                                        disabled={!canOpenCollectionUpdates}
                                                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none"
                                                        aria-label="Update Collection Status"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                        Update Collection Status
                                                    </button>
                                                    {!canOpenCollectionUpdates ? (
                                                        <div
                                                            role="tooltip"
                                                            className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-80 rounded-md border border-slate-200 bg-slate-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                                                        >
                                                            {collectionUpdateDisabledTooltip}
                                                            <span
                                                                className="absolute -bottom-1 right-4 h-2 w-2 rotate-45 border-b border-r border-slate-200 bg-slate-900"
                                                                aria-hidden="true"
                                                            />
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}

                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="mb-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Audit Logs</p>
                                            <p className="mt-1 text-xs text-subtext-light">
                                                Tracks fulfillment actions applied to this delivery order.
                                            </p>
                                        </div>
                                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                                                <thead className="bg-slate-50">
                                                    <tr>
                                                        <th scope="col" className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-subtext-light">Time</th>
                                                        <th scope="col" className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-subtext-light">Action</th>
                                                        <th scope="col" className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-subtext-light">Changes</th>
                                                        <th scope="col" className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-subtext-light">Note</th>
                                                        <th scope="col" className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-subtext-light">Updated By</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {selectedDeliveryOrder.fulfillment_events.length > 0 ? (
                                                        selectedDeliveryOrder.fulfillment_events.map((event) => (
                                                            <tr key={event.id}>
                                                                <td className="whitespace-nowrap px-3 py-2 text-xs text-subtext-light">{formatDateTime(event.created_at)}</td>
                                                                <td className="whitespace-nowrap px-3 py-2 font-medium text-text-light">{toFulfillmentActionLabel(event.action)}</td>
                                                                <td className="px-3 py-2 text-xs text-subtext-light">
                                                                    <p>
                                                                        Service: {toTitleStatus(event.from_service_state)} {'->'} {toTitleStatus(event.to_service_state)}
                                                                    </p>
                                                                    <p>
                                                                        Collection: {toTitleStatus(event.from_collection_status)} {'->'} {toTitleStatus(event.to_collection_status)}
                                                                    </p>
                                                                </td>
                                                                <td className="px-3 py-2 text-xs text-text-light">{event.note ?? '-'}</td>
                                                                <td className="whitespace-nowrap px-3 py-2 text-xs text-subtext-light">{event.actor_label}</td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={5} className="px-3 py-5 text-center text-sm text-subtext-light">
                                                                No audit logs recorded yet.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
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
                                    ) : null}

                                    {fulfillmentMode === 'edit' ? (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Collection Updates</p>
                                                <p className="mt-1 text-sm text-subtext-light">
                                                    Update pickup progress after a cancellation starts offboarding.
                                                </p>
                                                <p className="mt-1 text-xs text-subtext-light">
                                                    Current: Collection {toTitleStatus(currentCollectionStatus)} | Service {toTitleStatus(currentServiceState)}
                                                </p>
                                            </div>

                                            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                                                <p className="text-sm text-subtext-light">
                                                    Choose one update option below.
                                                </p>
                                                <div className="mt-4 grid gap-4">
                                                    <div>
                                                        <label htmlFor="fulfillment-action" className="block text-xs uppercase tracking-wide text-subtext-light">
                                                            Collection Update
                                                        </label>
                                                        <select
                                                            id="fulfillment-action"
                                                            value={fulfillmentActionDraft}
                                                            onChange={(event) => {
                                                                setFulfillmentActionDraft(event.target.value as AdminFulfillmentAction | '')
                                                                if (fulfillmentActionError) setFulfillmentActionError(null)
                                                            }}
                                                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                            disabled={!hasSubscriptionContext || fulfillmentActionSaving !== null}
                                                        >
                                                            <option value="">Select an option</option>
                                                            {FULFILLMENT_ACTION_OPTIONS.map((option) => {
                                                                const isAllowed = hasSubscriptionContext
                                                                    && canRunFulfillmentAction(option.action, currentServiceState, currentCollectionStatus)
                                                                return (
                                                                    <option key={option.action} value={option.action} disabled={!isAllowed}>
                                                                        {isAllowed ? option.label : `${option.label} (Subscription is currently active)`}
                                                                    </option>
                                                                )
                                                            })}
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label htmlFor="fulfillment-note" className="block text-xs uppercase tracking-wide text-subtext-light">
                                                            Note
                                                        </label>
                                                        <textarea
                                                            id="fulfillment-note"
                                                            value={fulfillmentNoteDraft}
                                                            onChange={(event) => {
                                                                setFulfillmentNoteDraft(event.target.value)
                                                                if (fulfillmentActionError) setFulfillmentActionError(null)
                                                            }}
                                                            rows={3}
                                                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                            placeholder="Add details for your team. Required for Collect & close."
                                                            disabled={!hasSubscriptionContext || fulfillmentActionSaving !== null}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="mt-3 space-y-1">
                                                    {isAdminFulfillmentAction(fulfillmentActionDraft) ? (
                                                        <p className="text-xs text-subtext-light">
                                                            {FULFILLMENT_ACTION_OPTIONS.find((option) => option.action === fulfillmentActionDraft)?.helpText}
                                                        </p>
                                                    ) : (
                                                        <p className="text-xs text-subtext-light">
                                                            Partially collect = some items returned. Collect & close = all items returned and service closed.
                                                        </p>
                                                    )}
                                                    {isAdminFulfillmentAction(fulfillmentActionDraft) && !canRunFulfillmentAction(fulfillmentActionDraft, currentServiceState, currentCollectionStatus) ? (
                                                        <p className="text-xs text-amber-700">
                                                            This option becomes available after offboarding is requested.
                                                        </p>
                                                    ) : null}
                                                    {isAdminFulfillmentAction(fulfillmentActionDraft) && fulfillmentActionRequiresNote(fulfillmentActionDraft) ? (
                                                        <p className="text-xs text-subtext-light">A note is required for this option.</p>
                                                    ) : null}
                                                    {fulfillmentActionError ? <p className="text-xs text-red-700">{fulfillmentActionError}</p> : null}
                                                </div>

                                                <div className="mt-5 flex justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setFulfillmentMode('view')
                                                            setFulfillmentActionDraft('')
                                                            setFulfillmentNoteDraft('')
                                                            setFulfillmentActionError(null)
                                                        }}
                                                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light hover:bg-slate-50"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void saveFulfillmentUpdate()}
                                                        disabled={!hasSubscriptionContext || fulfillmentActionSaving !== null}
                                                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        {fulfillmentActionSaving ? 'Saving...' : 'Save Collection Update'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <ErrorState message="Delivery order details are unavailable." />
                            )}
            </AdminModal>
        </div>
    )
}
