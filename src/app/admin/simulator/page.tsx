'use client'

import { useState, useCallback } from 'react'
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader'

type StateSnapshot = {
    subscription_id: string | null
    delivery_order_id: string | null
    billing: {
        status: string | null
        monthly_total: number | null
        start_date: string | null
        end_date: string | null
    }
    delivery_order: {
        status: string | null
        failure_reason: string | null
        rescheduled_at: string | null
        cancelled_reason: string | null
    }
    fulfillment: {
        service_state: string | null
        collection_status: string | null
        first_delivery_at: string | null
    }
    recent_do_events: Array<{
        from_status: string | null
        to_status: string
        failure_reason: string | null
        cancelled_reason: string | null
        created_at: string
    }>
    recent_fulfillment_events: Array<{
        action: string
        from_service_state: string | null
        to_service_state: string | null
        note: string | null
        created_at: string
    }>
}

type ActionLog = {
    id: number
    time: string
    action: string
    status: 'ok' | 'error'
    detail: string
}

function statusColor(variant: 'success' | 'warning' | 'error' | 'neutral') {
    if (variant === 'success') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    if (variant === 'warning') return 'bg-amber-100 text-amber-800 border-amber-200'
    if (variant === 'error') return 'bg-red-100 text-red-800 border-red-200'
    return 'bg-slate-100 text-slate-600 border-slate-200'
}

function billingVariant(status: string | null): 'success' | 'warning' | 'error' | 'neutral' {
    if (status === 'active') return 'success'
    if (status === 'pending_payment') return 'warning'
    if (status === 'payment_failed' || status === 'cancelled') return 'error'
    return 'neutral'
}

function doVariant(status: string | null): 'success' | 'warning' | 'error' | 'neutral' {
    if (status === 'delivered' || status === 'partially_delivered') return 'success'
    if (status === 'dispatched' || status === 'confirmed' || status === 'rescheduled') return 'warning'
    if (status === 'failed' || status === 'cancelled') return 'error'
    return 'neutral'
}

function fulfillmentVariant(state: string | null): 'success' | 'warning' | 'error' | 'neutral' {
    if (state === 'in_service') return 'success'
    if (state === 'offboarding_requested') return 'warning'
    if (state === 'closed') return 'error'
    return 'neutral'
}

function StatusBadge({ label, variant }: { label: string; variant: 'success' | 'warning' | 'error' | 'neutral' }) {
    return (
        <span className={`inline-block rounded-md border px-2.5 py-1 text-xs font-semibold ${statusColor(variant)}`}>
            {label}
        </span>
    )
}

function StateCard({ title, rows }: { title: string; rows: Array<{ label: string; value: string | null; variant?: 'success' | 'warning' | 'error' | 'neutral' }> }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">{title}</h3>
            <div className="space-y-2">
                {rows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">{row.label}</span>
                        {row.variant ? (
                            <StatusBadge label={row.value ?? '—'} variant={row.variant} />
                        ) : (
                            <span className="text-sm font-medium text-slate-800">{row.value ?? '—'}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

function ActionButton({
    label,
    onClick,
    color = 'slate',
    disabled,
}: {
    label: string
    onClick: () => void
    color?: 'slate' | 'emerald' | 'blue' | 'amber' | 'red' | 'orange' | 'indigo'
    disabled?: boolean
}) {
    const colorClasses: Record<string, string> = {
        slate: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
        blue: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
        amber: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
        red: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
        orange: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100',
        indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
    }

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`w-full rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${colorClasses[color]}`}
        >
            {label}
        </button>
    )
}

let logCounter = 0

export default function SimulatorPage() {
    const [subscriptionId, setSubscriptionId] = useState('')
    const [deliveryOrderId, setDeliveryOrderId] = useState('')
    const [state, setState] = useState<StateSnapshot | null>(null)
    const [logs, setLogs] = useState<ActionLog[]>([])
    const [busy, setBusy] = useState(false)

    const addLog = useCallback((action: string, status: 'ok' | 'error', detail: string) => {
        logCounter += 1
        const entry: ActionLog = {
            id: logCounter,
            time: new Date().toLocaleTimeString(),
            action,
            status,
            detail,
        }
        setLogs((prev) => [entry, ...prev].slice(0, 30))
    }, [])

    const refreshState = useCallback(async (subId?: string, doId?: string) => {
        const sid = subId || subscriptionId
        const did = doId || deliveryOrderId
        if (!sid && !did) return

        try {
            const params = new URLSearchParams()
            if (sid) params.set('subscription_id', sid)
            if (did) params.set('delivery_order_id', did)
            const res = await fetch(`/api/admin/simulator/state?${params}`)
            const json = await res.json()
            if (res.ok && json.data) {
                setState(json.data)
            }
        } catch {
            // Silent — state panel just won't update
        }
    }, [subscriptionId, deliveryOrderId])

    const handleScaffold = async () => {
        setBusy(true)
        try {
            const res = await fetch('/api/admin/simulator/scaffold', { method: 'POST' })
            const json = await res.json()
            if (res.ok && json.data) {
                const sid = json.data.subscription_id
                const did = json.data.delivery_order_id
                setSubscriptionId(sid)
                setDeliveryOrderId(did)
                addLog('Scaffold', 'ok', `Created subscription ${sid.slice(0, 8)}... + DO ${did.slice(0, 8)}... (billing: ${json.data.billing_status})`)
                await refreshState(sid, did)
            } else {
                addLog('Scaffold', 'error', json.error ?? 'Failed')
            }
        } catch (err: unknown) {
            addLog('Scaffold', 'error', err instanceof Error ? err.message : 'Failed')
        } finally {
            setBusy(false)
        }
    }

    const sendWebhook = async (eventType: string, label: string, subscriptionStatus?: string) => {
        if (!subscriptionId) return addLog(label, 'error', 'No subscription ID set')
        setBusy(true)
        try {
            const res = await fetch('/api/admin/simulator/webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event_type: eventType,
                    subscription_id: subscriptionId,
                    subscription_status: subscriptionStatus,
                }),
            })
            const json = await res.json()
            const webhookStatus = json.data?.webhook_status
            if (res.ok && webhookStatus === 200) {
                addLog(label, 'ok', `Webhook ${eventType} dispatched (HTTP ${webhookStatus})`)
            } else {
                addLog(label, 'error', `HTTP ${webhookStatus}: ${JSON.stringify(json.data?.webhook_response?.error ?? json.error ?? 'unknown')}`)
            }
            await refreshState()
        } catch (err: unknown) {
            addLog(label, 'error', err instanceof Error ? err.message : 'Failed')
        } finally {
            setBusy(false)
        }
    }

    const patchDeliveryOrder = async (doStatus: string, label: string, extra?: Record<string, string>) => {
        if (!deliveryOrderId) return addLog(label, 'error', 'No delivery order ID set')
        setBusy(true)
        try {
            const res = await fetch(`/api/admin/delivery-orders/${deliveryOrderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ do_status: doStatus, ...extra }),
            })
            const json = await res.json()
            if (res.ok) {
                addLog(label, 'ok', `DO → ${doStatus}`)
            } else {
                addLog(label, 'error', `HTTP ${res.status}: ${json.error ?? 'unknown'}`)
            }
            await refreshState()
        } catch (err: unknown) {
            addLog(label, 'error', err instanceof Error ? err.message : 'Failed')
        } finally {
            setBusy(false)
        }
    }

    const postFulfillmentAction = async (action: string, label: string, note?: string) => {
        if (!deliveryOrderId) return addLog(label, 'error', 'No delivery order ID set')
        setBusy(true)
        try {
            const res = await fetch(`/api/admin/delivery-orders/${deliveryOrderId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, note: note ?? null }),
            })
            const json = await res.json()
            if (res.ok) {
                addLog(label, 'ok', `Fulfillment action: ${action}`)
            } else {
                addLog(label, 'error', `HTTP ${res.status}: ${json.error ?? 'unknown'}`)
            }
            await refreshState()
        } catch (err: unknown) {
            addLog(label, 'error', err instanceof Error ? err.message : 'Failed')
        } finally {
            setBusy(false)
        }
    }

    const hasState = state !== null

    return (
        <div className="space-y-5">
            <AdminPageHeader
                eyebrow="Developer Tools"
                title="Status Simulator"
                description="Scaffold test data and trigger status transitions to see how billing, delivery, and fulfillment interact."
                actions={
                    <button
                        onClick={handleScaffold}
                        disabled={busy}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                        {busy ? 'Working...' : 'New Test Fixture'}
                    </button>
                }
            />

            {/* Target IDs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="text-xs font-medium text-slate-400 whitespace-nowrap">Subscription</span>
                    <input
                        type="text"
                        value={subscriptionId}
                        onChange={(e) => setSubscriptionId(e.target.value)}
                        onBlur={() => refreshState()}
                        className="flex-1 text-sm text-slate-700 bg-transparent outline-none font-mono"
                        placeholder="paste or scaffold..."
                    />
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="text-xs font-medium text-slate-400 whitespace-nowrap">Delivery Order</span>
                    <input
                        type="text"
                        value={deliveryOrderId}
                        onChange={(e) => setDeliveryOrderId(e.target.value)}
                        onBlur={() => refreshState()}
                        className="flex-1 text-sm text-slate-700 bg-transparent outline-none font-mono"
                        placeholder="paste or scaffold..."
                    />
                </div>
            </div>

            {/* Live State Panel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <StateCard
                    title="Billing"
                    rows={[
                        { label: 'Status', value: state?.billing.status ?? (hasState ? '—' : 'scaffold first'), variant: hasState ? billingVariant(state?.billing.status ?? null) : 'neutral' },
                        { label: 'Monthly', value: state?.billing.monthly_total != null ? `RM ${state.billing.monthly_total}` : null },
                    ]}
                />
                <StateCard
                    title="Delivery Order"
                    rows={[
                        { label: 'Status', value: state?.delivery_order.status ?? (hasState ? '—' : 'scaffold first'), variant: hasState ? doVariant(state?.delivery_order.status ?? null) : 'neutral' },
                        { label: 'Fail Reason', value: state?.delivery_order.failure_reason ?? null },
                        { label: 'Reschedule', value: state?.delivery_order.rescheduled_at ? new Date(state.delivery_order.rescheduled_at).toLocaleDateString() : null },
                        { label: 'Cancel Reason', value: state?.delivery_order.cancelled_reason ?? null },
                    ]}
                />
                <StateCard
                    title="Fulfillment"
                    rows={[
                        { label: 'Service', value: state?.fulfillment.service_state ?? (hasState ? '—' : 'scaffold first'), variant: hasState ? fulfillmentVariant(state?.fulfillment.service_state ?? null) : 'neutral' },
                        { label: 'Collection', value: state?.fulfillment.collection_status ?? null, variant: state?.fulfillment.collection_status === 'collected' ? 'success' : state?.fulfillment.collection_status === 'partially_collected' ? 'warning' : 'neutral' },
                        { label: 'First Delivery', value: state?.fulfillment.first_delivery_at ? new Date(state.fulfillment.first_delivery_at).toLocaleDateString() : null },
                    ]}
                />
            </div>

            {/* Action Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Billing Actions */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Billing (Webhook Simulation)</h3>
                    <div className="space-y-2">
                        <ActionButton label="Payment Succeeded" color="emerald" disabled={busy} onClick={() => sendWebhook('invoice.paid', 'Invoice Paid')} />
                        <ActionButton label="Payment Failed" color="red" disabled={busy} onClick={() => sendWebhook('invoice.payment_failed', 'Invoice Failed')} />
                        <ActionButton label="Subscription Active" color="blue" disabled={busy} onClick={() => sendWebhook('customer.subscription.updated', 'Sub Updated → Active', 'active')} />
                        <ActionButton label="Payment Overdue (Past Due)" color="amber" disabled={busy} onClick={() => sendWebhook('customer.subscription.updated', 'Sub Updated → Past Due', 'past_due')} />
                        <ActionButton label="Subscription Cancelled" color="red" disabled={busy} onClick={() => sendWebhook('customer.subscription.deleted', 'Sub Deleted')} />
                        <ActionButton label="Term Completed (e.g. 12mo done)" color="slate" disabled={busy} onClick={() => sendWebhook('customer.subscription.deleted', 'Sub Completed')} />
                    </div>
                </div>

                {/* Delivery Order Actions */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Delivery Order Transitions</h3>
                    <div className="space-y-2">
                        <ActionButton label="Dispatch" color="slate" disabled={busy} onClick={() => patchDeliveryOrder('dispatched', 'Dispatch')} />
                        <ActionButton label="Deliver" color="emerald" disabled={busy} onClick={() => patchDeliveryOrder('delivered', 'Deliver')} />
                        <ActionButton label="Partially Deliver" color="blue" disabled={busy} onClick={() => patchDeliveryOrder('partially_delivered', 'Partial Deliver')} />
                        <ActionButton label="Mark Failed" color="red" disabled={busy} onClick={() => patchDeliveryOrder('failed', 'Fail', { failure_reason: 'Simulated: customer not present at site' })} />
                        <ActionButton label="Reschedule" color="amber" disabled={busy} onClick={() => patchDeliveryOrder('rescheduled', 'Reschedule', { rescheduled_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() })} />
                        <ActionButton label="Cancel" color="red" disabled={busy} onClick={() => patchDeliveryOrder('cancelled', 'Cancel DO', { cancelled_reason: 'Simulated: customer requested cancellation' })} />
                    </div>
                </div>

                {/* Fulfillment Actions */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Fulfillment Actions</h3>
                    <div className="space-y-2">
                        <ActionButton label="Mark Partially Collected" color="orange" disabled={busy} onClick={() => postFulfillmentAction('mark_partially_collected', 'Partial Collect')} />
                        <ActionButton label="Mark Collected & Close" color="indigo" disabled={busy} onClick={() => postFulfillmentAction('mark_collected_and_close', 'Collect & Close', 'Simulated: all items returned and verified')} />
                    </div>
                    <p className="mt-3 text-xs text-slate-400">
                        Offboarding is triggered automatically when a subscription is cancelled via the billing panel above.
                    </p>
                </div>
            </div>

            {/* Action Log + Event History */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Action Log */}
                <div className="rounded-xl border border-slate-200 bg-slate-900 p-4 shadow-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Action Log</h3>
                    <div className="space-y-1 max-h-64 overflow-y-auto font-mono text-xs">
                        {logs.length === 0 && <p className="text-slate-500">Scaffold a fixture to get started.</p>}
                        {logs.map((log) => (
                            <div key={log.id} className="flex gap-2">
                                <span className="text-slate-500 shrink-0">{log.time}</span>
                                <span className={log.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
                                    {log.status === 'ok' ? '✓' : '✗'}
                                </span>
                                <span className="text-slate-300 font-semibold shrink-0">{log.action}</span>
                                <span className="text-slate-400 truncate">{log.detail}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Event History */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Event History (DB)</h3>
                    <div className="space-y-1 max-h-64 overflow-y-auto text-xs">
                        {!state && <p className="text-slate-400">No data loaded.</p>}
                        {state?.recent_do_events.map((e, i) => (
                            <div key={`do-${i}`} className="flex gap-2 text-slate-600">
                                <span className="text-slate-400 shrink-0">{new Date(e.created_at).toLocaleTimeString()}</span>
                                <span className="font-medium">DO</span>
                                <span>{e.from_status ?? '?'} → {e.to_status}</span>
                                {e.failure_reason && <span className="text-red-500 truncate">({e.failure_reason})</span>}
                                {e.cancelled_reason && <span className="text-red-500 truncate">({e.cancelled_reason})</span>}
                            </div>
                        ))}
                        {state?.recent_fulfillment_events.map((e, i) => (
                            <div key={`ff-${i}`} className="flex gap-2 text-slate-600">
                                <span className="text-slate-400 shrink-0">{new Date(e.created_at).toLocaleTimeString()}</span>
                                <span className="font-medium">FF</span>
                                <span>{e.action}</span>
                                {e.note && <span className="text-slate-400 truncate">({e.note})</span>}
                            </div>
                        ))}
                        {state && state.recent_do_events.length === 0 && state.recent_fulfillment_events.length === 0 && (
                            <p className="text-slate-400">No events recorded yet. Trigger some transitions above.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
