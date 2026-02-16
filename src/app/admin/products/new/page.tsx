'use client'

import Link from 'next/link'
import { ArrowLeft, Plus, Save, Trash2, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ChangeEvent, useState } from 'react'
import { ProductPricingMode, createAdminProduct, uploadProductMedia } from '@/lib/api'
import { PRODUCT_CATEGORIES } from '@/lib/products'
import { ProductMediaPreview } from '@/components/admin/ProductMediaPreview'

type PricingTierFormState = {
    min_months: string
    monthly_price: string
}

type FormState = {
    name: string
    category: string
    monthly_price: string
    pricing_mode: ProductPricingMode
    pricing_tiers: PricingTierFormState[]
    stock_quantity: string
    image_url: string
    video_url: string
    description: string
}

const initialFormState: FormState = {
    name: '',
    category: '',
    monthly_price: '',
    pricing_mode: 'fixed',
    pricing_tiers: [{ min_months: '', monthly_price: '' }],
    stock_quantity: '',
    image_url: '',
    video_url: '',
    description: '',
}

export default function NewProductPage() {
    const router = useRouter()
    const [formData, setFormData] = useState<FormState>(initialFormState)
    const [saving, setSaving] = useState(false)
    const [uploadingImage, setUploadingImage] = useState(false)
    const [uploadingVideo, setUploadingVideo] = useState(false)

    const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { id, value } = event.target
        setFormData((prev) => ({
            ...prev,
            [id]: value,
        }))
    }

    const handleTierChange = (index: number, field: keyof PricingTierFormState, value: string) => {
        setFormData((prev) => ({
            ...prev,
            pricing_tiers: prev.pricing_tiers.map((tier, tierIndex) => (
                tierIndex === index ? { ...tier, [field]: value } : tier
            )),
        }))
    }

    const addPricingTier = () => {
        setFormData((prev) => ({
            ...prev,
            pricing_tiers: [...prev.pricing_tiers, { min_months: '', monthly_price: '' }],
        }))
    }

    const removePricingTier = (index: number) => {
        setFormData((prev) => ({
            ...prev,
            pricing_tiers: prev.pricing_tiers.filter((_, tierIndex) => tierIndex !== index),
        }))
    }

    const handleMediaUpload = async (mediaType: 'image' | 'video', event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        if (mediaType === 'image') setUploadingImage(true)
        if (mediaType === 'video') setUploadingVideo(true)

        try {
            const url = await uploadProductMedia(file, mediaType)
            setFormData((prev) => ({
                ...prev,
                [mediaType === 'image' ? 'image_url' : 'video_url']: url,
            }))
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Upload failed')
        } finally {
            if (mediaType === 'image') setUploadingImage(false)
            if (mediaType === 'video') setUploadingVideo(false)
            event.target.value = ''
        }
    }

    const handleSubmit = async (status: 'draft' | 'active') => {
        setSaving(true)
        try {
            const pricingTiers = formData.pricing_tiers
                .filter((tier) => tier.min_months.trim() !== '' || tier.monthly_price.trim() !== '')
                .map((tier) => ({
                    min_months: Number(tier.min_months),
                    monthly_price: Number(tier.monthly_price),
                }))

            await createAdminProduct({
                name: formData.name,
                description: formData.description || null,
                category: formData.category,
                monthly_price: Number(formData.monthly_price),
                pricing_mode: formData.pricing_mode,
                pricing_tiers: formData.pricing_mode === 'tiered' ? pricingTiers : [],
                stock_quantity: Number(formData.stock_quantity || 0),
                image_url: formData.image_url || null,
                video_url: formData.video_url || null,
                status,
            })
            router.push('/admin/products')
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to save product')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/admin/products" className="text-subtext-light hover:text-text-light transition-colors">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="text-2xl font-bold text-text-light">Add New Product</h1>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-6">
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
                        placeholder="e.g. Ergonomic Chair"
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
                        <label htmlFor="monthly_price" className="block text-sm font-medium text-text-light mb-1">Base Monthly Price (RM)</label>
                        <input
                            type="number"
                            id="monthly_price"
                            min="0"
                            step="0.01"
                            value={formData.monthly_price}
                            onChange={handleChange}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light"
                            placeholder="0.00"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="pricing_mode" className="block text-sm font-medium text-text-light mb-1">Pricing Mode</label>
                    <select
                        id="pricing_mode"
                        value={formData.pricing_mode}
                        onChange={handleChange}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light bg-white"
                    >
                        <option value="fixed">Fixed monthly pricing</option>
                        <option value="tiered">Tiered monthly pricing</option>
                    </select>
                    <p className="mt-1 text-xs text-subtext-light">
                        Fixed: same monthly price for all durations. Tiered: add multiple discounts by minimum rental months.
                    </p>
                </div>

                {formData.pricing_mode === 'tiered' && (
                    <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-text-light">Pricing Tiers</p>
                            <button
                                type="button"
                                onClick={addPricingTier}
                                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-text-light hover:bg-gray-100"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Add Tier
                            </button>
                        </div>

                        {formData.pricing_tiers.map((tier, index) => (
                            <div key={`tier-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                                <input
                                    type="number"
                                    min="2"
                                    step="1"
                                    value={tier.min_months}
                                    onChange={(event) => handleTierChange(index, 'min_months', event.target.value)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-text-light"
                                    placeholder="Min months (e.g. 6)"
                                />
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={tier.monthly_price}
                                    onChange={(event) => handleTierChange(index, 'monthly_price', event.target.value)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-text-light"
                                    placeholder="Monthly price (RM)"
                                />
                                <button
                                    type="button"
                                    onClick={() => removePricingTier(index)}
                                    disabled={formData.pricing_tiers.length <= 1}
                                    className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-text-light hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label={`Delete tier ${index + 1}`}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

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
                        placeholder="0"
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
                            readOnly
                            className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-text-light cursor-not-allowed"
                            placeholder="https://..."
                        />
                    </div>
                    <div>
                        <label htmlFor="video_url" className="block text-sm font-medium text-text-light mb-1">Video URL (Optional)</label>
                        <input
                            type="text"
                            id="video_url"
                            value={formData.video_url}
                            readOnly
                            className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-text-light cursor-not-allowed"
                            placeholder="https://..."
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
                        placeholder="Product description..."
                    />
                </div>

                <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-gray-100">
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
    )
}
