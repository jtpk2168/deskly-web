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

type BillingInvoiceRecord = {
    id: string
    provider_invoice_id: string
    invoice_number: string | null
    status: string
    currency: string
    subtotal_amount: number | string | null
    tax_amount: number | string | null
    total_amount: number | string | null
    amount_paid: number | string | null
    amount_due: number | string | null
    hosted_invoice_url: string | null
    invoice_pdf: string | null
    due_date: string | null
    paid_at: string | null
    period_start_at: string | null
    period_end_at: string | null
    created_at: string
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

function parseNullableDate(input: unknown): string | null | undefined {
    if (input === undefined) return undefined
    if (input === null || input === '') return null
    if (typeof input !== 'string') return undefined
    const parsed = new Date(input)
    if (Number.isNaN(parsed.getTime())) return undefined
    return parsed.toISOString()
}

async function markOffboardingRequested(subscriptionId: string) {
    const { data: existingFulfillment, error: existingFulfillmentError } = await supabaseServer
        .from('subscription_fulfillment')
        .select('service_state')
        .eq('subscription_id', subscriptionId)
        .maybeSingle()

    if (existingFulfillmentError) {
        throw new Error(`Failed to load subscription fulfillment: ${existingFulfillmentError.message}`)
    }

    const currentServiceState = (existingFulfillment as { service_state: string } | null)?.service_state ?? null
    if (!currentServiceState) {
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

    if (currentServiceState === 'closed' || currentServiceState === 'offboarding_requested') {
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

        let invoiceRows: BillingInvoiceRecord[] = []
        const { data: invoiceData, error: invoiceError } = await supabaseServer
            .from('billing_invoices')
            .select(`
                id,
                provider_invoice_id,
                invoice_number,
                status,
                currency,
                subtotal_amount,
                tax_amount,
                total_amount,
                amount_paid,
                amount_due,
                hosted_invoice_url,
                invoice_pdf,
                due_date,
                paid_at,
                period_start_at,
                period_end_at,
                created_at
            `)
            .eq('subscription_id', uuid)
            .order('created_at', { ascending: false })

        // Fail open: order detail remains available even if invoice mirror rows are unavailable.
        if (!invoiceError) {
            invoiceRows = (invoiceData ?? []) as BillingInvoiceRecord[]
        }

        const billingInvoices = invoiceRows.map((invoice) => ({
            id: invoice.id,
            provider_invoice_id: invoice.provider_invoice_id,
            invoice_number: invoice.invoice_number,
            status: invoice.status,
            currency: invoice.currency,
            subtotal_amount: parseMoney(invoice.subtotal_amount),
            tax_amount: parseMoney(invoice.tax_amount),
            total_amount: parseMoney(invoice.total_amount),
            amount_paid: parseMoney(invoice.amount_paid),
            amount_due: parseMoney(invoice.amount_due),
            hosted_invoice_url: invoice.hosted_invoice_url,
            invoice_pdf: invoice.invoice_pdf,
            due_date: invoice.due_date,
            paid_at: invoice.paid_at,
            period_start_at: invoice.period_start_at,
            period_end_at: invoice.period_end_at,
            created_at: invoice.created_at,
        }))

        return successResponse({
            ...data,
            billing_status: data.status,
            subscription_items: subscriptionItems,
            billing_invoices: billingInvoices,
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
        const statusInput = body?.billing_status ?? body?.status
        const { end_date } = body

        if (statusInput && !['active', 'pending', 'pending_payment', 'payment_failed', 'incomplete', 'cancelled', 'completed'].includes(statusInput)) {
            return errorResponse('Invalid status. Must be: active, pending, pending_payment, payment_failed, incomplete, cancelled, or completed', 400)
        }

        const updatePayload: Record<string, unknown> = {}
        let requestedOffboarding = false
        if (statusInput === 'cancelled') {
            const { data: existingSubscription, error: existingSubscriptionError } = await supabaseServer
                .from('subscriptions')
                .select('id, commitment_end_at')
                .eq('id', uuid)
                .maybeSingle()

            if (existingSubscriptionError) {
                return errorResponse(existingSubscriptionError.message, 500)
            }

            if (!existingSubscription) {
                return errorResponse('Subscription not found', 404)
            }

            try {
                await markOffboardingRequested(uuid)
                requestedOffboarding = true
            } catch (fulfillmentError) {
                const message = fulfillmentError instanceof Error
                    ? fulfillmentError.message
                    : 'Failed to update service state for cancellation request'
                return errorResponse(message, 500)
            }

            let deferBillingCancellation = false
            if (existingSubscription.commitment_end_at) {
                const commitmentEnd = new Date(existingSubscription.commitment_end_at)
                if (!Number.isNaN(commitmentEnd.getTime()) && commitmentEnd.getTime() > Date.now()) {
                    deferBillingCancellation = true
                    if (body?.end_date === undefined) {
                        updatePayload.end_date = commitmentEnd.toISOString()
                    }
                }
            }

            if (!deferBillingCancellation) {
                updatePayload.status = statusInput
            }
        } else if (statusInput) {
            updatePayload.status = statusInput
        }

        if (end_date !== undefined) {
            const normalizedEndDate = parseNullableDate(end_date)
            if (normalizedEndDate === undefined) {
                return errorResponse('end_date must be a valid date or null', 400)
            }
            updatePayload.end_date = normalizedEndDate
        }

        if (Object.keys(updatePayload).length === 0) {
            if (!requestedOffboarding) {
                return errorResponse('No valid fields to update', 400)
            }

            const { data: currentSubscription, error: currentSubscriptionError } = await supabaseServer
                .from('subscriptions')
                .select()
                .eq('id', uuid)
                .single()

            if (currentSubscriptionError || !currentSubscription) {
                return errorResponse('Subscription not found', 404)
            }

            return successResponse({
                ...currentSubscription,
                billing_status: currentSubscription.status,
            })
        }

        const { data, error } = await supabaseServer
            .from('subscriptions')
            .update(updatePayload)
            .eq('id', uuid)
            .select()
            .single()

        if (error || !data) return errorResponse('Subscription not found or update failed', 404)
        return successResponse({
            ...data,
            billing_status: data.status,
        })
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}
