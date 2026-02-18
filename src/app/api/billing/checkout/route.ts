import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import {
    BILLING_CHECKOUT_CANCEL_URL,
    BILLING_CHECKOUT_SUCCESS_URL,
    BILLING_DEFAULT_CURRENCY,
    BILLING_MINIMUM_TERM_MONTHS,
    BILLING_STRIPE_AUTOMATIC_TAX,
    BILLING_STRIPE_TAX_RATE_ID,
} from '@/lib/billing/config'
import { calculateCommitmentEndDate, parseOptionalIsoDate } from '@/lib/billing/commitment'
import { toMoney } from '@/lib/billing/money'
import { getBillingProvider, getBillingProviderByName } from '@/lib/billing/providers'
import { calculateSstQuote } from '@/lib/billing/tax'
import { BillingCheckoutRequest, BillingProviderName, BillingTaxQuote, NormalizedBillingCheckoutItem } from '@/lib/billing/types'
import { hasText, parseCheckoutItems, parseOptionalMoney, parseOptionalPositiveInteger, parseUUID } from '@/lib/billing/validation'
import { errorResponse, successResponse } from '../../../../../lib/apiResponse'
import { supabaseServer } from '../../../../../lib/supabaseServer'

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

type BillingCustomerRecord = {
    id: string
    provider_customer_id: string
}

type BillingCatalogPriceRecord = {
    product_id: string
    provider_price_id: string
    unit_amount: number | string
}

type DeliverySnapshotRecord = {
    companyName: string | null
    address: string | null
    city: string | null
    zipPostal: string | null
    contactName: string | null
    contactPhone: string | null
}

type IdempotentSubscriptionRecord = {
    id: string
    status: string | null
    billing_provider: string | null
    provider_checkout_session_id: string | null
    checkout_request_fingerprint: string | null
    [key: string]: unknown
}

const AUTO_IDEMPOTENCY_WINDOW_MS = 15 * 60 * 1000
const MAX_IDEMPOTENCY_KEY_LENGTH = 120

function normalizeCurrency(value: unknown) {
    if (typeof value !== 'string') return BILLING_DEFAULT_CURRENCY
    const normalized = value.trim().toLowerCase()
    return normalized || BILLING_DEFAULT_CURRENCY
}

function toDateOrNull(isoDate: string | null) {
    if (!isoDate) return null
    const parsed = new Date(isoDate)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

function calculateMonthlySubtotal(items: NormalizedBillingCheckoutItem[]) {
    const subtotal = items.reduce((sum, item) => sum + item.monthly_price * item.quantity, 0)
    return toMoney(subtotal)
}

function getFallbackItemFromBody(body: BillingCheckoutRequest, parsedMonthlyTotal: number | null) {
    if (parsedMonthlyTotal == null || parsedMonthlyTotal <= 0) {
        return null
    }

    const productName = hasText(typeof body.product_name === 'string' ? body.product_name : null)
        ? String(body.product_name).trim()
        : 'Furniture Rental'

    return {
        product_id: null,
        product_name: productName,
        category: 'General',
        monthly_price: toMoney(parsedMonthlyTotal),
        duration_months: null,
        quantity: 1,
    } satisfies NormalizedBillingCheckoutItem
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

function parseOptionalText(value: unknown) {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
}

function parseIdempotencyKey(value: unknown) {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    if (!normalized) return null
    return normalized
}

function deriveCheckoutFingerprint(input: {
    userId: string
    bundleId: string | null
    startDateIso: string
    commitmentEndDateIso: string
    currency: string
    minimumTermMonths: number
    delivery: DeliverySnapshotRecord
    items: NormalizedBillingCheckoutItem[]
}) {
    const normalizedItems = [...input.items]
        .map((item) => ({
            product_id: item.product_id,
            product_name: item.product_name.trim(),
            category: item.category?.trim() ?? null,
            monthly_price: Number(item.monthly_price.toFixed(2)),
            duration_months: item.duration_months,
            quantity: item.quantity,
        }))
        .sort((a, b) => {
            const aKey = `${a.product_id ?? ''}:${a.product_name}:${a.monthly_price}:${a.duration_months ?? ''}:${a.quantity}`
            const bKey = `${b.product_id ?? ''}:${b.product_name}:${b.monthly_price}:${b.duration_months ?? ''}:${b.quantity}`
            return aKey.localeCompare(bKey)
        })

    const payload = {
        user_id: input.userId,
        bundle_id: input.bundleId,
        start_date: input.startDateIso,
        end_date: input.commitmentEndDateIso,
        currency: input.currency,
        minimum_term_months: input.minimumTermMonths,
        delivery_company_name: input.delivery.companyName?.trim() ?? null,
        delivery_address: input.delivery.address?.trim() ?? null,
        delivery_city: input.delivery.city?.trim() ?? null,
        delivery_zip_postal: input.delivery.zipPostal?.trim() ?? null,
        delivery_contact_name: input.delivery.contactName?.trim() ?? null,
        delivery_contact_phone: input.delivery.contactPhone?.trim() ?? null,
        items: normalizedItems,
    }

    return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function deriveAutoIdempotencyKey(fingerprint: string) {
    const windowBucket = Math.floor(Date.now() / AUTO_IDEMPOTENCY_WINDOW_MS)
    return `auto:${windowBucket}:${fingerprint.slice(0, 48)}`
}

function isUniqueViolation(error: { code?: string } | null | undefined) {
    return error?.code === '23505'
}

function normalizeBillingProvider(value: string | null | undefined): BillingProviderName {
    return value === 'stripe' ? 'stripe' : 'mock'
}

async function resolveIdempotentReplayResponse(
    existing: IdempotentSubscriptionRecord,
    requestedFingerprint: string,
    taxQuote: BillingTaxQuote,
) {
    const fingerprint = existing.checkout_request_fingerprint?.trim() || null
    if (fingerprint && fingerprint !== requestedFingerprint) {
        return errorResponse('This idempotency key was already used with different checkout details.', 409)
    }

    const sessionId = existing.provider_checkout_session_id?.trim() || null
    const status = existing.status ?? null
    const provider = normalizeBillingProvider(existing.billing_provider)

    if (!sessionId && (status === 'pending_payment' || status === 'pending' || status === 'incomplete')) {
        return errorResponse('Checkout is still being created. Please retry in a few seconds.', 409)
    }

    if (!sessionId && status === 'payment_failed') {
        return errorResponse('Previous checkout attempt failed. Retry by starting a new checkout.', 409)
    }

    let checkoutUrl: string | null = null
    if (sessionId) {
        try {
            const billingProvider = getBillingProviderByName(provider)
            checkoutUrl = await billingProvider.getCheckoutSessionUrl(sessionId)
        } catch {
            checkoutUrl = null
        }
    }

    return successResponse({
        subscription: existing,
        checkout_url: checkoutUrl,
        checkout_session_id: sessionId,
        billing_provider: provider,
        tax_quote: taxQuote,
        idempotent_replay: true,
    })
}

function resolveDeliverySnapshot(
    body: BillingCheckoutRequest,
    profile: ProfileEligibilityRecord | null,
    company: CompanyEligibilityRecord | null,
): DeliverySnapshotRecord {
    return {
        companyName: parseOptionalText(body.delivery_company_name) ?? company?.company_name ?? null,
        address: parseOptionalText(body.delivery_address)
            ?? (hasText(company?.delivery_address) ? company?.delivery_address : company?.address)
            ?? null,
        city: parseOptionalText(body.delivery_city)
            ?? (hasText(company?.delivery_city) ? company?.delivery_city : company?.office_city)
            ?? null,
        zipPostal: parseOptionalText(body.delivery_zip_postal)
            ?? (hasText(company?.delivery_zip_postal) ? company?.delivery_zip_postal : company?.office_zip_postal)
            ?? null,
        contactName: parseOptionalText(body.delivery_contact_name) ?? profile?.full_name ?? null,
        contactPhone: parseOptionalText(body.delivery_contact_phone) ?? profile?.phone_number ?? null,
    }
}

function getMissingDeliverySnapshotFields(delivery: DeliverySnapshotRecord) {
    const missingFields: string[] = []
    if (!hasText(delivery.companyName)) missingFields.push('Company Name')
    if (!hasText(delivery.address)) missingFields.push('Delivery Address')
    if (!hasText(delivery.city)) missingFields.push('Delivery City')
    if (!hasText(delivery.zipPostal)) missingFields.push('Delivery Zip / Postal')
    if (!hasText(delivery.contactName)) missingFields.push('Site Contact Name')
    if (!hasText(delivery.contactPhone)) missingFields.push('Site Contact Phone')
    return missingFields
}

/** POST /api/billing/checkout — Creates an internal subscription record and provider checkout session */
export async function POST(request: NextRequest) {
    try {
        const rawBody = await request.json()
        const body = (rawBody ?? {}) as BillingCheckoutRequest
        const userUuid = parseUUID(body.user_id)

        if (!userUuid) return errorResponse('Invalid or missing user_id', 400)

        const bundleUuid = body.bundle_id == null || body.bundle_id === ''
            ? null
            : parseUUID(body.bundle_id)

        if (body.bundle_id != null && body.bundle_id !== '' && !bundleUuid) {
            return errorResponse('Invalid bundle_id format', 400)
        }

        const startDate = parseOptionalIsoDate(body.start_date, 'start_date')
        if (startDate.error) return errorResponse(startDate.error, 400)
        const endDate = parseOptionalIsoDate(body.end_date, 'end_date')
        if (endDate.error) return errorResponse(endDate.error, 400)

        const parsedMonthlyTotal = parseOptionalMoney(body.monthly_total, 'monthly_total')
        if (parsedMonthlyTotal.error) return errorResponse(parsedMonthlyTotal.error, 400)

        const parsedItems = parseCheckoutItems(body.items)
        if (parsedItems.error) return errorResponse(parsedItems.error, 400)

        const normalizedItems = parsedItems.items.length > 0
            ? parsedItems.items
            : (() => {
                const fallbackItem = getFallbackItemFromBody(body, parsedMonthlyTotal.value)
                return fallbackItem ? [fallbackItem] : []
            })()

        if (normalizedItems.length === 0) {
            return errorResponse('Provide at least one line item or monthly_total', 400)
        }

        const itemDurations = normalizedItems
            .map((item) => item.duration_months)
            .filter((duration): duration is number => typeof duration === 'number' && Number.isInteger(duration) && duration > 0)

        if (itemDurations.some((duration) => duration < BILLING_MINIMUM_TERM_MONTHS)) {
            return errorResponse(`All item durations must be at least ${BILLING_MINIMUM_TERM_MONTHS} months`, 400)
        }

        const requestedMinimumTerm = parseOptionalPositiveInteger(body.minimum_term_months, 'minimum_term_months')
        if (requestedMinimumTerm.error) return errorResponse(requestedMinimumTerm.error, 400)

        const minimumTermMonths = Math.max(
            BILLING_MINIMUM_TERM_MONTHS,
            requestedMinimumTerm.value ?? 0,
            itemDurations.length > 0 ? Math.max(...itemDurations) : 0,
        )

        const startDateIso = startDate.value ?? new Date().toISOString()
        const commitmentEndDateIso = calculateCommitmentEndDate(startDateIso, minimumTermMonths, endDate.value)
        const requiredMinimumEndDateIso = calculateCommitmentEndDate(startDateIso, minimumTermMonths)
        const commitmentEndDate = toDateOrNull(commitmentEndDateIso)
        const requiredMinimumEndDate = toDateOrNull(requiredMinimumEndDateIso)
        if (!commitmentEndDate || !requiredMinimumEndDate || commitmentEndDate.getTime() < requiredMinimumEndDate.getTime()) {
            return errorResponse(`end_date must be at least ${minimumTermMonths} months after start_date`, 400)
        }

        const currency = normalizeCurrency(body.currency)
        const subtotal = calculateMonthlySubtotal(normalizedItems)
        const taxQuote = calculateSstQuote(subtotal, currency)
        const monthlyTotal = taxQuote.total

        const billingProvider = getBillingProvider()

        const { data: authUserData, error: authUserError } = await supabaseServer.auth.admin.getUserById(userUuid)
        if (authUserError) {
            return errorResponse(`Failed to validate user account: ${authUserError.message}`, 500)
        }
        if (!authUserData.user) return errorResponse('User account not found', 404)

        const { data: profile, error: profileLookupError } = await supabaseServer
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

        const profileRecord = (profile as ProfileEligibilityRecord | null) ?? null
        const companyRecord = (company as CompanyEligibilityRecord | null) ?? null

        const missingProfileFields = getMissingProfileFields(profileRecord, companyRecord, authUserData.user.email ?? null)
        if (missingProfileFields.length > 0) {
            return errorResponse(
                `Complete your profile before placing an order. Missing: ${missingProfileFields.join(', ')}`,
                403,
            )
        }

        const deliverySnapshot = resolveDeliverySnapshot(body, profileRecord, companyRecord)
        const missingDeliverySnapshotFields = getMissingDeliverySnapshotFields(deliverySnapshot)
        if (missingDeliverySnapshotFields.length > 0) {
            return errorResponse(
                `Delivery details are incomplete. Missing: ${missingDeliverySnapshotFields.join(', ')}`,
                400,
            )
        }

        const requestedIdempotencyKey = parseIdempotencyKey(body.idempotency_key)
            ?? parseIdempotencyKey(request.headers.get('x-idempotency-key'))

        if (requestedIdempotencyKey && requestedIdempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
            return errorResponse(`idempotency_key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`, 400)
        }

        const checkoutRequestFingerprint = deriveCheckoutFingerprint({
            userId: userUuid,
            bundleId: bundleUuid,
            startDateIso,
            commitmentEndDateIso,
            currency,
            minimumTermMonths,
            delivery: deliverySnapshot,
            items: normalizedItems,
        })
        const checkoutIdempotencyKey = requestedIdempotencyKey ?? deriveAutoIdempotencyKey(checkoutRequestFingerprint)

        const { data: existingIdempotentSubscription, error: existingIdempotentSubscriptionError } = await supabaseServer
            .from('subscriptions')
            .select('*')
            .eq('checkout_idempotency_key', checkoutIdempotencyKey)
            .maybeSingle()

        if (existingIdempotentSubscriptionError) {
            return errorResponse(`Failed to resolve checkout idempotency state: ${existingIdempotentSubscriptionError.message}`, 500)
        }

        if (existingIdempotentSubscription) {
            return resolveIdempotentReplayResponse(
                existingIdempotentSubscription as IdempotentSubscriptionRecord,
                checkoutRequestFingerprint,
                taxQuote,
            )
        }

        const { data: existingBillingCustomer, error: existingBillingCustomerError } = await supabaseServer
            .from('billing_customers')
            .select('id, provider_customer_id')
            .eq('user_id', userUuid)
            .eq('provider', billingProvider.name)
            .maybeSingle()

        if (existingBillingCustomerError) {
            return errorResponse(`Failed to load billing customer: ${existingBillingCustomerError.message}`, 500)
        }

        let billingCustomer = existingBillingCustomer as BillingCustomerRecord | null
        if (!billingCustomer) {
            const ensuredCustomer = await billingProvider.ensureCustomer({
                externalUserId: userUuid,
                email: authUserData.user.email ?? null,
                name: deliverySnapshot.contactName ?? profileRecord?.full_name ?? null,
                phone: deliverySnapshot.contactPhone ?? profileRecord?.phone_number ?? null,
                address: {
                    line1: deliverySnapshot.address,
                    city: deliverySnapshot.city,
                    postal_code: deliverySnapshot.zipPostal,
                    country: 'MY',
                },
                metadata: {
                    source: 'deskly-mobile',
                },
            })

            const { data: insertedBillingCustomer, error: insertBillingCustomerError } = await supabaseServer
                .from('billing_customers')
                .insert({
                    user_id: userUuid,
                    provider: billingProvider.name,
                    provider_customer_id: ensuredCustomer.providerCustomerId,
                    email: authUserData.user.email ?? null,
                    metadata: {
                        source: 'deskly-mobile',
                    },
                })
                .select('id, provider_customer_id')
                .single()

            if (insertBillingCustomerError || !insertedBillingCustomer) {
                return errorResponse(`Failed to create billing customer: ${insertBillingCustomerError?.message ?? 'Unknown error'}`, 500)
            }

            billingCustomer = insertedBillingCustomer as BillingCustomerRecord
        }

        const productIds = normalizedItems
            .map((item) => item.product_id)
            .filter((id): id is string => Boolean(id))

        const providerCatalogPriceMap = new Map<string, string>()
        if (productIds.length > 0) {
            const { data: catalogPriceRows, error: catalogPriceError } = await supabaseServer
                .from('billing_catalog_prices')
                .select('product_id, provider_price_id, unit_amount')
                .eq('provider', billingProvider.name)
                .eq('currency', currency)
                .eq('is_active', true)
                .in('product_id', productIds)

            if (catalogPriceError) {
                return errorResponse(`Failed to load billing catalog prices: ${catalogPriceError.message}`, 500)
            }

            for (const row of (catalogPriceRows ?? []) as BillingCatalogPriceRecord[]) {
                providerCatalogPriceMap.set(
                    `${row.product_id}:${Number(row.unit_amount).toFixed(2)}`,
                    row.provider_price_id,
                )
            }
        }

        const { data: createdSubscription, error: createSubscriptionError } = await supabaseServer
            .from('subscriptions')
            .insert({
                user_id: userUuid,
                bundle_id: bundleUuid,
                status: 'pending_payment',
                start_date: startDateIso,
                end_date: commitmentEndDateIso,
                monthly_total: monthlyTotal,
                subtotal_amount: taxQuote.subtotal,
                tax_amount: taxQuote.sst_amount,
                minimum_term_months: minimumTermMonths,
                commitment_start_at: startDateIso,
                commitment_end_at: commitmentEndDateIso,
                billing_provider: billingProvider.name,
                billing_customer_id: billingCustomer.id,
                billing_currency: currency,
                checkout_idempotency_key: checkoutIdempotencyKey,
                checkout_request_fingerprint: checkoutRequestFingerprint,
                delivery_company_name: deliverySnapshot.companyName,
                delivery_address: deliverySnapshot.address,
                delivery_city: deliverySnapshot.city,
                delivery_zip_postal: deliverySnapshot.zipPostal,
                delivery_contact_name: deliverySnapshot.contactName,
                delivery_contact_phone: deliverySnapshot.contactPhone,
            })
            .select()
            .single()

        if (createSubscriptionError || !createdSubscription) {
            if (isUniqueViolation(createSubscriptionError)) {
                const { data: replaySubscription, error: replaySubscriptionError } = await supabaseServer
                    .from('subscriptions')
                    .select('*')
                    .eq('checkout_idempotency_key', checkoutIdempotencyKey)
                    .maybeSingle()

                if (replaySubscriptionError) {
                    return errorResponse(`Failed to resolve existing idempotent checkout: ${replaySubscriptionError.message}`, 500)
                }

                if (replaySubscription) {
                    return resolveIdempotentReplayResponse(
                        replaySubscription as IdempotentSubscriptionRecord,
                        checkoutRequestFingerprint,
                        taxQuote,
                    )
                }
            }

            return errorResponse(`Failed to create subscription: ${createSubscriptionError?.message ?? 'Unknown error'}`, 500)
        }

        const { error: createDeliveryOrderError } = await supabaseServer
            .from('delivery_orders')
            .insert({
                subscription_id: createdSubscription.id,
                do_status: 'confirmed',
            })

        if (createDeliveryOrderError && createDeliveryOrderError.code !== '23505') {
            await supabaseServer
                .from('subscriptions')
                .update({ status: 'payment_failed' })
                .eq('id', createdSubscription.id)
            return errorResponse(`Failed to initialize delivery order: ${createDeliveryOrderError.message}`, 500)
        }

        const { error: insertItemsError } = await supabaseServer
            .from('subscription_items')
            .insert(
                normalizedItems.map((item) => ({
                    subscription_id: createdSubscription.id,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    category: item.category,
                    monthly_price: item.monthly_price,
                    duration_months: item.duration_months,
                    quantity: item.quantity,
                })),
            )

        if (insertItemsError) {
            await supabaseServer
                .from('subscriptions')
                .update({ status: 'payment_failed' })
                .eq('id', createdSubscription.id)
            return errorResponse(`Failed to save subscription items: ${insertItemsError.message}`, 500)
        }

        const successUrl = hasText(typeof body.success_url === 'string' ? body.success_url : null)
            ? String(body.success_url).trim()
            : BILLING_CHECKOUT_SUCCESS_URL
        const cancelUrl = hasText(typeof body.cancel_url === 'string' ? body.cancel_url : null)
            ? String(body.cancel_url).trim()
            : BILLING_CHECKOUT_CANCEL_URL

        if (billingProvider.name === 'stripe' && (!successUrl || !cancelUrl)) {
            await supabaseServer
                .from('subscriptions')
                .update({ status: 'payment_failed' })
                .eq('id', createdSubscription.id)
            return errorResponse('Stripe checkout URLs are not configured. Set BILLING_CHECKOUT_SUCCESS_URL and BILLING_CHECKOUT_CANCEL_URL.', 500)
        }

        if (billingProvider.name === 'stripe' && !BILLING_STRIPE_AUTOMATIC_TAX && !BILLING_STRIPE_TAX_RATE_ID) {
            await supabaseServer
                .from('subscriptions')
                .update({ status: 'payment_failed' })
                .eq('id', createdSubscription.id)
            return errorResponse('Stripe tax is not configured. Set BILLING_STRIPE_TAX_RATE_ID (or enable BILLING_STRIPE_AUTOMATIC_TAX).', 500)
        }

        let checkoutSession: {
            checkoutUrl: string | null
            sessionId: string | null
            providerSubscriptionId: string | null
        }

        try {
            checkoutSession = await billingProvider.createCheckoutSession({
                customerId: billingCustomer.provider_customer_id,
                currency,
                automaticTax: BILLING_STRIPE_AUTOMATIC_TAX,
                manualTaxRateId: BILLING_STRIPE_AUTOMATIC_TAX ? null : BILLING_STRIPE_TAX_RATE_ID,
                minimumTermMonths,
                successUrl: successUrl ?? 'https://example.com/billing/success',
                cancelUrl: cancelUrl ?? 'https://example.com/billing/cancel',
                metadata: {
                    internal_subscription_id: createdSubscription.id,
                    internal_user_id: userUuid,
                },
                lineItems: normalizedItems.map((item) => {
                    const providerPriceId = item.product_id
                        ? providerCatalogPriceMap.get(`${item.product_id}:${item.monthly_price.toFixed(2)}`) ?? null
                        : null

                    return {
                        name: item.product_name,
                        quantity: item.quantity,
                        unitAmount: item.monthly_price,
                        currency,
                        productId: item.product_id,
                        providerPriceId,
                        metadata: item.product_id
                            ? {
                                internal_product_id: item.product_id,
                            }
                            : undefined,
                    }
                }),
            })
        } catch (providerError) {
            await supabaseServer
                .from('subscriptions')
                .update({ status: 'payment_failed' })
                .eq('id', createdSubscription.id)

            throw providerError
        }

        const { data: updatedSubscription, error: updateSubscriptionError } = await supabaseServer
            .from('subscriptions')
            .update({
                provider_checkout_session_id: checkoutSession.sessionId,
                provider_subscription_id: checkoutSession.providerSubscriptionId,
            })
            .eq('id', createdSubscription.id)
            .select()
            .single()

        if (updateSubscriptionError || !updatedSubscription) {
            return errorResponse(`Failed to update subscription checkout metadata: ${updateSubscriptionError?.message ?? 'Unknown error'}`, 500)
        }

        return successResponse({
            subscription: updatedSubscription,
            checkout_url: checkoutSession.checkoutUrl,
            checkout_session_id: checkoutSession.sessionId,
            billing_provider: billingProvider.name,
            tax_quote: taxQuote,
        }, 201)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error'
        return errorResponse(message, 500)
    }
}
