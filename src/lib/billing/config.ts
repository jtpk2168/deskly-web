import { BILLING_PROVIDERS, BillingProviderName } from './types'

const FALLBACK_PROVIDER: BillingProviderName = 'mock'
const FALLBACK_CURRENCY = 'myr'
const FALLBACK_MINIMUM_TERM_MONTHS = 12
const FALLBACK_SST_RATE = 0.08

function parseProvider(value: string | undefined): BillingProviderName {
    if (!value) return FALLBACK_PROVIDER
    const normalized = value.trim().toLowerCase()
    return BILLING_PROVIDERS.includes(normalized as BillingProviderName)
        ? (normalized as BillingProviderName)
        : FALLBACK_PROVIDER
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value ?? '', 10)
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback
    return parsed
}

function parseSstRate(value: string | undefined, fallback: number) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 1) return fallback
    return parsed
}

function parseBoolean(value: string | undefined, fallback = false) {
    if (value == null) return fallback
    const normalized = value.trim().toLowerCase()
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true
    if (normalized === '0' || normalized === 'false' || normalized === 'no') return false
    return fallback
}

export const BILLING_PROVIDER = parseProvider(process.env.BILLING_PROVIDER)
export const BILLING_DEFAULT_CURRENCY = (process.env.BILLING_DEFAULT_CURRENCY ?? FALLBACK_CURRENCY).trim().toLowerCase() || FALLBACK_CURRENCY
export const BILLING_MINIMUM_TERM_MONTHS = parsePositiveInteger(process.env.BILLING_MINIMUM_TERM_MONTHS, FALLBACK_MINIMUM_TERM_MONTHS)
export const BILLING_SST_RATE = parseSstRate(process.env.BILLING_SST_RATE, FALLBACK_SST_RATE)
export const BILLING_STRIPE_AUTOMATIC_TAX = parseBoolean(process.env.BILLING_STRIPE_AUTOMATIC_TAX, true)
export const BILLING_STRIPE_TAX_RATE_ID = process.env.BILLING_STRIPE_TAX_RATE_ID?.trim() || null
export const BILLING_CHECKOUT_SUCCESS_URL = process.env.BILLING_CHECKOUT_SUCCESS_URL?.trim() || null
export const BILLING_CHECKOUT_CANCEL_URL = process.env.BILLING_CHECKOUT_CANCEL_URL?.trim() || null
