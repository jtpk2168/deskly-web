'use client'

import { Power, Save } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { ChangeEvent, useEffect, useState } from 'react'
import { AdminFormPage } from '@/components/admin/shared/AdminFormPage'
import {
    ProductFormSections,
    type PricingTierFormState,
    type ProductFormState,
} from '@/components/admin/shared/products/ProductFormSections'
import { Badge } from '@/components/ui/Badge'
import { getProductStatusVariant } from '@/lib/admin-ui/statusVariants'
import { AdminProduct, getAdminProduct, updateAdminProduct, uploadProductMedia } from '@/lib/api'

function mapProductToForm(product: AdminProduct): ProductFormState {
    return {
        name: product.name ?? '',
        category: product.category ?? '',
        monthly_price: String(product.monthly_price ?? ''),
        pricing_mode: product.pricing_mode ?? 'fixed',
        pricing_tiers: product.pricing_tiers?.length
            ? [...product.pricing_tiers]
                .sort((a, b) => a.min_months - b.min_months)
                .map((tier) => ({
                    min_months: String(tier.min_months),
                    monthly_price: String(tier.monthly_price),
                }))
            : [{ min_months: '', monthly_price: '' }],
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
    const [formData, setFormData] = useState<ProductFormState | null>(null)
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

    const handleTierChange = (index: number, field: keyof PricingTierFormState, value: string) => {
        setFormData((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                pricing_tiers: prev.pricing_tiers.map((tier, tierIndex) => (
                    tierIndex === index ? { ...tier, [field]: value } : tier
                )),
            }
        })
    }

    const addPricingTier = () => {
        setFormData((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                pricing_tiers: [...prev.pricing_tiers, { min_months: '', monthly_price: '' }],
            }
        })
    }

    const removePricingTier = (index: number) => {
        setFormData((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                pricing_tiers: prev.pricing_tiers.filter((_, tierIndex) => tierIndex !== index),
            }
        })
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
            const pricingTiers = formData.pricing_tiers
                .filter((tier) => tier.min_months.trim() !== '' || tier.monthly_price.trim() !== '')
                .map((tier) => ({
                    min_months: Number(tier.min_months),
                    monthly_price: Number(tier.monthly_price),
                }))

            const updated = await updateAdminProduct(productId, {
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
        <AdminFormPage
            backHref="/admin/products"
            title="Edit Product"
            subtitle="Update product details, stock, pricing, and publication status."
        >
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                    <div>
                        <p className="text-xs font-medium uppercase text-subtext-light">Product ID</p>
                        <p className="text-sm font-semibold text-text-light">{product.product_code}</p>
                    </div>
                    <Badge variant={getProductStatusVariant(product.status)}>
                        {product.status}
                    </Badge>
                </div>

                <ProductFormSections
                    mode="edit"
                    formData={formData}
                    uploadingImage={uploadingImage}
                    uploadingVideo={uploadingVideo}
                    onChange={handleChange}
                    onTierChange={handleTierChange}
                    onAddPricingTier={addPricingTier}
                    onRemovePricingTier={removePricingTier}
                    onMediaUpload={handleMediaUpload}
                />

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
        </AdminFormPage>
    )
}
