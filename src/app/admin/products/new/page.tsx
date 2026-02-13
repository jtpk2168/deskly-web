'use client';

import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { createProduct } from '@/lib/api';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProductPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        category: '',
        monthly_price: '',
        stock_quantity: '',
        image_url: '',
        description: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData({
            ...formData,
            [e.target.id]: e.target.value,
        });
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            await createProduct({
                ...formData,
                monthly_price: parseFloat(formData.monthly_price),
                stock_quantity: parseInt(formData.stock_quantity),
            });
            router.push('/admin/products');
        } catch (error) {
            console.error(error);
            alert('Failed to create product');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/admin/products" className="text-subtext-light hover:text-text-light transition-colors">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="text-2xl font-bold text-text-light">Add New Product</h1>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <form className="space-y-6">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-text-light mb-1">Product Name</label>
                        <input
                            type="text"
                            id="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="e.g. Ergonomic Chair"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="category" className="block text-sm font-medium text-text-light mb-1">Category</label>
                            <select
                                id="category"
                                value={formData.category}
                                onChange={handleChange}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
                            >
                                <option value="">Select Category</option>
                                <option value="Chairs">Chairs</option>
                                <option value="Desks">Desks</option>
                                <option value="Accessories">Accessories</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="monthly_price" className="block text-sm font-medium text-text-light mb-1">Price (RM)</label>
                            <input
                                type="number"
                                id="monthly_price"
                                value={formData.monthly_price}
                                onChange={handleChange}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="stock_quantity" className="block text-sm font-medium text-text-light mb-1">Stock Quantity</label>
                            <input
                                type="number"
                                id="stock_quantity"
                                value={formData.stock_quantity}
                                onChange={handleChange}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <label htmlFor="image_url" className="block text-sm font-medium text-text-light mb-1">Image URL</label>
                            <input
                                type="text"
                                id="image_url"
                                value={formData.image_url}
                                onChange={handleChange}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="https://..."
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-text-light mb-1">Description</label>
                        <textarea
                            id="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={4}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="Product description..."
                        />
                    </div>

                    <div className="flex justify-end pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading}
                            className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
                        >
                            <Save className="h-4 w-4" />
                            {loading ? 'Saving...' : 'Save Product'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
