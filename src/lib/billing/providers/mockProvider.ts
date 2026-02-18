import { createHash } from 'node:crypto'
import { toMoney } from '../money'
import { BillingProvider } from './provider'

function hashId(prefix: string, input: string) {
    const digest = createHash('sha256').update(input).digest('hex').slice(0, 16)
    return `${prefix}_${digest}`
}

export class MockBillingProvider implements BillingProvider {
    readonly name = 'mock' as const

    async ensureCustomer(input: Parameters<BillingProvider['ensureCustomer']>[0]) {
        const seed = `${input.externalUserId}:${input.email ?? ''}`
        return { providerCustomerId: hashId('mock_cus', seed) }
    }

    async createCheckoutSession(input: Parameters<BillingProvider['createCheckoutSession']>[0]) {
        const total = input.lineItems.reduce(
            (sum, item) => sum + toMoney(item.unitAmount) * item.quantity,
            0,
        )

        return {
            checkoutUrl: null,
            sessionId: hashId('mock_cs', `${input.customerId}:${total}:${Date.now()}`),
            providerSubscriptionId: hashId('mock_sub', `${input.customerId}:${input.minimumTermMonths}:${Date.now()}`),
        }
    }

    async getCheckoutSessionUrl(sessionId: string) {
        void sessionId
        return null
    }

    async ensureCatalogPrice(input: Parameters<BillingProvider['ensureCatalogPrice']>[0]) {
        const providerProductId = input.existingProviderProductId
            ?? hashId('mock_prod', `${input.internalProductId}:${input.name}`)

        return {
            providerProductId,
            providerPriceId: hashId('mock_price', `${providerProductId}:${input.currency}:${input.monthlyUnitAmount}`),
            currency: input.currency,
            unitAmount: toMoney(input.monthlyUnitAmount),
            interval: 'month' as const,
            intervalCount: 1,
        }
    }

    async cancelSubscription(input: Parameters<BillingProvider['cancelSubscription']>[0]) {
        return {
            providerSubscriptionId: input.providerSubscriptionId,
            cancelledAt: new Date().toISOString(),
        }
    }
}
