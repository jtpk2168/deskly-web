'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { RefreshCw, Trash } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { AdminUser, deleteAdmin, getAdmins } from '@/lib/api'

function getRoleVariant(role: AdminUser['role']): 'default' | 'success' | 'warning' | 'error' | 'outline' {
    return role === 'Admin' ? 'default' : 'outline'
}

export default function AdminsPage() {
    const [users, setUsers] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(10)
    const [total, setTotal] = useState(0)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await getAdmins({ page, limit })
            setUsers(result.items)
            setTotal(result.total)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load admins')
        } finally {
            setLoading(false)
        }
    }, [page, limit])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleDelete = async (userId: string) => {
        if (!confirm('Are you sure you want to delete this admin?')) return
        try {
            await deleteAdmin(userId)
            await loadData()
        } catch (deleteError) {
            alert(deleteError instanceof Error ? deleteError.message : 'Failed to delete admin')
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

    const actions = (row: AdminUser) => (
        <div className="flex justify-end gap-2">
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
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Access Control</p>
                            <h1 className="mt-1 text-2xl font-bold text-text-light">Admins</h1>
                            <p className="mt-1 text-sm text-subtext-light">Manage administrative accounts with elevated platform access.</p>
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
        </div>
    )
}
