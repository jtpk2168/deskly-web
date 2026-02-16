import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../../../lib/apiResponse'
import { isValidHttpUrl, normalizeCategory, normalizeStatus } from '@/lib/products'

type RouteParams = { params: Promise<{ id: string }> }

/** GET /api/admin/products/:id — Get one product for edit */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid product ID format', 400)

        const { data, error } = await supabaseServer
            .from('products')
            .select('*')
            .eq('id', uuid)
            .single()

        if (error || !data) return errorResponse('Product not found', 404)
        return successResponse(data)
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
            .select('id, published_at')
            .eq('id', uuid)
            .single()

        if (existingError || !existing) return errorResponse('Product not found', 404)

        const updates: Record<string, unknown> = {}

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

        if (body?.monthly_price !== undefined) {
            const monthlyPrice = Number(body.monthly_price)
            if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
                return errorResponse('monthly_price must be a positive number', 400)
            }
            updates.monthly_price = monthlyPrice
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
            .select('*')
            .single()

        if (error || !data) return errorResponse('Product not found or update failed', 404)
        return successResponse(data)
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
