'use client'

import { type ChangeEvent } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import { ProductMediaPreview } from '@/components/admin/ProductMediaPreview'
import { type ProductPricingMode } from '@/lib/api'
import { PRODUCT_CATEGORIES } from '@/lib/products'

export type PricingTierFormState = {
    min_months: string
    monthly_price: string
}

export type ProductFormState = {
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

type ProductFormSectionsProps = {
    mode: 'create' | 'edit'
    formData: ProductFormState
    uploadingImage: boolean
    uploadingVideo: boolean
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
    onTierChange: (index: number, field: keyof PricingTierFormState, value: string) => void
    onAddPricingTier: () => void
    onRemovePricingTier: (index: number) => void
    onMediaUpload: (mediaType: 'image' | 'video', event: ChangeEvent<HTMLInputElement>) => void
}

export function ProductFormSections({
    mode,
    formData,
    uploadingImage,
    uploadingVideo,
    onChange,
    onTierChange,
    onAddPricingTier,
    onRemovePricingTier,
    onMediaUpload,
}: ProductFormSectionsProps) {
    const isCreate = mode === 'create'

    return (
        <>
            <div className="rounded-md border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                <p className="font-semibold">Media Guidelines</p>
                <p className="mt-1">Images: JPG/PNG/WebP, up to 5MB.</p>
                <p>Videos: MP4/MOV, up to 60 seconds, up to 30MB.</p>
            </div>

            <div>
                <label htmlFor="name" className="mb-1 block text-sm font-medium text-text-light">Product Name</label>
                <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={onChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light"
                    placeholder={isCreate ? 'e.g. Ergonomic Chair' : undefined}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                    <label htmlFor="category" className="mb-1 block text-sm font-medium text-text-light">Category</label>
                    <select
                        id="category"
                        value={formData.category}
                        onChange={onChange}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-text-light"
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
                    <label htmlFor="monthly_price" className="mb-1 block text-sm font-medium text-text-light">Base Monthly Price (RM)</label>
                    <input
                        type="number"
                        id="monthly_price"
                        min="0"
                        step="0.01"
                        value={formData.monthly_price}
                        onChange={onChange}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light"
                        placeholder={isCreate ? '0.00' : undefined}
                    />
                </div>
            </div>

            <div>
                <label htmlFor="pricing_mode" className="mb-1 block text-sm font-medium text-text-light">Pricing Mode</label>
                <select
                    id="pricing_mode"
                    value={formData.pricing_mode}
                    onChange={onChange}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-text-light"
                >
                    <option value="fixed">Fixed monthly pricing</option>
                    <option value="tiered">Tiered monthly pricing</option>
                </select>
                <p className="mt-1 text-xs text-subtext-light">
                    Fixed: same monthly price for all durations. Tiered: add multiple discounts by minimum rental months.
                </p>
            </div>

            {formData.pricing_mode === 'tiered' ? (
                <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-text-light">Pricing Tiers</p>
                        <button
                            type="button"
                            onClick={onAddPricingTier}
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
                                onChange={(event) => onTierChange(index, 'min_months', event.target.value)}
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-text-light"
                                placeholder="Min months (e.g. 6)"
                            />
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={tier.monthly_price}
                                onChange={(event) => onTierChange(index, 'monthly_price', event.target.value)}
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-text-light"
                                placeholder="Monthly price (RM)"
                            />
                            <button
                                type="button"
                                onClick={() => onRemovePricingTier(index)}
                                disabled={formData.pricing_tiers.length <= 1}
                                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-text-light hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={`Delete tier ${index + 1}`}
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}

            <div>
                <label htmlFor="stock_quantity" className="mb-1 block text-sm font-medium text-text-light">Stock Quantity</label>
                <input
                    type="number"
                    id="stock_quantity"
                    min="0"
                    step="1"
                    value={formData.stock_quantity}
                    onChange={onChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light"
                    placeholder={isCreate ? '0' : undefined}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm font-medium text-text-light">Product Image</label>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-text-light hover:bg-gray-50">
                        <Upload className="h-4 w-4" />
                        {uploadingImage ? 'Uploading image...' : 'Upload Image'}
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(event) => onMediaUpload('image', event)}
                            disabled={uploadingImage}
                        />
                    </label>
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-text-light">Product Video</label>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-text-light hover:bg-gray-50">
                        <Upload className="h-4 w-4" />
                        {uploadingVideo ? 'Uploading video...' : 'Upload Video'}
                        <input
                            type="file"
                            accept="video/mp4,video/quicktime,.mov"
                            className="hidden"
                            onChange={(event) => onMediaUpload('video', event)}
                            disabled={uploadingVideo}
                        />
                    </label>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                    <label htmlFor="image_url" className="mb-1 block text-sm font-medium text-text-light">Image URL (Optional)</label>
                    <input
                        type="text"
                        id="image_url"
                        value={formData.image_url}
                        readOnly
                        className="w-full cursor-not-allowed rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-text-light"
                        placeholder={isCreate ? 'https://...' : undefined}
                    />
                </div>
                <div>
                    <label htmlFor="video_url" className="mb-1 block text-sm font-medium text-text-light">Video URL (Optional)</label>
                    <input
                        type="text"
                        id="video_url"
                        value={formData.video_url}
                        readOnly
                        className="w-full cursor-not-allowed rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-text-light"
                        placeholder={isCreate ? 'https://...' : undefined}
                    />
                </div>
            </div>

            <ProductMediaPreview imageUrl={formData.image_url} videoUrl={formData.video_url} />

            <div>
                <label htmlFor="description" className="mb-1 block text-sm font-medium text-text-light">Description</label>
                <textarea
                    id="description"
                    value={formData.description}
                    onChange={onChange}
                    rows={4}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light"
                    placeholder={isCreate ? 'Product description...' : undefined}
                />
            </div>
        </>
    )
}
