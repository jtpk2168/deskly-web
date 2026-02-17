import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../../lib/apiResponse'

type RouteParams = { params: Promise<{ id: string }> }

type SubscriptionItemRecord = {
    product_name: string | null
    category: string | null
    monthly_price: number | string | null
    duration_months: number | string | null
    quantity: number | string | null
    products: {
        image_url: string | null
    } | {
        image_url: string | null
    }[] | null
}

function parseMoney(value: number | string | null | undefined) {
    if (value == null) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function parsePositiveInteger(value: number | string | null | undefined) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) return null
    return parsed
}

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

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

        let itemRows: SubscriptionItemRecord[] = []
        const { data: itemData, error: itemError } = await supabaseServer
            .from('subscription_items')
            .select(`
                product_name,
                category,
                monthly_price,
                duration_months,
                quantity,
                products (
                    image_url
                )
            `)
            .eq('subscription_id', uuid)
            .order('created_at', { ascending: true })

        // Fail open: details page should still load even when order-item rows are unavailable.
        if (!itemError) {
            itemRows = (itemData ?? []) as SubscriptionItemRecord[]
        }

        const subscriptionItems = itemRows.map((item) => {
            const product = unwrapSingle(item.products)
            return {
                product_name: item.product_name?.trim() || item.category?.trim() || 'Item',
                category: item.category?.trim() || null,
                monthly_price: parseMoney(item.monthly_price),
                duration_months: parsePositiveInteger(item.duration_months),
                quantity: parsePositiveInteger(item.quantity) ?? 1,
                image_url: product?.image_url ?? null,
            }
        })

        return successResponse({
            ...data,
            subscription_items: subscriptionItems,
        })
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
