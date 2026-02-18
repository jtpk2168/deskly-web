import { BILLING_PROVIDER } from '../config'
import { BillingProviderName } from '../types'
import { BillingProvider } from './provider'
import { MockBillingProvider } from './mockProvider'
import { StripeBillingProvider } from './stripeProvider'

const mockProvider = new MockBillingProvider()
const stripeProvider = new StripeBillingProvider()

export function getBillingProviderByName(provider: BillingProviderName): BillingProvider {
    if (provider === 'stripe') return stripeProvider
    return mockProvider
}

export function getBillingProvider(): BillingProvider {
    return getBillingProviderByName(BILLING_PROVIDER)
}
