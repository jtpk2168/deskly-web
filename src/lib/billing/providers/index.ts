import { BILLING_PROVIDER } from '../config'
import { BillingProvider } from './provider'
import { MockBillingProvider } from './mockProvider'
import { StripeBillingProvider } from './stripeProvider'

const mockProvider = new MockBillingProvider()
const stripeProvider = new StripeBillingProvider()

export function getBillingProvider(): BillingProvider {
    if (BILLING_PROVIDER === 'stripe') return stripeProvider
    return mockProvider
}

