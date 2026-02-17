import { BillingCheckoutItemInput, NormalizedBillingCheckoutItem } from './types'
import { toMoney } from './money'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseUUID(value: unknown) {
    if (typeof value !== 'string') return null
    return UUID_REGEX.test(value) ? value : null
}

export function hasText(value: string | null | undefined) {
    return typeof value === 'string' && value.trim().length > 0
}

export function parseOptionalMoney(value: unknown, fieldName: string) {
    if (value == null || value === '') return { value: null as number | null, error: null as string | null }
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) {
        return { value: null as number | null, error: `${fieldName} must be a non-negative number` }
    }

    return { value: toMoney(parsed), error: null as string | null }
}

export function parseRequiredPositiveMoney(value: unknown, fieldName: string) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return { value: null as number | null, error: `${fieldName} must be a positive number` }
    }

    return { value: toMoney(parsed), error: null as string | null }
}

export function parseOptionalPositiveInteger(value: unknown, fieldName: string) {
    if (value == null || value === '') return { value: null as number | null, error: null as string | null }
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return { value: null as number | null, error: `${fieldName} must be a positive integer` }
    }

    return { value: parsed, error: null as string | null }
}

export function parseRequiredPositiveInteger(value: unknown, fieldName: string) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return { value: null as number | null, error: `${fieldName} must be a positive integer` }
    }

    return { value: parsed, error: null as string | null }
}

export function parseCheckoutItems(value: unknown) {
    if (value == null) return { items: [] as NormalizedBillingCheckoutItem[], error: null as string | null }
    if (!Array.isArray(value)) return { items: [] as NormalizedBillingCheckoutItem[], error: 'items must be an array' }

    const normalizedItems: NormalizedBillingCheckoutItem[] = []

    for (let index = 0; index < value.length; index += 1) {
        const rawItem = value[index]
        if (typeof rawItem !== 'object' || rawItem == null) {
            return { items: [] as NormalizedBillingCheckoutItem[], error: `items[${index}] must be an object` }
        }

        const item = rawItem as BillingCheckoutItemInput
        const productName = typeof item.product_name === 'string' ? item.product_name.trim() : ''
        if (!productName) {
            return { items: [] as NormalizedBillingCheckoutItem[], error: `items[${index}].product_name is required` }
        }

        let productId: string | null = null
        if (item.product_id != null && item.product_id !== '') {
            const parsedProductId = parseUUID(item.product_id)
            if (!parsedProductId) {
                return { items: [] as NormalizedBillingCheckoutItem[], error: `items[${index}].product_id must be a valid UUID` }
            }
            productId = parsedProductId
        }

        const quantity = parseRequiredPositiveInteger(item.quantity, `items[${index}].quantity`)
        if (quantity.error) return { items: [] as NormalizedBillingCheckoutItem[], error: quantity.error }

        const monthlyPrice = parseRequiredPositiveMoney(item.monthly_price, `items[${index}].monthly_price`)
        if (monthlyPrice.error) return { items: [] as NormalizedBillingCheckoutItem[], error: monthlyPrice.error }

        const durationMonths = parseOptionalPositiveInteger(item.duration_months, `items[${index}].duration_months`)
        if (durationMonths.error) return { items: [] as NormalizedBillingCheckoutItem[], error: durationMonths.error }

        const category = typeof item.category === 'string' && item.category.trim()
            ? item.category.trim()
            : null

        normalizedItems.push({
            product_id: productId,
            product_name: productName,
            category,
            monthly_price: monthlyPrice.value ?? 0,
            duration_months: durationMonths.value,
            quantity: quantity.value ?? 1,
        })
    }

    return { items: normalizedItems, error: null as string | null }
}

