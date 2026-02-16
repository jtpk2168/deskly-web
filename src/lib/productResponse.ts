type PricingTierRow = { min_months?: unknown; monthly_price?: unknown }

function normalizePricingTier(row: PricingTierRow) {
    return {
        min_months: Number(row.min_months),
        monthly_price: Number(row.monthly_price),
    }
}

export function toProductResponse<T extends { product_pricing_tiers?: unknown }>(row: T) {
    const tiers = Array.isArray(row.product_pricing_tiers)
        ? row.product_pricing_tiers
            .map((item) => normalizePricingTier(item as PricingTierRow))
            .filter((tier) => Number.isInteger(tier.min_months) && Number.isFinite(tier.monthly_price))
            .sort((a, b) => a.min_months - b.min_months)
        : []

    const rest = { ...(row as Record<string, unknown>) }
    delete rest.product_pricing_tiers

    return {
        ...rest,
        pricing_tiers: tiers,
    }
}

export function toProductResponseList<T extends { product_pricing_tiers?: unknown }>(rows: T[]) {
    return rows.map(toProductResponse)
}
