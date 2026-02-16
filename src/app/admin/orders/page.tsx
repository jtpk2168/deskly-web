'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { AdminOrder, getOrders } from '@/lib/api'

function getStatusVariant(status: string | null): 'default' | 'success' | 'warning' | 'error' | 'outline' {
    const normalizedStatus = status?.toLowerCase()
    if (normalizedStatus === 'active' || normalizedStatus === 'delivered') return 'success'
    if (normalizedStatus === 'pending' || normalizedStatus === 'processing') return 'warning'
    if (normalizedStatus === 'cancelled') return 'error'
    return 'default'
}

export default function OrdersPage() {
    const [orders, setOrders] = useState<AdminOrder[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(10)
    const [total, setTotal] = useState(0)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await getOrders({ page, limit })
            setOrders(result.items)
            setTotal(result.total)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load orders')
        } finally {
            setLoading(false)
        }
    }, [page, limit])

    useEffect(() => {
        loadData()
    }, [loadData])

    const columns: Array<{
        header: string
        accessorKey?: keyof AdminOrder
        cell?: (row: AdminOrder) => ReactNode
    }> = [
        { header: 'Order ID', accessorKey: 'id' },
        { header: 'Customer', accessorKey: 'customer' },
        { header: 'Items', accessorKey: 'items' },
        {
            header: 'Total',
            accessorKey: 'total',
            cell: (row) => `RM ${row.total?.toFixed(2) ?? '0.00'}`,
        },
        { header: 'Date', accessorKey: 'date' },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: (row) => <Badge variant={getStatusVariant(row.status)}>{row.status ?? '-'}</Badge>,
        },
    ]

    const actions = () => (
        <button className="text-subtext-light hover:text-primary transition-colors">
            <Eye className="h-4 w-4" />
        </button>
    )

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-text-light">Orders</h1>
                <div className="flex gap-2">
                    <select className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white">
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="active">Active</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-10">Loading orders...</div>
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
        </div>
    )
}
