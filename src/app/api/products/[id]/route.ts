import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../../lib/apiResponse'

type RouteParams = { params: Promise<{ id: string }> }

/** GET /api/products/:id — Get a single product */
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

/** PATCH /api/products/:id — Update a product */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid product ID format', 400)

        const body = await request.json()

        const { data, error } = await supabaseServer
            .from('products')
            .update({ ...body, updated_at: new Date().toISOString() })
            .eq('id', uuid)
            .select()
            .single()

        if (error || !data) return errorResponse('Product not found or update failed', 404)
        return successResponse(data)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}

/** DELETE /api/products/:id — Soft-delete a product */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid product ID format', 400)

        const { data, error } = await supabaseServer
            .from('products')
            .update({ is_active: false })
            .eq('id', uuid)
            .select()
            .single()

        if (error || !data) return errorResponse('Product not found', 404)
        return successResponse({ message: 'Product deactivated' })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}
