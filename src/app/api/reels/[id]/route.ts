import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../../lib/apiResponse'

type RouteParams = { params: Promise<{ id: string }> }

/** GET /api/reels/:id — Get a single reel and increment views */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid reel ID format', 400)

        const { data, error } = await supabaseServer
            .from('reels')
            .select('*')
            .eq('id', uuid)
            .single()

        if (error || !data) return errorResponse('Reel not found', 404)

        // Increment views_count in the background
        supabaseServer
            .from('reels')
            .update({ views_count: (data.views_count ?? 0) + 1 })
            .eq('id', uuid)
            .then(() => { })

        return successResponse(data)
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** PATCH /api/reels/:id — Update a reel */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid reel ID format', 400)

        const body = await request.json()

        const { data, error } = await supabaseServer
            .from('reels')
            .update(body)
            .eq('id', uuid)
            .select()
            .single()

        if (error || !data) return errorResponse('Reel not found or update failed', 404)
        return successResponse(data)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}

/** DELETE /api/reels/:id — Soft-delete a reel */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid reel ID format', 400)

        const { data, error } = await supabaseServer
            .from('reels')
            .update({ is_active: false })
            .eq('id', uuid)
            .select()
            .single()

        if (error || !data) return errorResponse('Reel not found', 404)
        return successResponse({ message: 'Reel deactivated' })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}
