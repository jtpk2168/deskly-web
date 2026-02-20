export const BILLING_FIELDS_READONLY_ERROR = 'Billing fields are managed by Stripe and cannot be edited manually.'

const LOCKED_BILLING_FIELDS = new Set([
    'status',
    'billing_status',
    'subscription_status',
    'monthly_total',
    'monthly_rate',
    'start_date',
    'end_date',
])

function normalizeFieldKey(key: string) {
    return key
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase()
}

export function findLockedBillingFieldEdits(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return [] as string[]
    }

    return Object.keys(payload).filter((key) => LOCKED_BILLING_FIELDS.has(normalizeFieldKey(key)))
}

export function hasLockedBillingFieldEdits(payload: unknown) {
    return findLockedBillingFieldEdits(payload).length > 0
}
