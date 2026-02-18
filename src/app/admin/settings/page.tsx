'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatabaseZap, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { PaginationControls } from '@/components/ui/PaginationControls'
import {
    BillingCatalogSyncResult,
    BillingRuntimeConfig,
    BillingWebhookEvent,
    BillingWebhookEventProvider,
    BillingWebhookEventStatus,
    getBillingRuntimeConfig,
    getBillingWebhookEvents,
    syncBillingCatalog,
} from '@/lib/api'
import type { ReactNode } from 'react'

const STATUS_FILTER_OPTIONS: Array<{ value: 'all' | BillingWebhookEventStatus; label: string }> = [
    { value: 'all', label: 'All Statuses' },
    { value: 'received', label: 'Received' },
    { value: 'processed', label: 'Processed' },
    { value: 'failed', label: 'Failed' },
]

const PROVIDER_FILTER_OPTIONS: Array<{ value: 'all' | BillingWebhookEventProvider; label: string }> = [
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

function formatSstRate(rate: number) {
    return `${(rate * 100).toFixed(2)}%`
}

function getEventStatusVariant(status: BillingWebhookEventStatus): 'default' | 'success' | 'warning' | 'error' | 'outline' {
    if (status === 'processed') return 'success'
    if (status === 'received') return 'warning'
    if (status === 'failed') return 'error'
    return 'default'
}

function getProviderVariant(provider: string): 'default' | 'success' | 'warning' | 'error' | 'outline' {
    if (provider === 'stripe') return 'outline'
    if (provider === 'mock') return 'default'
    return 'default'
}

function shorten(value: string | null, size = 12) {
    if (!value) return '-'
    if (value.length <= size) return value
    return `${value.slice(0, size)}...`
}

function normalizeCsvProductIds(input: string) {
    const ids = input
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    return ids.length > 0 ? ids : undefined
}

function formatSyncAction(action: 'skipped' | 'created') {
    if (action === 'created') return 'Created in Stripe'
    return 'Already up to date'
}

export default function SettingsPage() {
    const [billingConfig, setBillingConfig] = useState<BillingRuntimeConfig | null>(null)
    const [billingConfigLoading, setBillingConfigLoading] = useState(true)
    const [billingConfigError, setBillingConfigError] = useState<string | null>(null)

    const [syncCurrency, setSyncCurrency] = useState('myr')
    const [syncProductIds, setSyncProductIds] = useState('')
    const [syncDryRun, setSyncDryRun] = useState(true)
    const [syncingCatalog, setSyncingCatalog] = useState(false)
    const [catalogSyncError, setCatalogSyncError] = useState<string | null>(null)
    const [catalogSyncResult, setCatalogSyncResult] = useState<BillingCatalogSyncResult | null>(null)

    const [events, setEvents] = useState<BillingWebhookEvent[]>([])
    const [eventsLoading, setEventsLoading] = useState(true)
    const [eventsError, setEventsError] = useState<string | null>(null)
    const [eventsPage, setEventsPage] = useState(1)
    const [eventsLimit, setEventsLimit] = useState(10)
    const [eventsTotal, setEventsTotal] = useState(0)
    const [eventsStatusFilter, setEventsStatusFilter] = useState<'all' | BillingWebhookEventStatus>('all')
    const [eventsProviderFilter, setEventsProviderFilter] = useState<'all' | BillingWebhookEventProvider>('all')
    const [eventsSearch, setEventsSearch] = useState('')

    const parsedSyncProductIds = useMemo(() => normalizeCsvProductIds(syncProductIds), [syncProductIds])

    const loadBillingConfig = useCallback(async () => {
        setBillingConfigLoading(true)
        setBillingConfigError(null)

        try {
            const config = await getBillingRuntimeConfig()
            setBillingConfig(config)
            setSyncCurrency((current) => (current.trim().length > 0 ? current : config.currency))
        } catch (error) {
            setBillingConfigError(error instanceof Error ? error.message : 'Failed to load billing config')
        } finally {
            setBillingConfigLoading(false)
        }
    }, [])

    const loadWebhookEvents = useCallback(async () => {
        setEventsLoading(true)
        setEventsError(null)

        try {
            const response = await getBillingWebhookEvents({
                page: eventsPage,
                limit: eventsLimit,
                status: eventsStatusFilter,
                provider: eventsProviderFilter,
                search: eventsSearch.trim() || undefined,
            })
            setEvents(response.items)
            setEventsTotal(response.total)
        } catch (error) {
            setEventsError(error instanceof Error ? error.message : 'Failed to load webhook events')
        } finally {
            setEventsLoading(false)
        }
    }, [eventsLimit, eventsPage, eventsProviderFilter, eventsSearch, eventsStatusFilter])

    useEffect(() => {
        void loadBillingConfig()
    }, [loadBillingConfig])

    useEffect(() => {
        void loadWebhookEvents()
    }, [loadWebhookEvents])

    const handleCatalogSync = useCallback(async () => {
        setSyncingCatalog(true)
        setCatalogSyncError(null)

        try {
            const response = await syncBillingCatalog({
                dry_run: syncDryRun,
                currency: syncCurrency.trim().toLowerCase() || undefined,
                product_ids: parsedSyncProductIds,
            })
            setCatalogSyncResult(response)
        } catch (error) {
            setCatalogSyncError(error instanceof Error ? error.message : 'Catalog sync failed')
        } finally {
            setSyncingCatalog(false)
        }
    }, [parsedSyncProductIds, syncCurrency, syncDryRun])

    const eventColumns: Array<{
        header: string
        accessorKey?: keyof BillingWebhookEvent
        cell?: (row: BillingWebhookEvent) => ReactNode
    }> = [
        {
            header: 'Provider',
            accessorKey: 'provider',
            cell: (row) => <Badge variant={getProviderVariant(row.provider)}>{row.provider}</Badge>,
        },
        {
            header: 'Event ID',
            accessorKey: 'event_id',
            cell: (row) => (
                <span className="font-mono text-xs" title={row.event_id}>
                    {shorten(row.event_id, 24)}
                </span>
            ),
        },
        {
            header: 'Type',
            accessorKey: 'event_type',
            cell: (row) => (
                <span className="font-mono text-xs" title={row.event_type}>
                    {shorten(row.event_type, 34)}
                </span>
            ),
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: (row) => <Badge variant={getEventStatusVariant(row.status)}>{row.status}</Badge>,
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
            header: 'Processed',
            accessorKey: 'processed_at',
            cell: (row) => formatDateTime(row.processed_at),
        },
        {
            header: 'Created',
            accessorKey: 'created_at',
            cell: (row) => formatDateTime(row.created_at),
        },
        {
            header: 'Error',
            accessorKey: 'error_message',
            cell: (row) => (
                <span className="inline-block max-w-[220px] truncate text-xs text-red-700" title={row.error_message ?? ''}>
                    {row.error_message ?? '-'}
                </span>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-text-light">Settings</h1>

            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-text-light">Billing Runtime</h2>
                        <p className="mt-1 text-sm text-subtext-light">Current backend billing provider and policy values.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadBillingConfig()}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-text-light hover:bg-gray-50"
                        disabled={billingConfigLoading}
                    >
                        <RefreshCw className={`h-4 w-4 ${billingConfigLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                {billingConfigError ? (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{billingConfigError}</div>
                ) : billingConfigLoading ? (
                    <p className="text-sm text-subtext-light">Loading billing config...</p>
                ) : billingConfig ? (
                    <div className="grid gap-3 md:grid-cols-6">
                        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                            <p className="text-xs uppercase tracking-wider text-subtext-light">Provider</p>
                            <div className="mt-1"><Badge variant={getProviderVariant(billingConfig.provider)}>{billingConfig.provider}</Badge></div>
                        </div>
                        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                            <p className="text-xs uppercase tracking-wider text-subtext-light">Currency</p>
                            <p className="mt-1 font-semibold text-text-light">{billingConfig.currency.toUpperCase()}</p>
                        </div>
                        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                            <p className="text-xs uppercase tracking-wider text-subtext-light">Min Term</p>
                            <p className="mt-1 font-semibold text-text-light">{billingConfig.minimum_term_months} months</p>
                        </div>
                        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                            <p className="text-xs uppercase tracking-wider text-subtext-light">SST Rate</p>
                            <p className="mt-1 font-semibold text-text-light">{formatSstRate(billingConfig.sst_rate)}</p>
                        </div>
                        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                            <p className="text-xs uppercase tracking-wider text-subtext-light">Auto Tax</p>
                            <p className="mt-1 font-semibold text-text-light">{billingConfig.stripe_automatic_tax_enabled ? 'Enabled' : 'Disabled'}</p>
                        </div>
                        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                            <p className="text-xs uppercase tracking-wider text-subtext-light">Manual Tax Rate</p>
                            <p className="mt-1 font-mono text-xs font-semibold text-text-light">{billingConfig.stripe_manual_tax_rate_id ?? '-'}</p>
                        </div>
                    </div>
                ) : null}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-text-light">Update Stripe Catalog</h2>
                    <p className="mt-1 text-sm text-subtext-light">
                        Keep Stripe product prices aligned with your active Deskly products.
                    </p>
                </div>

                <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                    Start with <strong>Preview</strong>. If the output looks right, run <strong>Apply</strong> to save to Stripe.
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <div>
                        <label htmlFor="syncCurrency" className="mb-1 block text-sm font-medium text-text-light">Currency Code</label>
                        <input
                            id="syncCurrency"
                            value={syncCurrency}
                            onChange={(event) => setSyncCurrency(event.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                            placeholder="myr"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="syncProductIds" className="mb-1 block text-sm font-medium text-text-light">Specific Product IDs (optional)</label>
                        <input
                            id="syncProductIds"
                            value={syncProductIds}
                            onChange={(event) => setSyncProductIds(event.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                            placeholder="Leave empty to sync all active products"
                        />
                        <p className="mt-1 text-xs text-subtext-light">Comma-separated IDs, for example: `id1,id2`.</p>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-sm text-text-light">
                        <input
                            type="checkbox"
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                            checked={syncDryRun}
                            onChange={(event) => setSyncDryRun(event.target.checked)}
                        />
                        Preview only (do not save)
                    </label>

                    <button
                        type="button"
                        onClick={() => void handleCatalogSync()}
                        disabled={syncingCatalog}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {syncingCatalog ? <RefreshCw className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
                        {syncingCatalog ? 'Working...' : syncDryRun ? 'Preview Changes' : 'Apply to Stripe'}
                    </button>
                </div>

                {catalogSyncError ? (
                    <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{catalogSyncError}</div>
                ) : null}

                {catalogSyncResult ? (
                    <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant={getProviderVariant(catalogSyncResult.provider)}>{catalogSyncResult.provider}</Badge>
                            <Badge variant={catalogSyncResult.dry_run ? 'warning' : 'success'}>
                                {catalogSyncResult.dry_run ? 'Preview' : 'Applied'}
                            </Badge>
                        </div>
                        <p className="text-sm text-text-light">
                            Checked <strong>{catalogSyncResult.total_products}</strong> product(s): created <strong>{catalogSyncResult.created_count}</strong>, reused <strong>{catalogSyncResult.skipped_count}</strong>.
                        </p>

                        <div className="mt-3 overflow-x-auto">
                            <table className="min-w-full text-left text-xs">
                                <thead>
                                    <tr className="text-subtext-light">
                                        <th className="px-2 py-1">Product</th>
                                        <th className="px-2 py-1">Result</th>
                                        <th className="px-2 py-1">Stripe Price ID</th>
                                        <th className="px-2 py-1">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {catalogSyncResult.synced.slice(0, 8).map((entry) => (
                                        <tr key={`${entry.product_id}:${entry.provider_price_id}`} className="border-t border-gray-200">
                                            <td className="px-2 py-1">{entry.product_name}</td>
                                            <td className="px-2 py-1">{formatSyncAction(entry.action)}</td>
                                            <td className="px-2 py-1 font-mono">{shorten(entry.provider_price_id, 26)}</td>
                                            <td className="px-2 py-1">{entry.currency.toUpperCase()} {entry.unit_amount.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : null}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-text-light">Stripe Webhook Events</h2>
                    <p className="mt-1 text-sm text-subtext-light">Recent webhook events with processing status and errors.</p>
                </div>

                <div className="mb-4 grid gap-3 md:grid-cols-4">
                    <input
                        value={eventsSearch}
                        onChange={(event) => {
                            setEventsSearch(event.target.value)
                            setEventsPage(1)
                        }}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40 md:col-span-2"
                        placeholder="Search event id or event type..."
                    />
                    <select
                        value={eventsProviderFilter}
                        onChange={(event) => {
                            setEventsProviderFilter(event.target.value as 'all' | BillingWebhookEventProvider)
                            setEventsPage(1)
                        }}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                        {PROVIDER_FILTER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <select
                        value={eventsStatusFilter}
                        onChange={(event) => {
                            setEventsStatusFilter(event.target.value as 'all' | BillingWebhookEventStatus)
                            setEventsPage(1)
                        }}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                        {STATUS_FILTER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>

                {eventsError ? (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{eventsError}</div>
                ) : null}

                <DataTable columns={eventColumns} data={events} />
                <PaginationControls
                    page={eventsPage}
                    limit={eventsLimit}
                    total={eventsTotal}
                    loading={eventsLoading}
                    onPageChange={setEventsPage}
                    onLimitChange={(nextLimit) => {
                        setEventsLimit(nextLimit)
                        setEventsPage(1)
                    }}
                />
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-text-light">General Platform Settings</h2>
                </div>
                <p className="mb-4 text-sm text-subtext-light">Placeholder section for non-billing settings.</p>
                <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
                >
                    <Save className="h-4 w-4" />
                    Save Changes
                </button>
            </section>
        </div>
    )
}
