export type AdminBadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'outline'

export function getDeliveryStatusVariant(status: string | null): AdminBadgeVariant {
    const normalizedStatus = status?.toLowerCase()
    if (normalizedStatus === 'delivered' || normalizedStatus === 'partially_delivered') return 'success'
    if (normalizedStatus === 'dispatched' || normalizedStatus === 'confirmed' || normalizedStatus === 'rescheduled') return 'warning'
    if (normalizedStatus === 'failed' || normalizedStatus === 'cancelled') return 'error'
    return 'default'
}

export function getBillingStatusVariant(status: string | null): AdminBadgeVariant {
    const normalizedStatus = status?.toLowerCase()
    if (normalizedStatus === 'active' || normalizedStatus === 'paid') return 'success'
    if (normalizedStatus === 'pending_payment' || normalizedStatus === 'open' || normalizedStatus === 'draft' || normalizedStatus === 'received') return 'warning'
    if (normalizedStatus === 'payment_failed' || normalizedStatus === 'cancelled' || normalizedStatus === 'void' || normalizedStatus === 'uncollectible' || normalizedStatus === 'failed') return 'error'
    return 'default'
}

export function getRoleVariant(role: string | null): AdminBadgeVariant {
    return role === 'Admin' ? 'default' : 'outline'
}

export function getProviderVariant(provider: string | null): AdminBadgeVariant {
    if (provider === 'stripe') return 'outline'
    if (provider === 'mock') return 'default'
    return 'default'
}

export function getInvoiceStatusVariant(status: string | null): AdminBadgeVariant {
    return getBillingStatusVariant(status)
}

export function getWebhookEventStatusVariant(status: string | null): AdminBadgeVariant {
    if (status === 'processed') return 'success'
    if (status === 'received') return 'warning'
    if (status === 'failed') return 'error'
    return 'default'
}

export function getProductStatusVariant(status: string | null): AdminBadgeVariant {
    if (status === 'active') return 'success'
    if (status === 'inactive') return 'error'
    if (status === 'draft') return 'outline'
    return 'default'
}
