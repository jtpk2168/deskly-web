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
            .eq('status', 'active')
            .single()

        if (error || !data) return errorResponse('Product not found', 404)
        return successResponse(data)
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** PATCH /api/products/:id — Not supported for public route */
export async function PATCH() {
    return errorResponse('Use /api/admin/products/:id for product updates', 405)
}

/** DELETE /api/products/:id — Not supported for public route */
export async function DELETE() {
    return errorResponse('Use /api/admin/products/:id for product updates', 405)
}
