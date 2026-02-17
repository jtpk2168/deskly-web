import { BILLING_SST_RATE } from './config'
import { toMoney } from './money'
import { BillingTaxQuote } from './types'

export function calculateSstQuote(subtotal: number, currency: string): BillingTaxQuote {
    const safeSubtotal = Number.isFinite(subtotal) && subtotal >= 0 ? subtotal : 0
    const normalizedCurrency = currency.trim().toLowerCase() || 'myr'
    const subtotalAmount = toMoney(safeSubtotal)
    const sstAmount = toMoney(subtotalAmount * BILLING_SST_RATE)
    const total = toMoney(subtotalAmount + sstAmount)

    return {
        subtotal: subtotalAmount,
        sst_rate: BILLING_SST_RATE,
        sst_amount: sstAmount,
        total,
        currency: normalizedCurrency,
    }
}

