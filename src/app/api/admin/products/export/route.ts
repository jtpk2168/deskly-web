import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '../../../../../../lib/supabaseServer'
import { errorResponse } from '../../../../../../lib/apiResponse'
import { applyAdminProductFilters, parseAdminProductFilters } from '@/lib/adminProducts'
import { toCsv } from '@/lib/csv'

/** GET /api/admin/products/export — Export filtered products as CSV (no media columns) */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const filters = parseAdminProductFilters(searchParams)

        const baseQuery = supabaseServer.from('products').select('*')
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
