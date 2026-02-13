'use client';

import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { getCustomers, deleteCustomer } from '@/lib/api';
import { MoreHorizontal, Trash } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function CustomersPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    async function loadData() {
        const data = await getCustomers();
        setUsers(data);
        setLoading(false);
    }

    useEffect(() => {
        loadData();
    }, []);

    const handleDelete = async (userId: string) => {
        if (!confirm('Are you sure you want to delete this customer?')) return;
        try {
            await deleteCustomer(userId);
            loadData(); // Refresh list
        } catch (error: any) {
            alert(error.message);
        }
    };

    const columns = [
        { header: 'User ID', accessorKey: 'id' },
        { header: 'Name', accessorKey: 'name' },
        { header: 'Email', accessorKey: 'email' },
        { header: 'Joined Date', accessorKey: 'joinedDate' },
        {
            header: 'Role',
            accessorKey: 'role',
            cell: (row: any) => {
                let variant = 'default';
                if (row.role === 'Admin') variant = 'default';
                if (row.role === 'Customer') variant = 'outline';
                return <Badge variant={variant as any}>{row.role}</Badge>;
            },
        },
    ];

    const actions = (row: any) => (
        <div className="flex justify-end gap-2">
            <button
                onClick={() => handleDelete(row.id)}
                className="text-subtext-light hover:text-red-500 transition-colors"
                title="Delete User"
            >
                <Trash className="h-4 w-4" />
            </button>
        </div>
    );

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
            ) : (
                <DataTable
                    columns={columns as any}
                    data={users}
                    actions={actions}
                />
            )}
        </div>
    );
}
