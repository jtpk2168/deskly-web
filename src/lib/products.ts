export const PRODUCT_CATEGORIES = ['Chairs', 'Desks', 'Storage', 'Meeting', 'Accessories'] as const
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export const PRODUCT_STATUSES = ['draft', 'active', 'inactive'] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]
export const PRODUCT_PRICING_MODES = ['fixed', 'tiered'] as const
export type ProductPricingMode = (typeof PRODUCT_PRICING_MODES)[number]

const CATEGORY_ALIASES: Record<string, ProductCategory> = {
    chair: 'Chairs',
    chairs: 'Chairs',
    desk: 'Desks',
    desks: 'Desks',
    storage: 'Storage',
    meeting: 'Meeting',
    meetings: 'Meeting',
    accessory: 'Accessories',
    accessories: 'Accessories',
}

const CATEGORY_CODE_BY_KEY: Record<string, string> = {
    chair: 'CHAIR',
    chairs: 'CHAIR',
    desk: 'DESK',
    desks: 'DESK',
    storage: 'STORAGE',
    meeting: 'MEETING',
    meetings: 'MEETING',
    accessory: 'ACCESSORY',
    accessories: 'ACCESSORY',
}

export function normalizeCategory(input: string | null | undefined): ProductCategory | null {
    const key = (input ?? '').trim().toLowerCase()
    if (!key) return null
    return CATEGORY_ALIASES[key] ?? null
}

export function resolveCategoryCode(input: string | null | undefined): string | null {
    const key = (input ?? '').trim().toLowerCase()
    if (!key) return null
    return CATEGORY_CODE_BY_KEY[key] ?? null
}

export function normalizeStatus(input: string | null | undefined): ProductStatus | null {
    const key = (input ?? '').trim().toLowerCase()
    if (!key) return null
    if (PRODUCT_STATUSES.includes(key as ProductStatus)) return key as ProductStatus
    return null
}

export function normalizePricingMode(input: string | null | undefined): ProductPricingMode | null {
    const key = (input ?? '').trim().toLowerCase()
    if (!key) return null
    if (PRODUCT_PRICING_MODES.includes(key as ProductPricingMode)) return key as ProductPricingMode
    return null
}

export function parseOptionalNumber(input: string | null | undefined): number | null {
    if (input == null || input === '') return null
    const parsed = Number(input)
    return Number.isFinite(parsed) ? parsed : null
}

export function isValidHttpUrl(input: string | null | undefined): boolean {
    if (!input) return true
    try {
        const parsed = new URL(input)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
        return false
    }
}
