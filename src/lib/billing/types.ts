export const BILLING_PROVIDERS = ['mock', 'stripe'] as const
export type BillingProviderName = (typeof BILLING_PROVIDERS)[number]

export type BillingStatus =
    | 'active'
    | 'pending'
    | 'pending_payment'
    | 'payment_failed'
    | 'incomplete'
    | 'cancelled'
    | 'completed'

export type BillingCheckoutItemInput = {
    product_id?: unknown
    product_name?: unknown
    category?: unknown
    monthly_price?: unknown
    duration_months?: unknown
    quantity?: unknown
}

export type NormalizedBillingCheckoutItem = {
    product_id: string | null
    product_name: string
    category: string | null
    monthly_price: number
    duration_months: number | null
    quantity: number
}

export type BillingCheckoutRequest = {
    user_id?: unknown
    bundle_id?: unknown
    start_date?: unknown
    end_date?: unknown
    monthly_total?: unknown
    product_name?: unknown
    currency?: unknown
    minimum_term_months?: unknown
    success_url?: unknown
    cancel_url?: unknown
    items?: unknown
}

export type BillingTaxQuote = {
    subtotal: number
    sst_rate: number
    sst_amount: number
    total: number
    currency: string
}

