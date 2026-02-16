'use client'

import Link from 'next/link'
import { ArrowLeft, Power, Save, Upload } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { ChangeEvent, useEffect, useState } from 'react'
import { AdminProduct, getAdminProduct, updateAdminProduct, uploadProductMedia } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { PRODUCT_CATEGORIES } from '@/lib/products'
import { ProductMediaPreview } from '@/components/admin/ProductMediaPreview'

type FormState = {
    name: string
    category: string
    monthly_price: string
    stock_quantity: string
    image_url: string
    video_url: string
    description: string
}

function getStatusVariant(status: 'draft' | 'active' | 'inactive') {
    if (status === 'active') return 'success'
    if (status === 'inactive') return 'error'
    return 'outline'
}

function mapProductToForm(product: AdminProduct): FormState {
    return {
        name: product.name ?? '',
        category: product.category ?? '',
        monthly_price: String(product.monthly_price ?? ''),
        stock_quantity: String(product.stock_quantity ?? 0),
        image_url: product.image_url ?? '',
        video_url: product.video_url ?? '',
        description: product.description ?? '',
    }
}

export default function EditProductPage() {
    const router = useRouter()
    const params = useParams<{ id: string }>()
    const productId = params?.id

    const [product, setProduct] = useState<AdminProduct | null>(null)
    const [formData, setFormData] = useState<FormState | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [uploadingImage, setUploadingImage] = useState(false)
    const [uploadingVideo, setUploadingVideo] = useState(false)

    useEffect(() => {
        async function loadProduct() {
            if (!productId) return
            setLoading(true)
            try {
                const data = await getAdminProduct(productId)
                setProduct(data)
                setFormData(mapProductToForm(data))
            } catch (error) {
                alert(error instanceof Error ? error.message : 'Failed to load product')
                router.push('/admin/products')
            } finally {
                setLoading(false)
            }
        }

        loadProduct()
    }, [productId, router])

    const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { id, value } = event.target
        setFormData((prev) => (prev ? { ...prev, [id]: value } : prev))
    }

    const handleMediaUpload = async (mediaType: 'image' | 'video', event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file || !formData) return

        if (mediaType === 'image') setUploadingImage(true)
        if (mediaType === 'video') setUploadingVideo(true)

        try {
            const url = await uploadProductMedia(file, mediaType)
            setFormData((prev) => (prev
                ? { ...prev, [mediaType === 'image' ? 'image_url' : 'video_url']: url }
                : prev
            ))
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Upload failed')
        } finally {
            if (mediaType === 'image') setUploadingImage(false)
            if (mediaType === 'video') setUploadingVideo(false)
            event.target.value = ''
        }
    }

    const handleSubmit = async (status: 'draft' | 'active') => {
        if (!productId || !formData) return
        setSaving(true)
        try {
            const updated = await updateAdminProduct(productId, {
                name: formData.name,
                description: formData.description || null,
                category: formData.category,
                monthly_price: Number(formData.monthly_price),
                stock_quantity: Number(formData.stock_quantity || 0),
                image_url: formData.image_url || null,
                video_url: formData.video_url || null,
                status,
            })
            setProduct(updated)
            setFormData(mapProductToForm(updated))
            alert('Product updated successfully')
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to update product')
        } finally {
            setSaving(false)
        }
    }

    const handleToggleActivation = async () => {
        if (!productId || !product) return
        setSaving(true)
        const nextStatus = product.status === 'active' ? 'inactive' : 'active'
        try {
            const updated = await updateAdminProduct(productId, { status: nextStatus })
            setProduct(updated)
            setFormData(mapProductToForm(updated))
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to update product status')
        } finally {
            setSaving(false)
        }
    }

    if (loading || !formData || !product) {
        return <div className="py-10 text-center text-subtext-light">Loading product...</div>
    }

    return (
        <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/admin/products" className="text-subtext-light hover:text-text-light transition-colors">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="text-2xl font-bold text-text-light">Edit Product</h1>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                    <div>
                        <p className="text-xs font-medium uppercase text-subtext-light">Product ID</p>
                        <p className="text-sm font-semibold text-text-light">{product.product_code}</p>
                    </div>
                    <Badge variant={getStatusVariant(product.status)}>
                        {product.status}
                    </Badge>
                </div>

                <div className="rounded-md border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                    <p className="font-semibold">Media Guidelines</p>
                    <p className="mt-1">Images: JPG/PNG/WebP, up to 5MB.</p>
                    <p>Videos: MP4/MOV, up to 60 seconds, up to 30MB.</p>
                </div>

                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-text-light mb-1">Product Name</label>
                    <input
                        type="text"
                        id="name"
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="category" className="block text-sm font-medium text-text-light mb-1">Category</label>
                        <select
                            id="category"
                            value={formData.category}
                            onChange={handleChange}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light bg-white"
                        >
                            <option value="">Select Category</option>
                            {PRODUCT_CATEGORIES.map((category) => (
                                <option key={category} value={category}>
                                    {category}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="monthly_price" className="block text-sm font-medium text-text-light mb-1">Price (RM)</label>
                        <input
                            type="number"
                            id="monthly_price"
                            min="0"
                            step="0.01"
                            value={formData.monthly_price}
                            onChange={handleChange}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="stock_quantity" className="block text-sm font-medium text-text-light mb-1">Stock Quantity</label>
                    <input
                        type="number"
                        id="stock_quantity"
                        min="0"
                        step="1"
                        value={formData.stock_quantity}
                        onChange={handleChange}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-text-light mb-1">Product Image</label>
                        <label className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-text-light hover:bg-gray-50 cursor-pointer">
                            <Upload className="h-4 w-4" />
                            {uploadingImage ? 'Uploading image...' : 'Upload Image'}
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(event) => handleMediaUpload('image', event)}
                                disabled={uploadingImage}
                            />
                        </label>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-light mb-1">Product Video</label>
                        <label className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-text-light hover:bg-gray-50 cursor-pointer">
                            <Upload className="h-4 w-4" />
                            {uploadingVideo ? 'Uploading video...' : 'Upload Video'}
                            <input
                                type="file"
                                accept="video/mp4,video/quicktime,.mov"
                                className="hidden"
                                onChange={(event) => handleMediaUpload('video', event)}
                                disabled={uploadingVideo}
                            />
                        </label>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="image_url" className="block text-sm font-medium text-text-light mb-1">Image URL (Optional)</label>
                        <input
                            type="text"
                            id="image_url"
                            value={formData.image_url}
                            onChange={handleChange}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light"
                        />
                    </div>
                    <div>
                        <label htmlFor="video_url" className="block text-sm font-medium text-text-light mb-1">Video URL (Optional)</label>
                        <input
                            type="text"
                            id="video_url"
                            value={formData.video_url}
                            onChange={handleChange}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light"
                        />
                    </div>
                </div>

                <ProductMediaPreview imageUrl={formData.image_url} videoUrl={formData.video_url} />

                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-text-light mb-1">Description</label>
                    <textarea
                        id="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={4}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light"
                    />
                </div>

                <div className="flex flex-wrap justify-between gap-2 pt-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={handleToggleActivation}
                        disabled={saving || uploadingImage || uploadingVideo}
                        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-text-light hover:bg-gray-50 disabled:opacity-50"
                    >
                        <Power className="h-4 w-4" />
                        {product.status === 'active' ? 'Deactivate Product' : 'Activate Product'}
                    </button>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => handleSubmit('draft')}
                            disabled={saving || uploadingImage || uploadingVideo}
                            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-text-light hover:bg-gray-50 disabled:opacity-50"
                        >
                            <Save className="h-4 w-4" />
                            Save Draft
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSubmit('active')}
                            disabled={saving || uploadingImage || uploadingVideo}
                            className="flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                        >
                            <Save className="h-4 w-4" />
                            Publish
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
