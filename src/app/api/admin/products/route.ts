import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../../lib/apiResponse'
import { applyAdminProductFilters, parseAdminProductFilters } from '@/lib/adminProducts'
import { isValidHttpUrl, normalizeCategory, normalizeStatus, resolveCategoryCode } from '@/lib/products'
import { parsePaginationParams } from '@/lib/pagination'

function isMissingGenerateCodeFunctionError(error: { message?: string } | null) {
    const message = error?.message?.toLowerCase() ?? ''
    return message.includes('generate_product_code') && message.includes('schema cache')
}

function isDuplicateProductCodeError(error: { message?: string; code?: string } | null) {
    if (error?.code === '23505') return true
    const message = error?.message?.toLowerCase() ?? ''
    return message.includes('duplicate key') && message.includes('product_code')
}

function parseProductCodeNumber(productCode: string, categoryCode: string) {
    const [prefix, suffix] = productCode.split('-')
    if (prefix !== categoryCode) return 0
    const value = Number.parseInt(suffix ?? '', 10)
    return Number.isFinite(value) ? value : 0
}

function formatProductCode(categoryCode: string, nextValue: number) {
    return `${categoryCode}-${String(nextValue).padStart(6, '0')}`
}

async function getNextProductCodeFallback(categoryCode: string) {
    const { data, error } = await supabaseServer
        .from('products')
        .select('product_code')
        .like('product_code', `${categoryCode}-%`)
        .order('product_code', { ascending: false })
        .limit(1)

    if (error) throw new Error(error.message)

    const currentCode = data?.[0]?.product_code ? String(data[0].product_code) : null
    const currentValue = currentCode ? parseProductCodeNumber(currentCode, categoryCode) : 0
    return formatProductCode(categoryCode, currentValue + 1)
}

async function allocateProductCode(categoryCode: string) {
    const { data, error } = await supabaseServer
        .rpc('generate_product_code', { p_category_code: categoryCode })

    if (!error && data) return String(data)
    if (!error) throw new Error('Failed to generate product code')
    if (!isMissingGenerateCodeFunctionError(error)) {
        throw new Error(error.message)
    }

    return getNextProductCodeFallback(categoryCode)
}

/** GET /api/admin/products — List products for admin with search/sort/filters */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const filters = parseAdminProductFilters(searchParams)
        const { page, limit, from, to } = parsePaginationParams(searchParams)

        const baseQuery = supabaseServer.from('products').select('*', { count: 'exact' })
        const query = applyAdminProductFilters(baseQuery, filters).range(from, to)
        const { data, error, count } = await query

        if (error) return errorResponse(error.message, 500)
        return successResponse(data ?? [], 200, {
            page,
            limit,
            total: count ?? 0,
        })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** POST /api/admin/products — Create product (draft or published) */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        const name = String(body?.name ?? '').trim()
        const description = String(body?.description ?? '').trim()
        const category = normalizeCategory(body?.category)
        const categoryCode = resolveCategoryCode(category)
        const status = normalizeStatus(body?.status) ?? 'draft'

        const monthlyPrice = Number(body?.monthly_price)
        const stockQuantity = Number(body?.stock_quantity ?? 0)
        const imageUrl = body?.image_url ? String(body.image_url).trim() : null
        const videoUrl = body?.video_url ? String(body.video_url).trim() : null

        if (!name) {
            return errorResponse('name is required', 400)
        }

        if (!category || !categoryCode) {
            return errorResponse('category is invalid', 400)
        }

        if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
            return errorResponse('monthly_price must be a positive number', 400)
        }

        if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
            return errorResponse('stock_quantity must be an integer greater than or equal to 0', 400)
        }

        if (!isValidHttpUrl(imageUrl) || !isValidHttpUrl(videoUrl)) {
            return errorResponse('image_url and video_url must be valid HTTP(S) URLs', 400)
        }

        for (let attempt = 0; attempt < 5; attempt += 1) {
            let generatedCode: string
            try {
                generatedCode = await allocateProductCode(categoryCode)
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to generate product code'
                return errorResponse(message, 500)
            }

            const now = new Date().toISOString()

            const { data, error } = await supabaseServer
                .from('products')
                .insert({
                    product_code: generatedCode,
                    name,
                    description: description || null,
                    category,
                    monthly_price: monthlyPrice,
                    image_url: imageUrl,
                    video_url: videoUrl,
                    stock_quantity: stockQuantity,
                    status,
                    is_active: status === 'active',
                    updated_at: now,
                    published_at: status === 'active' ? now : null,
                })
                .select('*')
                .single()

            if (!error && data) return successResponse(data, 201)
            if (!isDuplicateProductCodeError(error)) {
                return errorResponse(error?.message ?? 'Failed to create product', 500)
            }
        }

        return errorResponse('Failed to generate a unique product code. Please retry.', 409)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}
