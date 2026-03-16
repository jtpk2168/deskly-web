import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../lib/apiResponse'
import { requireAdmin } from '../../../../lib/apiAuth'
import { parsePaginationParams } from '@/lib/pagination'
import { normalizeBillingStatus } from '@/lib/billing/types'

type OrderRecord = {
    id: string
    monthly_total: number | null
    status: string | null
    created_at: string
    bundles: { name: string | null } | null
    profiles: { full_name: string | null; email?: string | null } | null
}

/** GET /api/orders — List all subscriptions (orders) for admin */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdmin(request)
        if (!auth.authenticated) return auth.response

        const { searchParams } = new URL(request.url)
        const { page, limit, from, to } = parsePaginationParams(searchParams)

        const { data, error, count } = await supabaseServer
            .from('subscriptions')
            .select(`
                *,
                bundles (
                    name,
                    image_url
                ),
                profiles (
                    full_name
                )
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to)

        if (error) {
            return errorResponse(error.message, 500)
        }

        // Transform data for Admin UI
        const orders = (data as OrderRecord[]).map((sub) => ({
            id: sub.id,
            customer: sub.profiles?.full_name || sub.profiles?.email || 'Unknown User',
            items: sub.bundles?.name || 'Bundle',
            total: sub.monthly_total,
            status: normalizeBillingStatus(sub.status),
            date: new Date(sub.created_at).toLocaleDateString(),
        }))

        return successResponse(orders, 200, {
            page,
            limit,
            total: count ?? 0,
        })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}
