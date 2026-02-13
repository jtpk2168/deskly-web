'use client';

import Link from 'next/link';
import { Plus, Edit, Trash } from 'lucide-react';
import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { getProducts } from '@/lib/api';
import { useEffect, useState } from 'react';

export default function ProductsPage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            const data = await getProducts();
            // Map API data to Table format
            const mappedData = data.map((item: any) => ({
                id: item.id,
                name: item.name,
                category: item.category || 'Uncategorized',
                price: item.monthly_price,
                stock: item.stock_quantity,
                status: item.stock_quantity > 5 ? 'In Stock' : item.stock_quantity > 0 ? 'Low Stock' : 'Out of Stock',
                image: item.image_url || 'https://via.placeholder.com/150',
            }));
            setProducts(mappedData);
            setLoading(false);
        }
        loadData();
    }, []);

    const columns = [
        {
            header: 'Image',
            accessorKey: 'image',
            cell: (row: any) => (
                <img
                    src={row.image}
                    alt={row.name}
                    className="h-10 w-10 rounded-md object-cover"
                />
            ),
        },
        { header: 'Name', accessorKey: 'name' },
        { header: 'Category', accessorKey: 'category' },
        {
            header: 'Price',
            accessorKey: 'price',
            cell: (row: any) => `RM ${row.price?.toFixed(2)}`,
        },
        { header: 'Stock', accessorKey: 'stock' },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: (row: any) => {
                let variant = 'default';
                if (row.status === 'In Stock') variant = 'success';
                if (row.status === 'Low Stock') variant = 'warning';
                if (row.status === 'Out of Stock') variant = 'error';
                return <Badge variant={variant as any}>{row.status}</Badge>;
            },
        },
    ];

    const actions = (row: any) => (
        <div className="flex justify-end gap-2">
            <button className="text-subtext-light hover:text-primary transition-colors">
                <Edit className="h-4 w-4" />
            </button>
            <button className="text-subtext-light hover:text-red-500 transition-colors">
                <Trash className="h-4 w-4" />
            </button>
        </div>
    );

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-text-light">Products</h1>
                <Link
                    href="/admin/products/new"
                    className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Add Product
                </Link>
            </div>

            {loading ? (
                <div className="text-center py-10">Loading products...</div>
            ) : (
                <DataTable
                    columns={columns as any}
                    data={products}
                    actions={actions}
                />
            )}
        </div>
    );
}
