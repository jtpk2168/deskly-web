import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../lib/apiResponse'

/** GET /api/subscriptions?user_id= — List user's subscriptions */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const userId = searchParams.get('user_id')

        if (!userId) return errorResponse('user_id query parameter is required', 400)

        const uuid = parseUUID(userId)
        if (!uuid) return errorResponse('Invalid user_id format', 400)

        const { data, error } = await supabaseServer
            .from('subscriptions')
            .select('*, bundles(*)')
            .eq('user_id', uuid)
            .order('created_at', { ascending: false })

        if (error) return errorResponse(error.message, 500)
        return successResponse(data)
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** POST /api/subscriptions — Create a subscription (checkout flow) */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { user_id, bundle_id, start_date, end_date, monthly_total } = body

        if (!user_id || !bundle_id) {
            return errorResponse('user_id and bundle_id are required', 400)
        }

        const userUuid = parseUUID(user_id)
        const bundleUuid = parseUUID(bundle_id)
        if (!userUuid || !bundleUuid) return errorResponse('Invalid ID format', 400)

        const { data, error } = await supabaseServer
            .from('subscriptions')
            .insert({
                user_id: userUuid,
                bundle_id: bundleUuid,
                status: 'pending',
                start_date: start_date ?? null,
                end_date: end_date ?? null,
                monthly_total: monthly_total ?? null,
            })
            .select()
            .single()

        if (error) return errorResponse(error.message, 500)
        return successResponse(data, 201)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}
