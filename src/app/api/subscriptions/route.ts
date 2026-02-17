import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../lib/apiResponse'

type SubscriptionItemInput = {
    product_id?: unknown
    product_name?: unknown
    category?: unknown
    monthly_price?: unknown
    duration_months?: unknown
    quantity?: unknown
}

type NormalizedSubscriptionItem = {
    product_id: string | null
    product_name: string
    category: string | null
    monthly_price: number | null
    duration_months: number | null
    quantity: number
}

function parseOptionalDate(value: unknown, fieldName: string) {
    if (value == null || value === '') return { value: null as string | null, error: null as string | null }
    if (typeof value !== 'string') return { value: null as string | null, error: `${fieldName} must be an ISO date string` }

    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return { value: null as string | null, error: `Invalid ${fieldName} format` }

    return { value: parsed.toISOString(), error: null as string | null }
}

function parseOptionalMoney(value: unknown, fieldName: string) {
    if (value == null || value === '') return { value: null as number | null, error: null as string | null }

    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) {
        return { value: null as number | null, error: `${fieldName} must be a non-negative number` }
    }

    return { value: Number(parsed.toFixed(2)), error: null as string | null }
}

function parseOptionalPositiveInteger(value: unknown, fieldName: string) {
    if (value == null || value === '') return { value: null as number | null, error: null as string | null }
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return { value: null as number | null, error: `${fieldName} must be a positive integer` }
    }
    return { value: parsed, error: null as string | null }
}

function parseSubscriptionItems(value: unknown) {
    if (value == null) return { items: [] as NormalizedSubscriptionItem[], error: null as string | null }
    if (!Array.isArray(value)) return { items: [] as NormalizedSubscriptionItem[], error: 'items must be an array' }

    const normalizedItems: NormalizedSubscriptionItem[] = []

    for (let index = 0; index < value.length; index += 1) {
        const rawItem = value[index]
        if (typeof rawItem !== 'object' || rawItem == null) {
            return { items: [] as NormalizedSubscriptionItem[], error: `items[${index}] must be an object` }
        }

        const item = rawItem as SubscriptionItemInput
        const productName = typeof item.product_name === 'string' ? item.product_name.trim() : ''
        if (!productName) return { items: [] as NormalizedSubscriptionItem[], error: `items[${index}].product_name is required` }

        const category = typeof item.category === 'string' && item.category.trim()
            ? item.category.trim()
            : null

        let productId: string | null = null
        if (item.product_id != null && item.product_id !== '') {
            const parsedProductId = parseUUID(String(item.product_id))
            if (!parsedProductId) {
                return { items: [] as NormalizedSubscriptionItem[], error: `items[${index}].product_id must be a valid UUID` }
            }
            productId = parsedProductId
        }

        const quantity = Number(item.quantity)
        if (!Number.isInteger(quantity) || quantity <= 0) {
            return { items: [] as NormalizedSubscriptionItem[], error: `items[${index}].quantity must be a positive integer` }
        }

        const monthlyPrice = parseOptionalMoney(item.monthly_price, `items[${index}].monthly_price`)
        if (monthlyPrice.error) return { items: [] as NormalizedSubscriptionItem[], error: monthlyPrice.error }

        const durationMonths = parseOptionalPositiveInteger(item.duration_months, `items[${index}].duration_months`)
        if (durationMonths.error) return { items: [] as NormalizedSubscriptionItem[], error: durationMonths.error }

        normalizedItems.push({
            product_id: productId,
            product_name: productName,
            category,
            monthly_price: monthlyPrice.value,
            duration_months: durationMonths.value,
            quantity,
        })
    }

    return { items: normalizedItems, error: null as string | null }
}

async function resolveAuthDisplayName(userId: string) {
    const { data, error } = await supabaseServer.auth.admin.getUserById(userId)
    if (error || !data.user) return null

    const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>
    const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : ''
    if (fullName) return fullName

    const name = typeof metadata.name === 'string' ? metadata.name.trim() : ''
    if (name) return name

    return data.user.email ?? null
}

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
        const { user_id, bundle_id, start_date, end_date, monthly_total, items } = body

        if (!user_id) {
            return errorResponse('user_id is required', 400)
        }

        const userUuid = parseUUID(user_id)
        if (!userUuid) return errorResponse('Invalid user_id format', 400)

        let bundleUuid: string | null = null
        if (bundle_id != null && bundle_id !== '') {
            bundleUuid = parseUUID(bundle_id)
            if (!bundleUuid) return errorResponse('Invalid bundle_id format', 400)
        }

        const startDate = parseOptionalDate(start_date, 'start_date')
        if (startDate.error) return errorResponse(startDate.error, 400)

        const endDate = parseOptionalDate(end_date, 'end_date')
        if (endDate.error) return errorResponse(endDate.error, 400)

        const monthlyTotal = parseOptionalMoney(monthly_total, 'monthly_total')
        if (monthlyTotal.error) return errorResponse(monthlyTotal.error, 400)

        const parsedItems = parseSubscriptionItems(items)
        if (parsedItems.error) return errorResponse(parsedItems.error, 400)

        const authDisplayName = await resolveAuthDisplayName(userUuid)

        const { data: existingProfile, error: profileLookupError } = await supabaseServer
            .from('profiles')
            .select('id, full_name')
            .eq('id', userUuid)
            .maybeSingle()

        if (profileLookupError) {
            return errorResponse(`Failed to validate user profile: ${profileLookupError.message}`, 500)
        }

        if (!existingProfile) {
            const { error: createProfileError } = await supabaseServer
                .from('profiles')
                .insert({ id: userUuid, full_name: authDisplayName })

            // Ignore race-condition duplicate errors from concurrent checkouts.
            if (createProfileError && createProfileError.code !== '23505') {
                return errorResponse(`Failed to initialize profile for checkout: ${createProfileError.message}`, 500)
            }
        } else if (!existingProfile.full_name && authDisplayName) {
            const { error: updateProfileError } = await supabaseServer
                .from('profiles')
                .update({ full_name: authDisplayName, updated_at: new Date().toISOString() })
                .eq('id', userUuid)

            if (updateProfileError) {
                return errorResponse(`Failed to update profile name: ${updateProfileError.message}`, 500)
            }
        }

        const { data, error } = await supabaseServer
            .from('subscriptions')
            .insert({
                user_id: userUuid,
                bundle_id: bundleUuid,
                status: 'pending',
                start_date: startDate.value,
                end_date: endDate.value,
                monthly_total: monthlyTotal.value,
            })
            .select()
            .single()

        if (error) return errorResponse(error.message, 500)

        if (parsedItems.items.length > 0) {
            const { error: itemsError } = await supabaseServer
                .from('subscription_items')
                .insert(
                    parsedItems.items.map((item) => ({
                        subscription_id: data.id,
                        product_id: item.product_id,
                        product_name: item.product_name,
                        category: item.category,
                        monthly_price: item.monthly_price,
                        duration_months: item.duration_months,
                        quantity: item.quantity,
                    }))
                )

            if (itemsError && itemsError.code !== '42P01') {
                return errorResponse(`Failed to save order items: ${itemsError.message}`, 500)
            }
        }

        return successResponse(data, 201)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}
