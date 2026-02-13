import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../../lib/apiResponse'

type RouteParams = { params: Promise<{ id: string }> }

/** GET /api/subscriptions/:id — Get subscription details */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid subscription ID format', 400)

        const { data, error } = await supabaseServer
            .from('subscriptions')
            .select('*, bundles(*)')
            .eq('id', uuid)
            .single()

        if (error || !data) return errorResponse('Subscription not found', 404)
        return successResponse(data)
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** PATCH /api/subscriptions/:id — Update subscription status */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid subscription ID format', 400)

        const body = await request.json()
        const { status, end_date } = body

        if (status && !['active', 'pending', 'cancelled', 'completed'].includes(status)) {
            return errorResponse('Invalid status. Must be: active, pending, cancelled, or completed', 400)
        }

        const updatePayload: Record<string, unknown> = {}
        if (status) updatePayload.status = status
        if (end_date) updatePayload.end_date = end_date

        if (Object.keys(updatePayload).length === 0) {
            return errorResponse('No valid fields to update', 400)
        }

        const { data, error } = await supabaseServer
            .from('subscriptions')
            .update(updatePayload)
            .eq('id', uuid)
            .select()
            .single()

        if (error || !data) return errorResponse('Subscription not found or update failed', 404)
        return successResponse(data)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}
