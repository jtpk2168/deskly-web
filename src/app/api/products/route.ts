import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../lib/apiResponse'
import { normalizeCategory } from '@/lib/products'

/** GET /api/products — List active products with optional filters */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const category = normalizeCategory(searchParams.get('category'))
        const search = searchParams.get('search')?.trim()

        let query = supabaseServer
            .from('products')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false })

        if (category) {
            query = query.eq('category', category)
        }

        if (search) {
            query = query.ilike('name', `%${search}%`)
        }

        const { data, error } = await query

        if (error) return errorResponse(error.message, 500)
        return successResponse(data)
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** POST /api/products — Not supported for public route */
export async function POST() {
    return errorResponse('Use /api/admin/products for product creation', 405)
}
