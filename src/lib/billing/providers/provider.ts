import { BillingProviderName } from '../types'

export type BillingAddressInput = {
    line1?: string | null
    city?: string | null
    postal_code?: string | null
    country?: string | null
}

export type EnsureBillingCustomerInput = {
    externalUserId: string
    email: string | null
    name: string | null
    phone: string | null
    address?: BillingAddressInput | null
    metadata?: Record<string, string>
}

export type EnsureBillingCustomerResult = {
    providerCustomerId: string
}

export type BillingSessionLineItem = {
    name: string
    quantity: number
    unitAmount: number
    currency: string
    productId?: string | null
    providerPriceId?: string | null
    metadata?: Record<string, string>
}

export type CreateBillingCheckoutSessionInput = {
    customerId: string
    lineItems: BillingSessionLineItem[]
    currency: string
    automaticTax: boolean
    manualTaxRateId?: string | null
    minimumTermMonths: number
    successUrl: string
    cancelUrl: string
    metadata?: Record<string, string>
}

export type CreateBillingCheckoutSessionResult = {
    checkoutUrl: string | null
    sessionId: string | null
    providerSubscriptionId: string | null
}

export type EnsureBillingCatalogPriceInput = {
    internalProductId: string
    name: string
    description?: string | null
    currency: string
    monthlyUnitAmount: number
    metadata?: Record<string, string>
    existingProviderProductId?: string | null
}

export type EnsureBillingCatalogPriceResult = {
    providerProductId: string
    providerPriceId: string
    currency: string
    unitAmount: number
    interval: 'month'
    intervalCount: number
}

export type CancelBillingSubscriptionInput = {
    providerSubscriptionId: string
    reason?: string
}

export type CancelBillingSubscriptionResult = {
    providerSubscriptionId: string
    cancelledAt: string | null
}

export interface BillingProvider {
    readonly name: BillingProviderName
    ensureCustomer(input: EnsureBillingCustomerInput): Promise<EnsureBillingCustomerResult>
    createCheckoutSession(input: CreateBillingCheckoutSessionInput): Promise<CreateBillingCheckoutSessionResult>
    getCheckoutSessionUrl(sessionId: string): Promise<string | null>
    ensureCatalogPrice(input: EnsureBillingCatalogPriceInput): Promise<EnsureBillingCatalogPriceResult>
    cancelSubscription(input: CancelBillingSubscriptionInput): Promise<CancelBillingSubscriptionResult>
}
