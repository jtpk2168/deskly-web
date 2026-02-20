'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Eye, RefreshCw, Trash, X } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { PaginationControls } from '@/components/ui/PaginationControls'
import {
    AdminSubscription,
    AdminUser,
    CustomerProfile,
    deleteCustomer,
    getAdminSubscriptions,
    getCustomerProfile,
    getCustomers,
} from '@/lib/api'

function getRoleVariant(role: AdminUser['role']): 'default' | 'success' | 'warning' | 'error' | 'outline' {
    return role === 'Admin' ? 'default' : 'outline'
}

function getBillingStatusVariant(status: string | null): 'default' | 'success' | 'warning' | 'error' | 'outline' {
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

function formatId(value: string) {
    const normalized = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    return normalized.slice(0, 8)
}

function formatAddress(line1: string | null | undefined, city: string | null | undefined, postal: string | null | undefined) {
    const parts = [
        line1?.trim(),
        [city?.trim(), postal?.trim()].filter(Boolean).join(' ').trim(),
    ].filter((value) => value && value.length > 0) as string[]
    return parts.length > 0 ? parts.join(', ') : '-'
}

export default function CustomersPage() {
    const [users, setUsers] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(10)
    const [total, setTotal] = useState(0)
    const [selectedCustomer, setSelectedCustomer] = useState<AdminUser | null>(null)
    const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null)
    const [customerProfileLoading, setCustomerProfileLoading] = useState(false)
    const [customerProfileError, setCustomerProfileError] = useState<string | null>(null)
    const [customerSubscriptions, setCustomerSubscriptions] = useState<AdminSubscription[]>([])
    const [customerSubscriptionsLoading, setCustomerSubscriptionsLoading] = useState(false)
    const [customerSubscriptionsError, setCustomerSubscriptionsError] = useState<string | null>(null)
    const [customerSubscriptionsPage, setCustomerSubscriptionsPage] = useState(1)
    const [customerSubscriptionsLimit, setCustomerSubscriptionsLimit] = useState(5)
    const [customerSubscriptionsTotal, setCustomerSubscriptionsTotal] = useState(0)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await getCustomers({ page, limit })
            setUsers(result.items)
            setTotal(result.total)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load customers')
        } finally {
            setLoading(false)
        }
    }, [page, limit])

    useEffect(() => {
        void loadData()
    }, [loadData])

    const loadCustomerProfile = useCallback(async (userId: string) => {
        setCustomerProfileLoading(true)
        setCustomerProfileError(null)
        try {
            const profile = await getCustomerProfile(userId)
            setCustomerProfile(profile)
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : 'Failed to load customer profile'
            if (message.toLowerCase().includes('profile not found')) {
                setCustomerProfile(null)
                setCustomerProfileError(null)
            } else {
                setCustomerProfileError(message)
            }
        } finally {
            setCustomerProfileLoading(false)
        }
    }, [])

    const loadCustomerSubscriptions = useCallback(async () => {
        if (!selectedCustomer) return
        setCustomerSubscriptionsLoading(true)
        setCustomerSubscriptionsError(null)
        try {
            const response = await getAdminSubscriptions({
                userId: selectedCustomer.id,
                page: customerSubscriptionsPage,
                limit: customerSubscriptionsLimit,
                sortBy: 'created_at',
                sortDir: 'desc',
            })
            setCustomerSubscriptions(response.items)
            setCustomerSubscriptionsTotal(response.total)
        } catch (loadError) {
            setCustomerSubscriptionsError(loadError instanceof Error ? loadError.message : 'Failed to load customer subscriptions')
        } finally {
            setCustomerSubscriptionsLoading(false)
        }
    }, [customerSubscriptionsLimit, customerSubscriptionsPage, selectedCustomer])

    useEffect(() => {
        if (!selectedCustomer) return
        void loadCustomerProfile(selectedCustomer.id)
    }, [loadCustomerProfile, selectedCustomer])

    useEffect(() => {
        if (!selectedCustomer) return
        void loadCustomerSubscriptions()
    }, [loadCustomerSubscriptions, selectedCustomer])

    const closeCustomerModal = useCallback(() => {
        setSelectedCustomer(null)
        setCustomerProfile(null)
        setCustomerProfileLoading(false)
        setCustomerProfileError(null)
        setCustomerSubscriptions([])
        setCustomerSubscriptionsLoading(false)
        setCustomerSubscriptionsError(null)
        setCustomerSubscriptionsPage(1)
        setCustomerSubscriptionsLimit(5)
        setCustomerSubscriptionsTotal(0)
    }, [])

    const openCustomerModal = useCallback((customer: AdminUser) => {
        setSelectedCustomer(customer)
        setCustomerProfile(null)
        setCustomerProfileError(null)
        setCustomerSubscriptions([])
        setCustomerSubscriptionsError(null)
        setCustomerSubscriptionsPage(1)
        setCustomerSubscriptionsLimit(5)
        setCustomerSubscriptionsTotal(0)
    }, [])

    const handleDelete = async (userId: string) => {
        if (!confirm('Are you sure you want to delete this customer?')) return
        try {
            await deleteCustomer(userId)
            await loadData()
            if (selectedCustomer?.id === userId) {
                closeCustomerModal()
            }
        } catch (deleteError) {
            alert(deleteError instanceof Error ? deleteError.message : 'Failed to delete customer')
        }
    }

    const columns: Array<{
        header: string
        accessorKey?: keyof AdminUser
        cell?: (row: AdminUser) => ReactNode
    }> = [
        { header: 'User ID', accessorKey: 'id' },
        { header: 'Name', accessorKey: 'name' },
        { header: 'Email', accessorKey: 'email' },
        { header: 'Joined Date', accessorKey: 'joinedDate' },
        {
            header: 'Role',
            accessorKey: 'role',
            cell: (row) => <Badge variant={getRoleVariant(row.role)}>{row.role}</Badge>,
        },
    ]

    const customerSubscriptionColumns: Array<{
        header: string
        accessorKey?: keyof AdminSubscription
        cell?: (row: AdminSubscription) => ReactNode
    }> = [
        {
            header: 'Subscription ID',
            accessorKey: 'id',
            cell: (row) => <span className="font-semibold tracking-wide text-text-light">{formatId(row.id)}</span>,
        },
        { header: 'Items', accessorKey: 'items' },
        {
            header: 'Monthly Rate',
            accessorKey: 'total',
            cell: (row) => formatCurrency(row.total),
        },
        { header: 'Date', accessorKey: 'date' },
        {
            header: 'Billing Status',
            accessorKey: 'billing_status',
            cell: (row) => <Badge variant={getBillingStatusVariant(row.billing_status)}>{row.billing_status ?? '-'}</Badge>,
        },
    ]

    const actions = (row: AdminUser) => (
        <div className="flex justify-end gap-2">
            <button
                type="button"
                onClick={() => openCustomerModal(row)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-subtext-light transition hover:border-primary/40 hover:text-primary"
                title="View Customer Details"
            >
                <Eye className="h-4 w-4" />
            </button>
            <button
                onClick={() => handleDelete(row.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-subtext-light transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                title="Delete User"
            >
                <Trash className="h-4 w-4" />
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
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">User Management</p>
                            <h1 className="mt-1 text-2xl font-bold text-text-light">Customers</h1>
                            <p className="mt-1 text-sm text-subtext-light">View and manage customer accounts registered on Deskly.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadData()}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>
                </div>
            </section>

            {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-subtext-light shadow-sm">Loading users...</div>
            ) : error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            ) : (
                <div className="space-y-4">
                    <DataTable
                        columns={columns}
                        data={users}
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

            {selectedCustomer ? (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/55 p-4 backdrop-blur-sm md:p-8">
                    <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-subtext-light">Customer Details</p>
                                    <h2 className="mt-1 text-3xl font-bold tracking-tight text-text-light">{selectedCustomer.name}</h2>
                                    <p className="mt-1 text-sm text-subtext-light">{selectedCustomer.email}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeCustomerModal}
                                    className="rounded-full border border-slate-200 bg-white p-2 text-subtext-light transition-colors hover:border-slate-300 hover:text-text-light"
                                    aria-label="Close customer details"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-6 py-6">
                            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Profile & Company</p>
                                    <button
                                        type="button"
                                        onClick={() => void loadCustomerProfile(selectedCustomer.id)}
                                        disabled={customerProfileLoading}
                                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-text-light transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <RefreshCw className={`h-3.5 w-3.5 ${customerProfileLoading ? 'animate-spin' : ''}`} />
                                        Refresh
                                    </button>
                                </div>

                                {customerProfileError ? (
                                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{customerProfileError}</div>
                                ) : null}

                                {customerProfileLoading ? (
                                    <p className="text-sm text-subtext-light">Loading customer profile...</p>
                                ) : (
                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Full Name</p>
                                            <p className="mt-1 text-sm font-semibold text-text-light">{customerProfile?.full_name ?? selectedCustomer.name}</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Email</p>
                                            <p className="mt-1 text-sm text-text-light">{selectedCustomer.email}</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Phone</p>
                                            <p className="mt-1 text-sm text-text-light">{customerProfile?.phone_number ?? '-'}</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Job Title</p>
                                            <p className="mt-1 text-sm text-text-light">{customerProfile?.job_title ?? '-'}</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Company Name</p>
                                            <p className="mt-1 text-sm text-text-light">{customerProfile?.company?.company_name ?? '-'}</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Registration No.</p>
                                            <p className="mt-1 text-sm text-text-light">{customerProfile?.company?.registration_number ?? '-'}</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Industry</p>
                                            <p className="mt-1 text-sm text-text-light">{customerProfile?.company?.industry ?? '-'}</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Team Size</p>
                                            <p className="mt-1 text-sm text-text-light">{customerProfile?.company?.team_size ?? '-'}</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 sm:col-span-2 xl:col-span-2">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Office Address</p>
                                            <p className="mt-1 text-sm text-text-light">
                                                {formatAddress(
                                                    customerProfile?.company?.address,
                                                    customerProfile?.company?.office_city,
                                                    customerProfile?.company?.office_zip_postal,
                                                )}
                                            </p>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 sm:col-span-2 xl:col-span-2">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Delivery Address</p>
                                            <p className="mt-1 text-sm text-text-light">
                                                {formatAddress(
                                                    customerProfile?.company?.delivery_address ?? customerProfile?.company?.address,
                                                    customerProfile?.company?.delivery_city ?? customerProfile?.company?.office_city,
                                                    customerProfile?.company?.delivery_zip_postal ?? customerProfile?.company?.office_zip_postal,
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </section>

                            <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Subscriptions</p>
                                        <p className="mt-1 text-sm text-subtext-light">Billing subscriptions for this customer.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void loadCustomerSubscriptions()}
                                        disabled={customerSubscriptionsLoading}
                                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-text-light transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <RefreshCw className={`h-3.5 w-3.5 ${customerSubscriptionsLoading ? 'animate-spin' : ''}`} />
                                        Refresh
                                    </button>
                                </div>

                                {customerSubscriptionsError ? (
                                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{customerSubscriptionsError}</div>
                                ) : null}

                                {customerSubscriptionsLoading ? (
                                    <div className="py-10 text-center text-sm text-subtext-light">Loading subscriptions...</div>
                                ) : (
                                    <div className="space-y-4">
                                        <DataTable columns={customerSubscriptionColumns} data={customerSubscriptions} />
                                        <PaginationControls
                                            page={customerSubscriptionsPage}
                                            limit={customerSubscriptionsLimit}
                                            total={customerSubscriptionsTotal}
                                            loading={customerSubscriptionsLoading}
                                            onPageChange={setCustomerSubscriptionsPage}
                                            onLimitChange={(nextLimit) => {
                                                setCustomerSubscriptionsLimit(nextLimit)
                                                setCustomerSubscriptionsPage(1)
                                            }}
                                        />
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
