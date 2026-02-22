import type {
    AdminOrderStatus,
    BillingInvoiceProvider,
    BillingInvoiceStatus,
    BillingWebhookEventProvider,
    BillingWebhookEventStatus,
    DeliveryOrderStatus,
} from '@/lib/api'

export const DELIVERY_ORDER_STATUS_OPTIONS: Array<{ value: DeliveryOrderStatus; label: string }> = [
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'dispatched', label: 'Dispatched' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'partially_delivered', label: 'Partially Delivered' },
    { value: 'failed', label: 'Failed' },
    { value: 'rescheduled', label: 'Rescheduled' },
    { value: 'cancelled', label: 'Cancelled' },
]

export const SUBSCRIPTION_STATUS_FILTER_OPTIONS: Array<{ value: 'all' | AdminOrderStatus; label: string }> = [
    { value: 'all', label: 'All Status' },
    { value: 'pending_payment', label: 'Pending Payment' },
    { value: 'payment_failed', label: 'Payment Failed' },
    { value: 'active', label: 'Active' },
    { value: 'cancelled', label: 'Cancelled' },
]

export const INVOICE_STATUS_FILTER_OPTIONS: Array<{ value: 'all' | BillingInvoiceStatus; label: string }> = [
    { value: 'all', label: 'All Statuses' },
    { value: 'paid', label: 'Paid' },
    { value: 'open', label: 'Open' },
    { value: 'draft', label: 'Draft' },
    { value: 'payment_failed', label: 'Payment Failed' },
    { value: 'void', label: 'Void' },
    { value: 'uncollectible', label: 'Uncollectible' },
    { value: 'unknown', label: 'Unknown' },
]

export const INVOICE_PROVIDER_FILTER_OPTIONS: Array<{ value: 'all' | BillingInvoiceProvider; label: string }> = [
    { value: 'all', label: 'All Providers' },
    { value: 'stripe', label: 'Stripe' },
    { value: 'mock', label: 'Mock' },
]

export const WEBHOOK_EVENT_STATUS_OPTIONS: Array<{ value: 'all' | BillingWebhookEventStatus; label: string }> = [
    { value: 'all', label: 'All Statuses' },
    { value: 'received', label: 'Received' },
    { value: 'processed', label: 'Processed' },
    { value: 'failed', label: 'Failed' },
]

export const WEBHOOK_PROVIDER_FILTER_OPTIONS: Array<{ value: 'all' | BillingWebhookEventProvider; label: string }> = [
    { value: 'all', label: 'All Providers' },
    { value: 'stripe', label: 'Stripe' },
    { value: 'mock', label: 'Mock' },
]
