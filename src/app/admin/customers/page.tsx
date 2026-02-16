'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Trash } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { AdminUser, deleteCustomer, getCustomers } from '@/lib/api'

function getRoleVariant(role: AdminUser['role']): 'default' | 'success' | 'warning' | 'error' | 'outline' {
    return role === 'Admin' ? 'default' : 'outline'
}

export default function CustomersPage() {
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
        loadData()
    }, [loadData])

    const handleDelete = async (userId: string) => {
        if (!confirm('Are you sure you want to delete this customer?')) return
        try {
            await deleteCustomer(userId)
            await loadData()
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

    const actions = (row: AdminUser) => (
        <div className="flex justify-end gap-2">
            <button
                onClick={() => handleDelete(row.id)}
                className="text-subtext-light hover:text-red-500 transition-colors"
                title="Delete User"
            >
                <Trash className="h-4 w-4" />
            </button>
        </div>
    )

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-text-light">Customers</h1>
                <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors">
                    Invite Customer
                </button>
            </div>

            {loading ? (
                <div className="text-center py-10">Loading users...</div>
            ) : error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            ) : (
                <>
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
                </>
            )}
        </div>
    )
}
