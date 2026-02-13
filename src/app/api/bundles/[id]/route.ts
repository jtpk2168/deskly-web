import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../../lib/apiResponse'

type RouteParams = { params: Promise<{ id: string }> }

/** GET /api/bundles/:id — Get a single bundle */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid bundle ID format', 400)

        const { data, error } = await supabaseServer
            .from('bundles')
            .select('*')
            .eq('id', uuid)
            .single()

        if (error || !data) return errorResponse('Bundle not found', 404)
        return successResponse(data)
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** PATCH /api/bundles/:id — Update a bundle */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid bundle ID format', 400)

        const body = await request.json()

        const { data, error } = await supabaseServer
            .from('bundles')
            .update({ ...body, updated_at: new Date().toISOString() })
            .eq('id', uuid)
            .select()
            .single()

        if (error || !data) return errorResponse('Bundle not found or update failed', 404)
        return successResponse(data)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}

/** DELETE /api/bundles/:id — Soft-delete a bundle */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid bundle ID format', 400)

        const { data, error } = await supabaseServer
            .from('bundles')
            .update({ is_active: false })
            .eq('id', uuid)
            .select()
            .single()

        if (error || !data) return errorResponse('Bundle not found', 404)
        return successResponse({ message: 'Bundle deactivated' })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}
