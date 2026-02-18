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

type ProfileEligibilityRecord = {
    id: string
    full_name: string | null
    job_title: string | null
    phone_number: string | null
}

type CompanyEligibilityRecord = {
    company_name: string | null
    registration_number: string | null
    address: string | null
    office_city: string | null
    office_zip_postal: string | null
    delivery_address: string | null
    delivery_city: string | null
    delivery_zip_postal: string | null
    industry: string | null
    team_size: string | null
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

function hasText(value: string | null | undefined) {
    return typeof value === 'string' && value.trim().length > 0
}

function parseOptionalText(value: unknown) {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
}

function getMissingProfileFields(
    profile: ProfileEligibilityRecord | null,
    company: CompanyEligibilityRecord | null,
    businessEmail: string | null,
) {
    const missingFields: string[] = []

    if (!hasText(profile?.full_name)) missingFields.push('Full Name')
    if (!hasText(profile?.job_title)) missingFields.push('Job Title')
    if (!hasText(profile?.phone_number)) missingFields.push('Phone Number')
    if (!hasText(businessEmail)) missingFields.push('Business Email')

    if (!company) {
        missingFields.push(
            'Company Legal Name',
            'Registration Number',
            'HQ Office Address',
            'Office City',
            'Office Zip / Postal',
            'Delivery Address',
            'Delivery City',
            'Delivery Zip / Postal',
            'Industry',
            'Team Size',
        )
        return missingFields
    }

    if (!hasText(company.company_name)) missingFields.push('Company Legal Name')
    if (!hasText(company.registration_number)) missingFields.push('Registration Number')
    if (!hasText(company.address)) missingFields.push('HQ Office Address')
    if (!hasText(company.office_city)) missingFields.push('Office City')
    if (!hasText(company.office_zip_postal)) missingFields.push('Office Zip / Postal')

    const resolvedDeliveryAddress = hasText(company.delivery_address) ? company.delivery_address : company.address
    const resolvedDeliveryCity = hasText(company.delivery_city) ? company.delivery_city : company.office_city
    const resolvedDeliveryZipPostal = hasText(company.delivery_zip_postal) ? company.delivery_zip_postal : company.office_zip_postal

    if (!hasText(resolvedDeliveryAddress)) missingFields.push('Delivery Address')
    if (!hasText(resolvedDeliveryCity)) missingFields.push('Delivery City')
    if (!hasText(resolvedDeliveryZipPostal)) missingFields.push('Delivery Zip / Postal')
    if (!hasText(company.industry)) missingFields.push('Industry')
    if (!hasText(company.team_size)) missingFields.push('Team Size')

    return missingFields
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
        const {
            user_id,
            bundle_id,
            start_date,
            end_date,
            monthly_total,
            items,
            delivery_company_name,
            delivery_address,
            delivery_city,
            delivery_zip_postal,
            delivery_contact_name,
            delivery_contact_phone,
        } = body

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

        const { data: authUserData, error: authUserError } = await supabaseServer.auth.admin.getUserById(userUuid)
        if (authUserError) {
            return errorResponse(`Failed to validate user account: ${authUserError.message}`, 500)
        }
        if (!authUserData.user) {
            return errorResponse('User account not found', 404)
        }

        const { data: existingProfile, error: profileLookupError } = await supabaseServer
            .from('profiles')
            .select('id, full_name, job_title, phone_number')
            .eq('id', userUuid)
            .maybeSingle()

        if (profileLookupError) {
            return errorResponse(`Failed to validate user profile: ${profileLookupError.message}`, 500)
        }

        const { data: company, error: companyLookupError } = await supabaseServer
            .from('companies')
            .select('company_name, registration_number, address, office_city, office_zip_postal, delivery_address, delivery_city, delivery_zip_postal, industry, team_size')
            .eq('profile_id', userUuid)
            .maybeSingle()

        if (companyLookupError) {
            return errorResponse(`Failed to validate company profile: ${companyLookupError.message}`, 500)
        }

        const missingProfileFields = getMissingProfileFields(existingProfile, company, authUserData.user.email ?? null)
        if (missingProfileFields.length > 0) {
            return errorResponse(
                `Complete your profile before placing an order. Missing: ${missingProfileFields.join(', ')}`,
                403,
            )
        }

        const resolvedDeliveryCompanyName = parseOptionalText(delivery_company_name) ?? company?.company_name ?? null
        const resolvedDeliveryAddress = parseOptionalText(delivery_address)
            ?? (hasText(company?.delivery_address) ? company?.delivery_address : company?.address)
            ?? null
        const resolvedDeliveryCity = parseOptionalText(delivery_city)
            ?? (hasText(company?.delivery_city) ? company?.delivery_city : company?.office_city)
            ?? null
        const resolvedDeliveryZipPostal = parseOptionalText(delivery_zip_postal)
            ?? (hasText(company?.delivery_zip_postal) ? company?.delivery_zip_postal : company?.office_zip_postal)
            ?? null
        const resolvedDeliveryContactName = parseOptionalText(delivery_contact_name) ?? existingProfile?.full_name ?? null
        const resolvedDeliveryContactPhone = parseOptionalText(delivery_contact_phone) ?? existingProfile?.phone_number ?? null

        const missingDeliveryFields: string[] = []
        if (!hasText(resolvedDeliveryCompanyName)) missingDeliveryFields.push('Company Name')
        if (!hasText(resolvedDeliveryAddress)) missingDeliveryFields.push('Delivery Address')
        if (!hasText(resolvedDeliveryCity)) missingDeliveryFields.push('Delivery City')
        if (!hasText(resolvedDeliveryZipPostal)) missingDeliveryFields.push('Delivery Zip / Postal')
        if (!hasText(resolvedDeliveryContactName)) missingDeliveryFields.push('Site Contact Name')
        if (!hasText(resolvedDeliveryContactPhone)) missingDeliveryFields.push('Site Contact Phone')
        if (missingDeliveryFields.length > 0) {
            return errorResponse(
                `Delivery details are incomplete. Missing: ${missingDeliveryFields.join(', ')}`,
                400,
            )
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
                delivery_company_name: resolvedDeliveryCompanyName,
                delivery_address: resolvedDeliveryAddress,
                delivery_city: resolvedDeliveryCity,
                delivery_zip_postal: resolvedDeliveryZipPostal,
                delivery_contact_name: resolvedDeliveryContactName,
                delivery_contact_phone: resolvedDeliveryContactPhone,
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
