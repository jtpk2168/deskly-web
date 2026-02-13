import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../lib/apiResponse'

/** GET /api/products — List active products with optional filters */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const category = searchParams.get('category')
        const search = searchParams.get('search')

        let query = supabaseServer
            .from('products')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })

        if (category && category !== 'All') {
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

/** POST /api/products — Create a new product */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        const { name, description, category, monthly_price, image_url, stock_quantity } = body

        if (!name || !monthly_price) {
            return errorResponse('name and monthly_price are required', 400)
        }

        const { data, error } = await supabaseServer
            .from('products')
            .insert({
                name,
                description: description ?? null,
                category: category ?? null,
                monthly_price,
                image_url: image_url ?? null,
                stock_quantity: stock_quantity ?? 0,
                is_active: true,
            })
            .select()
            .single()

        if (error) {
            console.error('Supabase Error:', error);
            return errorResponse(error.message, 500)
        }
        return successResponse(data, 201)
    } catch (err) {
        console.error('API Error:', err);
        return errorResponse('Invalid request body', 400)
    }
}
