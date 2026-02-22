'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Eye, RefreshCw, Trash } from 'lucide-react'
import { AdminModal } from '@/components/admin/shared/AdminModal'
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader'
import { ErrorState } from '@/components/admin/shared/ErrorState'
import { IconActionButton } from '@/components/admin/shared/IconActionButton'
import { LoadingState } from '@/components/admin/shared/LoadingState'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { formatAddressParts, formatCurrency, formatShortId } from '@/lib/admin-ui/formatters'
import { getBillingStatusVariant, getRoleVariant } from '@/lib/admin-ui/statusVariants'
import {
    AdminSubscription,
    AdminUser,
    CustomerProfile,
    deleteCustomer,
    getAdminSubscriptions,
    getCustomerProfile,
    getCustomers,
} from '@/lib/api'

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
            cell: (row) => <span className="font-semibold tracking-wide text-text-light">{formatShortId(row.id)}</span>,
        },
        { header: 'Items', accessorKey: 'items' },
        {
            header: 'Monthly Rate',
            accessorKey: 'total',
            cell: (row) => formatCurrency(row.total, 'RM', 'RM 0.00'),
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
            <IconActionButton
                label="View Customer Details"
                onClick={() => openCustomerModal(row)}
                icon={Eye}
            />
            <IconActionButton
                label="Delete User"
                onClick={() => handleDelete(row.id)}
                icon={Trash}
                tone="danger"
            />
        </div>
    )

    return (
        <div className="space-y-6">
            <AdminPageHeader
                eyebrow="User Management"
                title="Customers"
                description="View and manage customer accounts registered on Deskly."
                actions={(
                    <button
                        type="button"
                        onClick={() => void loadData()}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                )}
            />

            {loading ? (
                <LoadingState message="Loading users..." />
            ) : error ? (
                <ErrorState message={error} />
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
            <AdminModal
                open={selectedCustomer != null}
                onClose={closeCustomerModal}
                eyebrow="Customer Details"
                title={selectedCustomer.name}
                maxWidth="max-w-6xl"
            >
                <p className="mb-4 text-sm text-subtext-light">{selectedCustomer.email}</p>
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
                                    <LoadingState message="Loading customer profile..." />
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
                                                    {formatAddressParts(
                                                        customerProfile?.company?.address,
                                                        customerProfile?.company?.office_city,
                                                        customerProfile?.company?.office_zip_postal,
                                                )}
                                            </p>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 sm:col-span-2 xl:col-span-2">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtext-light">Delivery Address</p>
                                                <p className="mt-1 text-sm text-text-light">
                                                    {formatAddressParts(
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
                                    <LoadingState message="Loading subscriptions..." />
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
            </AdminModal>
            ) : null}
        </div>
    )
}
