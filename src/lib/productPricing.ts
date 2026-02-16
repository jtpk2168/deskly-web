import { ProductPricingMode, normalizePricingMode } from './products'

export type ProductPricingTier = {
    min_months: number
    monthly_price: number
}

export type ResolvedProductPricing = {
    monthlyPrice: number
    pricingMode: ProductPricingMode
    pricingTiers: ProductPricingTier[]
}

type ResolveProductPricingInput = {
    monthlyPrice: unknown
    pricingMode: unknown
    pricingTiers?: unknown
}

type ResolveProductPricingResult =
    | { value: ResolvedProductPricing; error: null }
    | { value: null; error: string }

function parsePricingTier(value: unknown): ProductPricingTier | null {
    if (!value || typeof value !== 'object') return null

    const tier = value as { min_months?: unknown; monthly_price?: unknown }
    const minMonths = Number(tier.min_months)
    const monthlyPrice = Number(tier.monthly_price)

    if (!Number.isInteger(minMonths) || minMonths < 2) return null
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) return null

    return {
        min_months: minMonths,
        monthly_price: monthlyPrice,
    }
}

function normalizePricingTiers(input: unknown): ProductPricingTier[] | null {
    if (!Array.isArray(input)) return null
    const normalized = input.map(parsePricingTier)
    if (normalized.some((tier) => tier == null)) return null
    return (normalized as ProductPricingTier[]).sort((a, b) => a.min_months - b.min_months)
}

export function resolveProductPricing(input: ResolveProductPricingInput): ResolveProductPricingResult {
    const monthlyPrice = Number(input.monthlyPrice)
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
        return { value: null, error: 'monthly_price must be a positive number' }
    }

    const hasPricingModeInput =
        input.pricingMode !== undefined &&
        input.pricingMode !== null &&
        String(input.pricingMode).trim().length > 0

    const parsedPricingMode = normalizePricingMode(
        hasPricingModeInput ? String(input.pricingMode) : 'fixed'
    )

    if (!parsedPricingMode) {
        return { value: null, error: 'pricing_mode must be either fixed or tiered' }
    }

    if (parsedPricingMode === 'fixed') {
        return {
            value: {
                monthlyPrice,
                pricingMode: 'fixed',
                pricingTiers: [],
            },
            error: null,
        }
    }

    const parsedTiers = normalizePricingTiers(input.pricingTiers)
    if (!parsedTiers || parsedTiers.length === 0) {
        return {
            value: null,
            error: 'pricing_tiers must include at least one valid tier when pricing_mode is tiered',
        }
    }

    const seenMonths = new Set<number>()
    for (const tier of parsedTiers) {
        if (seenMonths.has(tier.min_months)) {
            return { value: null, error: 'pricing_tiers cannot contain duplicate min_months values' }
        }
        seenMonths.add(tier.min_months)

        if (tier.monthly_price > monthlyPrice) {
            return {
                value: null,
                error: 'pricing_tiers monthly_price must be less than or equal to monthly_price',
            }
        }
    }

    return {
        value: {
            monthlyPrice,
            pricingMode: 'tiered',
            pricingTiers: parsedTiers,
        },
        error: null,
    }
}
