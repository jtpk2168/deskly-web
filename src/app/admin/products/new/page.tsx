'use client'

import { Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ChangeEvent, useState } from 'react'
import { AdminFormPage } from '@/components/admin/shared/AdminFormPage'
import {
    ProductFormSections,
    type PricingTierFormState,
    type ProductFormState,
} from '@/components/admin/shared/products/ProductFormSections'
import { createAdminProduct, uploadProductMedia } from '@/lib/api'

const initialFormState: ProductFormState = {
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
    const [formData, setFormData] = useState<ProductFormState>(initialFormState)
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
        <AdminFormPage
            backHref="/admin/products"
            title="Add New Product"
            subtitle="Create a new catalog product with pricing, stock, and media."
        >
                <ProductFormSections
                    mode="create"
                    formData={formData}
                    uploadingImage={uploadingImage}
                    uploadingVideo={uploadingVideo}
                    onChange={handleChange}
                    onTierChange={handleTierChange}
                    onAddPricingTier={addPricingTier}
                    onRemovePricingTier={removePricingTier}
                    onMediaUpload={handleMediaUpload}
                />

                <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
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
        </AdminFormPage>
    )
}
