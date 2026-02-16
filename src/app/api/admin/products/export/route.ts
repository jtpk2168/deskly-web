import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '../../../../../../lib/supabaseServer'
import { errorResponse } from '../../../../../../lib/apiResponse'
import { applyAdminProductFilters, parseAdminProductFilters } from '@/lib/adminProducts'
import { toCsv } from '@/lib/csv'

const PRODUCT_SELECT = '*, product_pricing_tiers(min_months, monthly_price)'

function formatPricingTiersForCsv(pricingTiers: Array<{ min_months: number; monthly_price: number }> | null | undefined) {
    if (!Array.isArray(pricingTiers) || pricingTiers.length === 0) return ''
    return [...pricingTiers]
        .sort((a, b) => a.min_months - b.min_months)
        .map((tier) => `${tier.min_months}:${Number(tier.monthly_price).toFixed(2)}`)
        .join('|')
}

/** GET /api/admin/products/export — Export filtered products as CSV (no media columns) */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const filters = parseAdminProductFilters(searchParams)

        const baseQuery = supabaseServer.from('products').select(PRODUCT_SELECT)
        const query = applyAdminProductFilters(baseQuery, filters)
        const { data, error } = await query

        if (error) return errorResponse(error.message, 500)

        const rows: Array<Array<unknown>> = [
            [
                'product_code',
                'name',
                'description',
                'category',
                'monthly_price',
                'pricing_mode',
                'pricing_tiers',
                'stock_quantity',
                'status',
                'created_at',
                'updated_at',
            ],
        ]

        for (const product of data ?? []) {
            rows.push([
                product.product_code,
                product.name,
                product.description ?? '',
                product.category ?? '',
                product.monthly_price,
                product.pricing_mode ?? 'fixed',
                formatPricingTiersForCsv(product.product_pricing_tiers),
                product.stock_quantity,
                product.status,
                product.created_at,
                product.updated_at ?? '',
            ])
        }

        const csv = toCsv(rows)
        const filename = `products-${new Date().toISOString().slice(0, 10)}.csv`

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-store',
            },
        })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}
