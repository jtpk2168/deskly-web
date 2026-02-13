import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../lib/apiResponse'

/** GET /api/bundles — List all active bundles */
export async function GET() {
    try {
        const { data, error } = await supabaseServer
            .from('bundles')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })

        if (error) return errorResponse(error.message, 500)
        return successResponse(data)
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** POST /api/bundles — Create a new bundle */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        const { name, description, monthly_price, image_url } = body

        if (!name || !monthly_price) {
            return errorResponse('name and monthly_price are required', 400)
        }

        const { data, error } = await supabaseServer
            .from('bundles')
            .insert({
                name,
                description: description ?? null,
                monthly_price,
                image_url: image_url ?? null,
                is_active: true,
            })
            .select()
            .single()

        if (error) return errorResponse(error.message, 500)
        return successResponse(data, 201)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}
