import { BILLING_PROVIDER } from '../config'
import { BillingProviderName } from '../types'
import { BillingProvider } from './provider'
import { MockBillingProvider } from './mockProvider'
import { StripeBillingProvider } from './stripeProvider'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const mockProvider = new MockBillingProvider()
const stripeProvider = new StripeBillingProvider()

export function getBillingProviderByName(provider: BillingProviderName): BillingProvider {
    if (provider === 'stripe') return stripeProvider
    if (IS_PRODUCTION) {
        throw new Error(`Billing provider "${provider}" is not supported in production. Set BILLING_PROVIDER=stripe.`)
    }
    return mockProvider
}

export function getBillingProvider(): BillingProvider {
    return getBillingProviderByName(BILLING_PROVIDER)
}
