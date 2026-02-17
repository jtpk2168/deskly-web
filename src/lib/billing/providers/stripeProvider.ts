import { toMinorUnit, toMoney } from '../money'
import { BillingProvider } from './provider'

const STRIPE_API_BASE = 'https://api.stripe.com/v1'

type StripeJson = Record<string, unknown>

function requireSecretKey() {
    const key = process.env.STRIPE_SECRET_KEY?.trim()
    if (!key) {
        throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    return key
}

function readString(value: unknown, fieldName: string) {
    if (typeof value === 'string' && value.trim()) return value
    throw new Error(`Stripe response missing ${fieldName}`)
}

function appendMetadata(params: URLSearchParams, prefix: string, metadata?: Record<string, string>) {
    if (!metadata) return
    for (const [key, value] of Object.entries(metadata)) {
        if (!key || !value) continue
        params.set(`${prefix}[${key}]`, value)
    }
}

async function stripePost(path: string, params: URLSearchParams) {
    const secretKey = requireSecretKey()
    const response = await fetch(`${STRIPE_API_BASE}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        cache: 'no-store',
    })

    const rawBody = await response.text()
    let parsed: StripeJson | null = null
    try {
        parsed = rawBody ? (JSON.parse(rawBody) as StripeJson) : null
    } catch {
        parsed = null
    }

    if (!response.ok) {
        const message =
            typeof parsed?.error === 'object' &&
                parsed.error != null &&
                typeof (parsed.error as { message?: unknown }).message === 'string'
                ? String((parsed.error as { message?: string }).message)
                : `Stripe API request failed (${response.status})`
        throw new Error(message)
    }

    return parsed ?? {}
}

export class StripeBillingProvider implements BillingProvider {
    readonly name = 'stripe' as const

    async ensureCustomer(input: Parameters<BillingProvider['ensureCustomer']>[0]) {
        const params = new URLSearchParams()

        if (input.email) params.set('email', input.email)
        if (input.name) params.set('name', input.name)
        if (input.phone) params.set('phone', input.phone)

        if (input.address?.line1) params.set('address[line1]', input.address.line1)
        if (input.address?.city) params.set('address[city]', input.address.city)
        if (input.address?.postal_code) params.set('address[postal_code]', input.address.postal_code)
        if (input.address?.country) params.set('address[country]', input.address.country)

        params.set('metadata[internal_user_id]', input.externalUserId)
        appendMetadata(params, 'metadata', input.metadata)

        const createdCustomer = await stripePost('/customers', params)
        return {
            providerCustomerId: readString(createdCustomer.id, 'customer.id'),
        }
    }

    async createCheckoutSession(input: Parameters<BillingProvider['createCheckoutSession']>[0]) {
        if (!input.successUrl || !input.cancelUrl) {
            throw new Error('Checkout success and cancel URLs are required for Stripe sessions')
        }

        const params = new URLSearchParams()
        params.set('mode', 'subscription')
        params.set('customer', input.customerId)
        params.set('success_url', input.successUrl)
        params.set('cancel_url', input.cancelUrl)
        params.set('billing_address_collection', 'required')
        params.set('automatic_tax[enabled]', input.automaticTax ? 'true' : 'false')
        params.set('subscription_data[metadata][minimum_term_months]', String(input.minimumTermMonths))

        input.lineItems.forEach((lineItem, index) => {
            params.set(`line_items[${index}][quantity]`, String(lineItem.quantity))

            if (lineItem.providerPriceId) {
                params.set(`line_items[${index}][price]`, lineItem.providerPriceId)
                return
            }

            params.set(`line_items[${index}][price_data][currency]`, lineItem.currency)
            params.set(`line_items[${index}][price_data][unit_amount]`, String(toMinorUnit(lineItem.unitAmount)))
            params.set(`line_items[${index}][price_data][recurring][interval]`, 'month')
            params.set(`line_items[${index}][price_data][product_data][name]`, lineItem.name)

            if (lineItem.productId) {
                params.set(`line_items[${index}][price_data][product_data][metadata][internal_product_id]`, lineItem.productId)
            }
        })

        appendMetadata(params, 'metadata', input.metadata)
        appendMetadata(params, 'subscription_data[metadata]', input.metadata)

        const createdSession = await stripePost('/checkout/sessions', params)
        const subscriptionValue = createdSession.subscription
        const providerSubscriptionId =
            typeof subscriptionValue === 'string' && subscriptionValue.trim()
                ? subscriptionValue
                : null

        return {
            checkoutUrl: typeof createdSession.url === 'string' ? createdSession.url : null,
            sessionId: typeof createdSession.id === 'string' ? createdSession.id : null,
            providerSubscriptionId,
        }
    }

    async ensureCatalogPrice(input: Parameters<BillingProvider['ensureCatalogPrice']>[0]) {
        const providerProductId = input.existingProviderProductId ?? await this.createProduct(input)
        const priceParams = new URLSearchParams()
        priceParams.set('product', providerProductId)
        priceParams.set('currency', input.currency)
        priceParams.set('unit_amount', String(toMinorUnit(input.monthlyUnitAmount)))
        priceParams.set('recurring[interval]', 'month')
        priceParams.set('recurring[interval_count]', '1')
        priceParams.set('metadata[internal_product_id]', input.internalProductId)
        appendMetadata(priceParams, 'metadata', input.metadata)

        const createdPrice = await stripePost('/prices', priceParams)
        const providerPriceId = readString(createdPrice.id, 'price.id')

        return {
            providerProductId,
            providerPriceId,
            currency: input.currency,
            unitAmount: toMoney(input.monthlyUnitAmount),
            interval: 'month' as const,
            intervalCount: 1,
        }
    }

    private async createProduct(input: Parameters<BillingProvider['ensureCatalogPrice']>[0]) {
        const productParams = new URLSearchParams()
        productParams.set('name', input.name)
        if (input.description) productParams.set('description', input.description)
        productParams.set('metadata[internal_product_id]', input.internalProductId)
        appendMetadata(productParams, 'metadata', input.metadata)

        const createdProduct = await stripePost('/products', productParams)
        return readString(createdProduct.id, 'product.id')
    }
}
