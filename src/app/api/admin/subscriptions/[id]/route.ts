import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../../../lib/apiResponse'
import { normalizeOrderStatus } from '@/lib/adminOrders'
import { getBillingProviderByName } from '@/lib/billing/providers'
import { BillingProviderName } from '@/lib/billing/types'

type RouteParams = { params: Promise<{ id: string }> }

type CancellationReferenceRow = {
    id: string
    status: string | null
    billing_provider: BillingProviderName | string | null
    provider_subscription_id: string | null
    commitment_end_at: string | null
    end_date: string | null
}

type SubscriptionRecord = {
    id: string
    user_id: string
    bundle_id: string | null
    status: string | null
    monthly_total: number | string | null
    subtotal_amount: number | string | null
    tax_amount: number | string | null
    start_date: string | null
    end_date: string | null
    created_at: string
    delivery_company_name: string | null
    delivery_address: string | null
    delivery_city: string | null
    delivery_zip_postal: string | null
    delivery_contact_name: string | null
    delivery_contact_phone: string | null
    bundles: {
        id: string
        name: string | null
        description: string | null
        image_url: string | null
        monthly_price: number | string | null
    } | {
        id: string
        name: string | null
        description: string | null
        image_url: string | null
        monthly_price: number | string | null
    }[] | null
    profiles: {
        id: string
        full_name: string | null
        phone_number: string | null
        job_title: string | null
    } | {
        id: string
        full_name: string | null
        phone_number: string | null
        job_title: string | null
    }[] | null
}

type SubscriptionFulfillmentRecord = {
    service_state: string
    collection_status: string
    first_delivery_at: string | null
}

type CompanyRecord = {
    company_name: string | null
    industry: string | null
    team_size: string | null
    address: string | null
    office_city: string | null
    office_zip_postal: string | null
    delivery_address: string | null
    delivery_city: string | null
    delivery_zip_postal: string | null
}

type SubscriptionItemRecord = {
    subscription_id: string
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

type SubscriptionDetailResponse = {
    id: string
    userId: string
    bundleId: string | null
    billingStatus: string | null
    status: string | null
    total: number | null
    subtotalAmount: number | null
    taxAmount: number | null
    createdAt: string
    startDate: string | null
    endDate: string | null
    serviceState: string | null
    collectionStatus: string | null
    firstDeliveryAt: string | null
    itemsSummary: string
    items: Array<{
        productName: string
        category: string | null
        monthlyPrice: number | null
        durationMonths: number | null
        quantity: number
        imageUrl: string | null
    }>
    customer: {
        id: string | null
        name: string | null
        phoneNumber: string | null
        jobTitle: string | null
        companyName: string | null
        industry: string | null
        teamSize: string | null
        address: string | null
        officeAddress: string | null
        deliveryAddress: string | null
    }
    bundle: {
        id: string | null
        name: string | null
        description: string | null
        imageUrl: string | null
        monthlyPrice: number | null
    }
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

function hasText(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function composeAddress(line1: string | null | undefined, city: string | null | undefined, zipPostal: string | null | undefined) {
    const parts: string[] = []
    const normalizedLine1 = hasText(line1) ? line1.trim() : null
    const normalizedCity = hasText(city) ? city.trim() : null
    const normalizedZipPostal = hasText(zipPostal) ? zipPostal.trim() : null

    if (normalizedLine1) parts.push(normalizedLine1)

    const locality = [normalizedCity, normalizedZipPostal].filter(Boolean).join(' ')
    if (locality) parts.push(locality)

    return parts.length > 0 ? parts.join(', ') : null
}

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

async function resolveCustomerName(userId: string, profileName: string | null) {
    const normalizedProfileName = profileName?.trim()
    if (normalizedProfileName) return normalizedProfileName

    try {
        const { data, error } = await supabaseServer.auth.admin.getUserById(userId)
        if (!error && data.user) {
            const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>
            const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : ''
            if (fullName) return fullName

            const name = typeof metadata.name === 'string' ? metadata.name.trim() : ''
            if (name) return name

            if (data.user.email) return data.user.email
        }
    } catch {
        // Ignore auth lookup failures and use deterministic fallback below.
    }

    return `User ${userId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

function parseNullableDate(input: unknown): string | null | undefined {
    if (input === undefined) return undefined
    if (input === null || input === '') return null
    if (typeof input !== 'string') return undefined
    const parsed = new Date(input)
    if (Number.isNaN(parsed.getTime())) return undefined
    return parsed.toISOString()
}

function normalizeBillingProvider(value: string | null | undefined): BillingProviderName {
    return value === 'stripe' ? 'stripe' : 'mock'
}

async function markOffboardingRequested(subscriptionId: string) {
    const { data: existingFulfillment, error: existingFulfillmentError } = await supabaseServer
        .from('subscription_fulfillment')
        .select('service_state, collection_status, first_delivery_at')
        .eq('subscription_id', subscriptionId)
        .maybeSingle()

    if (existingFulfillmentError) {
        throw new Error(`Failed to load subscription fulfillment: ${existingFulfillmentError.message}`)
    }

    const fulfillment = (existingFulfillment as SubscriptionFulfillmentRecord | null) ?? null
    if (!fulfillment) {
        const { error: insertError } = await supabaseServer
            .from('subscription_fulfillment')
            .insert({
                subscription_id: subscriptionId,
                service_state: 'offboarding_requested',
                collection_status: 'not_collected',
                first_delivery_at: null,
            })

        if (insertError && insertError.code !== '23505') {
            throw new Error(`Failed to initialize subscription fulfillment: ${insertError.message}`)
        }
        if (!insertError) return
    }

    if (fulfillment?.service_state === 'closed' || fulfillment?.service_state === 'offboarding_requested') {
        return
    }

    const { error: updateError } = await supabaseServer
        .from('subscription_fulfillment')
        .update({
            service_state: 'offboarding_requested',
        })
        .eq('subscription_id', subscriptionId)

    if (updateError) {
        throw new Error(`Failed to update subscription fulfillment: ${updateError.message}`)
    }
}

async function fetchSubscriptionDetails(subscriptionId: string): Promise<SubscriptionDetailResponse | null> {
    const { data, error } = await supabaseServer
        .from('subscriptions')
        .select(`
            id,
            user_id,
            bundle_id,
            status,
            monthly_total,
            subtotal_amount,
            tax_amount,
            start_date,
            end_date,
            created_at,
            delivery_company_name,
            delivery_address,
            delivery_city,
            delivery_zip_postal,
            delivery_contact_name,
            delivery_contact_phone,
            bundles (
                id,
                name,
                description,
                image_url,
                monthly_price
            ),
            profiles (
                id,
                full_name,
                phone_number,
                job_title
            )
        `)
        .eq('id', subscriptionId)
        .single()

    if (error || !data) return null

    const record = data as unknown as SubscriptionRecord
    const profile = unwrapSingle(record.profiles)
    const bundle = unwrapSingle(record.bundles)

    const { data: fulfillmentData } = await supabaseServer
        .from('subscription_fulfillment')
        .select('service_state, collection_status, first_delivery_at')
        .eq('subscription_id', subscriptionId)
        .maybeSingle()

    const fulfillment = (fulfillmentData as SubscriptionFulfillmentRecord | null) ?? null

    const { data: companyData } = await supabaseServer
        .from('companies')
        .select('company_name, industry, team_size, address, office_city, office_zip_postal, delivery_address, delivery_city, delivery_zip_postal')
        .eq('profile_id', record.user_id)
        .maybeSingle()

    const company = (companyData as CompanyRecord | null) ?? null
    const officeAddress = composeAddress(company?.address, company?.office_city, company?.office_zip_postal)
    const fallbackDeliveryAddress = composeAddress(
        hasText(company?.delivery_address) ? company?.delivery_address : company?.address,
        hasText(company?.delivery_city) ? company?.delivery_city : company?.office_city,
        hasText(company?.delivery_zip_postal) ? company?.delivery_zip_postal : company?.office_zip_postal,
    )
    const orderDeliveryAddress = composeAddress(record.delivery_address, record.delivery_city, record.delivery_zip_postal)
    const deliveryAddress = orderDeliveryAddress ?? fallbackDeliveryAddress
    const customerName = await resolveCustomerName(record.user_id, profile?.full_name ?? null)
    const siteContactName = hasText(record.delivery_contact_name) ? record.delivery_contact_name.trim() : null
    const siteContactPhone = hasText(record.delivery_contact_phone) ? record.delivery_contact_phone.trim() : null
    const deliveryCompanyName = hasText(record.delivery_company_name) ? record.delivery_company_name.trim() : null

    let itemRows: SubscriptionItemRecord[] = []
    const { data: itemData, error: itemError } = await supabaseServer
        .from('subscription_items')
        .select(`
            subscription_id,
            product_name,
            category,
            monthly_price,
            duration_months,
            quantity,
            products (
                image_url
            )
        `)
        .eq('subscription_id', subscriptionId)
        .order('created_at', { ascending: true })

    if (!itemError) {
        itemRows = (itemData ?? []) as SubscriptionItemRecord[]
    }

    const items = itemRows.map((item) => {
        const product = unwrapSingle(item.products)
        return {
            productName: item.product_name?.trim() || item.category?.trim() || 'Item',
            category: item.category?.trim() || null,
            monthlyPrice: parseMoney(item.monthly_price),
            durationMonths: parsePositiveInteger(item.duration_months),
            quantity: parsePositiveInteger(item.quantity) ?? 1,
            imageUrl: product?.image_url ?? null,
        }
    })

    const groupedItems = new Map<string, number>()
    for (const item of items) {
        const label = item.category ?? item.productName
        groupedItems.set(label, (groupedItems.get(label) ?? 0) + item.quantity)
    }

    const fallbackItemsSummary = bundle?.name ?? 'No items captured'
    const itemsSummary = groupedItems.size > 0
        ? [...groupedItems.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([label, qty]) => `${label} x ${qty}`)
            .join(', ')
        : fallbackItemsSummary

    return {
        id: record.id,
        userId: record.user_id,
        bundleId: record.bundle_id,
        billingStatus: record.status,
        status: record.status,
        total: parseMoney(record.monthly_total),
        subtotalAmount: parseMoney(record.subtotal_amount),
        taxAmount: parseMoney(record.tax_amount),
        createdAt: record.created_at,
        startDate: record.start_date,
        endDate: record.end_date,
        serviceState: fulfillment?.service_state ?? null,
        collectionStatus: fulfillment?.collection_status ?? null,
        firstDeliveryAt: fulfillment?.first_delivery_at ?? null,
        itemsSummary,
        items,
        customer: {
            id: profile?.id ?? null,
            name: siteContactName ?? customerName,
            phoneNumber: siteContactPhone ?? profile?.phone_number ?? null,
            jobTitle: profile?.job_title ?? null,
            companyName: deliveryCompanyName ?? company?.company_name ?? null,
            industry: company?.industry ?? null,
            teamSize: company?.team_size ?? null,
            address: officeAddress,
            officeAddress,
            deliveryAddress,
        },
        bundle: {
            id: bundle?.id ?? null,
            name: bundle?.name ?? null,
            description: bundle?.description ?? null,
            imageUrl: bundle?.image_url ?? null,
            monthlyPrice: parseMoney(bundle?.monthly_price),
        },
    }
}

/** GET /api/admin/subscriptions/:id — Get one subscription for admin */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid subscription ID format', 400)

        const details = await fetchSubscriptionDetails(uuid)
        if (!details) return errorResponse('Subscription not found', 404)
        return successResponse(details)
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** PATCH /api/admin/subscriptions/:id — Update subscription billing details */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const uuid = parseUUID(id)
        if (!uuid) return errorResponse('Invalid subscription ID format', 400)

        const body = await request.json()
        const updatePayload: Record<string, unknown> = {}
        let requestedOffboarding = false

        const incomingStatus = body?.billing_status ?? body?.status
        if (incomingStatus !== undefined) {
            const status = normalizeOrderStatus(incomingStatus)
            if (!status) {
                return errorResponse('Invalid status. Must be: active, pending, pending_payment, payment_failed, incomplete, cancelled, or completed', 400)
            }

            if (status === 'cancelled') {
                const { data: cancellationReference, error: cancellationReferenceError } = await supabaseServer
                    .from('subscriptions')
                    .select('id, status, billing_provider, provider_subscription_id, commitment_end_at, end_date')
                    .eq('id', uuid)
                    .maybeSingle()

                if (cancellationReferenceError) {
                    return errorResponse(`Failed to validate cancellation state: ${cancellationReferenceError.message}`, 500)
                }

                if (!cancellationReference) {
                    return errorResponse('Subscription not found', 404)
                }

                const reference = cancellationReference as CancellationReferenceRow
                try {
                    await markOffboardingRequested(uuid)
                    requestedOffboarding = true
                } catch (fulfillmentError) {
                    const message = fulfillmentError instanceof Error
                        ? fulfillmentError.message
                        : 'Failed to update service state for cancellation request'
                    return errorResponse(message, 500)
                }

                if (reference.status !== 'cancelled') {
                    let deferBillingCancellation = false

                    if (reference.commitment_end_at) {
                        const commitmentEnd = new Date(reference.commitment_end_at)
                        if (!Number.isNaN(commitmentEnd.getTime()) && commitmentEnd.getTime() > Date.now()) {
                            deferBillingCancellation = true
                            if (body?.end_date === undefined) {
                                updatePayload.end_date = commitmentEnd.toISOString()
                            }
                        }
                    }

                    if (!deferBillingCancellation) {
                        const billingProvider = normalizeBillingProvider(reference.billing_provider)
                        const providerSubscriptionId = reference.provider_subscription_id?.trim() || null
                        if (billingProvider === 'stripe' && !providerSubscriptionId) {
                            return errorResponse('Cannot cancel on Stripe because provider_subscription_id is missing', 409)
                        }

                        if (providerSubscriptionId) {
                            try {
                                const provider = getBillingProviderByName(billingProvider)
                                const cancellation = await provider.cancelSubscription({
                                    providerSubscriptionId,
                                    reason: 'Cancelled by admin in Deskly',
                                })

                                if (body?.end_date === undefined && cancellation.cancelledAt) {
                                    updatePayload.end_date = cancellation.cancelledAt
                                }
                            } catch (cancellationError) {
                                const message = cancellationError instanceof Error
                                    ? cancellationError.message
                                    : 'Failed to cancel provider subscription'
                                return errorResponse(message, 502)
                            }
                        }

                        updatePayload.status = status
                    }
                }
            } else {
                updatePayload.status = status
            }
        }

        if (body?.start_date !== undefined) {
            const startDate = parseNullableDate(body.start_date)
            if (startDate === undefined) return errorResponse('start_date must be a valid date or null', 400)
            updatePayload.start_date = startDate
        }

        if (body?.end_date !== undefined) {
            const endDate = parseNullableDate(body.end_date)
            if (endDate === undefined) return errorResponse('end_date must be a valid date or null', 400)
            updatePayload.end_date = endDate
        }

        if (body?.monthly_total !== undefined) {
            if (body.monthly_total === null || body.monthly_total === '') {
                updatePayload.monthly_total = null
            } else {
                const monthlyTotal = Number(body.monthly_total)
                if (!Number.isFinite(monthlyTotal) || monthlyTotal < 0) {
                    return errorResponse('monthly_total must be a number greater than or equal to 0', 400)
                }
                updatePayload.monthly_total = monthlyTotal
            }
        }

        if (Object.keys(updatePayload).length === 0) {
            if (!requestedOffboarding) {
                return errorResponse('No valid fields to update', 400)
            }

            const details = await fetchSubscriptionDetails(uuid)
            if (!details) return errorResponse('Subscription not found', 404)
            return successResponse(details)
        }

        const { data, error } = await supabaseServer
            .from('subscriptions')
            .update(updatePayload)
            .eq('id', uuid)
            .select('id')
            .single()

        if (error || !data) return errorResponse('Subscription not found or update failed', 404)

        const details = await fetchSubscriptionDetails(uuid)
        if (!details) return errorResponse('Subscription updated but failed to load details', 500)
        return successResponse(details)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}
