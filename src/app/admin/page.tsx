'use client'

import Link from 'next/link'
import { type LucideIcon, ArrowRight, Box, RefreshCw, ShoppingCart, TrendingUp, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AdminDashboard, getAdminDashboard } from '@/lib/api'

function formatCurrency(value: number) {
    return `RM ${value.toFixed(2)}`
}

function formatDateTime(value: string) {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '-'
    return parsed.toLocaleString()
}

function formatRelativeTime(value: Date | null) {
    if (!value) return 'Not synced yet'
    return `Updated ${value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function formatStatus(status: string | null) {
    if (!status) return 'unknown'
    return status
        .split('_')
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join(' ')
}

function getStatusClasses(status: string | null) {
    const normalized = (status ?? '').toLowerCase()
    if (normalized === 'delivered' || normalized === 'partially_delivered') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    if (normalized === 'dispatched' || normalized === 'confirmed' || normalized === 'rescheduled') return 'border-amber-200 bg-amber-50 text-amber-700'
    if (normalized === 'failed' || normalized === 'cancelled') return 'border-red-200 bg-red-50 text-red-700'
    if (normalized === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    if (normalized === 'pending_payment') return 'border-amber-200 bg-amber-50 text-amber-700'
    if (normalized === 'payment_failed') return 'border-red-200 bg-red-50 text-red-700'
    return 'border-slate-200 bg-slate-100 text-slate-700'
}

function toInitials(name: string) {
    const chunks = name.trim().split(/\s+/).filter(Boolean)
    if (chunks.length === 0) return 'U'
    if (chunks.length === 1) return chunks[0].slice(0, 1).toUpperCase()
    return `${chunks[0].slice(0, 1)}${chunks[1].slice(0, 1)}`.toUpperCase()
}

export default function AdminDashboardPage() {
    const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

    const loadDashboard = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await getAdminDashboard()
            setDashboard(data)
            setLastUpdated(new Date())
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadDashboard()
    }, [loadDashboard])

    return (
        <div className="space-y-6">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
                <div className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-sky-100 blur-3xl" />
                <div className="relative flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Admin Overview</p>
                        <h1 className="mt-2 text-2xl font-bold text-text-light">Operations Dashboard</h1>
                        <p className="mt-1 text-sm text-subtext-light">Live metrics from subscriptions, products, and users.</p>
                    </div>
                    <button
                        type="button"
                        onClick={loadDashboard}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatsCard
                    title="Total Revenue"
                    value={loading ? 'Loading...' : formatCurrency(dashboard?.totalRevenue ?? 0)}
                    subtitle="Recurring monthly revenue"
                    icon={TrendingUp}
                    tone="emerald"
                />
                <StatsCard
                    title="Active Rentals"
                    value={loading ? 'Loading...' : String(dashboard?.activeRentals ?? 0)}
                    subtitle="Subscriptions currently active"
                    icon={ShoppingCart}
                    tone="blue"
                />
                <StatsCard
                    title="Total Products"
                    value={loading ? 'Loading...' : String(dashboard?.totalProducts ?? 0)}
                    subtitle="Catalog items in inventory"
                    icon={Box}
                    tone="violet"
                />
                <StatsCard
                    title="Total Users"
                    value={loading ? 'Loading...' : String(dashboard?.totalUsers ?? 0)}
                    subtitle="Customer accounts"
                    icon={Users}
                    tone="amber"
                />
            </div>

            {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-lg font-semibold text-text-light">Recent Delivery Orders</h3>
                            <p className="text-sm text-subtext-light">Latest fulfillment activity generated from subscription checkouts.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold tracking-wide text-slate-700">
                                {dashboard?.recentOrders?.length ?? 0} orders
                            </span>
                            <Link
                                href="/admin/delivery-orders"
                                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-text-light transition hover:border-primary/40 hover:text-primary-dark"
                            >
                                View All
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </div>
                    {loading ? (
                        <div className="py-12 text-center text-subtext-light">Loading recent orders...</div>
                    ) : dashboard?.recentOrders?.length ? (
                        <ul className="space-y-3">
                            {dashboard.recentOrders.map((activity) => (
                                <li
                                    key={activity.id}
                                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-primary/30 hover:bg-slate-50"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-xs font-bold tracking-wide text-primary-dark">
                                                {toInitials(activity.customerName)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-text-light">{activity.customerName}</p>
                                                <p className="mt-1 text-sm text-subtext-light">{activity.itemName}</p>
                                                <p className="mt-1 text-xs text-subtext-light">{formatDateTime(activity.createdAt)}</p>
                                            </div>
                                        </div>
                                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${getStatusClasses(activity.status)}`}>
                                            {formatStatus(activity.status)}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-subtext-light">
                            No recent delivery orders
                        </div>
                    )}
                </section>
                <aside className="self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div>
                        <h3 className="text-lg font-semibold text-text-light">Quick Actions</h3>
                        <p className="mt-1 text-sm text-subtext-light">{formatRelativeTime(lastUpdated)}</p>
                    </div>
                    <div className="mt-5 space-y-3">
                        <Link
                            href="/admin/products/new"
                            className="group flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
                        >
                            <span>Add New Product</span>
                            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                        </Link>
                        <Link
                            href="/admin/delivery-orders"
                            className="group flex items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-text-light transition hover:border-primary/40 hover:text-primary-dark"
                        >
                            <span>View Delivery Orders</span>
                            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-subtext-light">
                        Keep inventory and order status updated daily to maintain accurate reporting.
                    </div>
                </aside>
            </div>
        </div>
    )
}

type StatsCardTone = 'emerald' | 'blue' | 'violet' | 'amber'

const STATS_CARD_TONE_CLASS: Record<StatsCardTone, { bar: string; icon: string; value: string }> = {
    emerald: {
        bar: 'from-emerald-400 to-emerald-600',
        icon: 'bg-emerald-100 text-emerald-700',
        value: 'text-emerald-700',
    },
    blue: {
        bar: 'from-sky-400 to-blue-600',
        icon: 'bg-sky-100 text-sky-700',
        value: 'text-sky-700',
    },
    violet: {
        bar: 'from-violet-400 to-indigo-600',
        icon: 'bg-violet-100 text-violet-700',
        value: 'text-violet-700',
    },
    amber: {
        bar: 'from-amber-400 to-orange-500',
        icon: 'bg-amber-100 text-amber-700',
        value: 'text-amber-700',
    },
}

function StatsCard({
    title,
    value,
    subtitle,
    icon: Icon,
    tone,
}: {
    title: string
    value: string
    subtitle: string
    icon: LucideIcon
    tone: StatsCardTone
}) {
    const toneClasses = STATS_CARD_TONE_CLASS[tone]

    return (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className={`absolute left-0 right-0 top-0 h-1.5 bg-gradient-to-r ${toneClasses.bar}`} />
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-semibold text-subtext-light">{title}</p>
                    <p className={`mt-2 text-3xl font-bold ${toneClasses.value}`}>{value}</p>
                    <p className="mt-1 text-xs text-subtext-light">{subtitle}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClasses.icon}`}>
                    <Icon className="h-6 w-6" />
                </div>
            </div>
        </div>
    )
}
