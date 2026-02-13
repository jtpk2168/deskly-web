import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../lib/apiResponse'

/** GET /api/reels — Paginated feed of active reels */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10)))
        const featured = searchParams.get('featured')

        const from = (page - 1) * limit
        const to = from + limit - 1

        let query = supabaseServer
            .from('reels')
            .select('*', { count: 'exact' })
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .range(from, to)

        if (featured === 'true') {
            query = query.eq('is_featured', true)
        }

        const { data, error, count } = await query

        if (error) return errorResponse(error.message, 500)
        return successResponse(data, 200, { page, limit, total: count ?? 0 })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** POST /api/reels — Create a new reel */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        const { title, description, video_url, thumbnail_url, duration_seconds, associated_bundle_id, product_ids, is_featured } = body

        if (!title || !video_url) {
            return errorResponse('title and video_url are required', 400)
        }

        const { data, error } = await supabaseServer
            .from('reels')
            .insert({
                title,
                description: description ?? null,
                video_url,
                thumbnail_url: thumbnail_url ?? null,
                duration_seconds: duration_seconds ?? null,
                associated_bundle_id: associated_bundle_id ?? null,
                product_ids: product_ids ?? [],
                is_featured: is_featured ?? false,
                is_active: true,
                views_count: 0,
            })
            .select()
            .single()

        if (error) return errorResponse(error.message, 500)
        return successResponse(data, 201)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}
