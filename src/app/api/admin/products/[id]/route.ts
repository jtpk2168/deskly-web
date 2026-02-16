import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../../../lib/apiResponse'
import { isValidHttpUrl, normalizeCategory, normalizeStatus } from '@/lib/products'
import { ResolvedProductPricing, resolveProductPricing } from '@/lib/productPricing'
import { toProductResponse } from '@/lib/productResponse'

type RouteParams = { params: Promise<{ id: string }> }
const PRODUCT_SELECT = '*, product_pricing_tiers(id, min_months, monthly_price)'

async function getProductWithTiers(productId: string) {
    const { data, error } = await supabaseServer
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('id', productId)
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Product not found')
    }

    return data
}

/** GET /api/admin/products/:id — Get one product for edit */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid product ID format', 400)

        try {
            const product = await getProductWithTiers(uuid)
            return successResponse(toProductResponse(product))
        } catch {
            return errorResponse('Product not found', 404)
        }
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** PATCH /api/admin/products/:id — Update product */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid product ID format', 400)

        const body = await request.json()
        if (body?.product_code != null) {
            return errorResponse('product_code is immutable', 400)
        }

        const { data: existing, error: existingError } = await supabaseServer
            .from('products')
            .select('id, published_at, monthly_price, pricing_mode, product_pricing_tiers(min_months, monthly_price)')
            .eq('id', uuid)
            .single()

        if (existingError || !existing) return errorResponse('Product not found', 404)

        const updates: Record<string, unknown> = {}
        let resolvedPricing: ResolvedProductPricing | null = null

        if (body?.name !== undefined) {
            const name = String(body.name ?? '').trim()
            if (!name) return errorResponse('name cannot be empty', 400)
            updates.name = name
        }

        if (body?.description !== undefined) {
            const description = String(body.description ?? '').trim()
            updates.description = description || null
        }

        if (body?.category !== undefined) {
            const category = normalizeCategory(body.category)
            if (!category) return errorResponse('category is invalid', 400)
            updates.category = category
        }

        const hasPricingUpdate =
            body?.monthly_price !== undefined ||
            body?.pricing_mode !== undefined ||
            body?.pricing_tiers !== undefined

        if (hasPricingUpdate) {
            const pricing = resolveProductPricing({
                monthlyPrice: body?.monthly_price ?? existing.monthly_price,
                pricingMode: body?.pricing_mode ?? existing.pricing_mode ?? 'fixed',
                pricingTiers: body?.pricing_tiers ?? existing.product_pricing_tiers ?? [],
            })

            if (!pricing.value) {
                return errorResponse(pricing.error, 400)
            }

            updates.monthly_price = pricing.value.monthlyPrice
            updates.pricing_mode = pricing.value.pricingMode
            resolvedPricing = pricing.value
        }

        if (body?.stock_quantity !== undefined) {
            const stockQuantity = Number(body.stock_quantity)
            if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
                return errorResponse('stock_quantity must be an integer greater than or equal to 0', 400)
            }
            updates.stock_quantity = stockQuantity
        }

        if (body?.image_url !== undefined) {
            const imageUrl = body.image_url ? String(body.image_url).trim() : null
            if (!isValidHttpUrl(imageUrl)) return errorResponse('image_url must be a valid HTTP(S) URL', 400)
            updates.image_url = imageUrl
        }

        if (body?.video_url !== undefined) {
            const videoUrl = body.video_url ? String(body.video_url).trim() : null
            if (!isValidHttpUrl(videoUrl)) return errorResponse('video_url must be a valid HTTP(S) URL', 400)
            updates.video_url = videoUrl
        }

        if (body?.status !== undefined) {
            const status = normalizeStatus(body.status)
            if (!status) return errorResponse('status is invalid', 400)
            updates.status = status
            updates.is_active = status === 'active'
            if (status === 'active' && !existing.published_at) {
                updates.published_at = new Date().toISOString()
            }
        }

        if (Object.keys(updates).length === 0) {
            return errorResponse('No valid fields provided', 400)
        }

        updates.updated_at = new Date().toISOString()

        const { data, error } = await supabaseServer
            .from('products')
            .update(updates)
            .eq('id', uuid)
            .select('id')
            .single()

        if (error || !data) return errorResponse('Product not found or update failed', 404)

        if (resolvedPricing) {
            const { error: deleteTiersError } = await supabaseServer
                .from('product_pricing_tiers')
                .delete()
                .eq('product_id', uuid)

            if (deleteTiersError) {
                return errorResponse(deleteTiersError.message, 500)
            }

            if (resolvedPricing.pricingMode === 'tiered' && resolvedPricing.pricingTiers.length > 0) {
                const { error: insertTiersError } = await supabaseServer
                    .from('product_pricing_tiers')
                    .insert(
                        resolvedPricing.pricingTiers.map((tier) => ({
                            product_id: uuid,
                            min_months: tier.min_months,
                            monthly_price: tier.monthly_price,
                        }))
                    )

                if (insertTiersError) {
                    return errorResponse(insertTiersError.message, 500)
                }
            }
        }

        try {
            const product = await getProductWithTiers(uuid)
            return successResponse(toProductResponse(product))
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : 'Failed to load updated product'
            return errorResponse(message, 500)
        }
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}

/** DELETE /api/admin/products/:id — Soft deactivate product */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid product ID format', 400)

        const { data, error } = await supabaseServer
            .from('products')
            .update({
                status: 'inactive',
                is_active: false,
                updated_at: new Date().toISOString(),
            })
            .eq('id', uuid)
            .select('*')
            .single()

        if (error || !data) return errorResponse('Product not found', 404)
        return successResponse({ message: 'Product deactivated' })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}
