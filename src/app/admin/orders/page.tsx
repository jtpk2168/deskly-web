'use client';

import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { getOrders } from '@/lib/api';
import { Eye } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function OrdersPage() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            const data = await getOrders();
            setOrders(data);
            setLoading(false);
        }
        loadData();
    }, []);

    const columns = [
        { header: 'Order ID', accessorKey: 'id' },
        { header: 'Customer', accessorKey: 'customer' },
        { header: 'Items', accessorKey: 'items' },
        {
            header: 'Total',
            accessorKey: 'total',
            cell: (row: any) => `RM ${row.total?.toFixed(2)}`,
        },
        { header: 'Date', accessorKey: 'date' },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: (row: any) => {
                let variant = 'default';
                if (row.status === 'active' || row.status === 'Delivered') variant = 'success';
                if (row.status === 'pending' || row.status === 'Processing') variant = 'warning';
                if (row.status === 'cancelled' || row.status === 'Cancelled') variant = 'error';
                return <Badge variant={variant as any}>{row.status}</Badge>;
            },
        },
    ];

    const actions = (row: any) => (
        <button className="text-subtext-light hover:text-primary transition-colors">
            <Eye className="h-4 w-4" />
        </button>
    );

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
            ) : (
                <DataTable
                    columns={columns as any}
                    data={orders}
                    actions={actions}
                />
            )}
        </div>
    );
}
