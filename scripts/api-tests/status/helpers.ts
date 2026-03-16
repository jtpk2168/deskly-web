import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Evidence } from '../types'
import type {
    ApiCallResult,
    ScenarioContext,
    ScenarioFixture,
    ScenarioState,
} from './types'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

function throwIfError(error: { message: string } | null, label: string): asserts error is null {
    if (error) throw new Error(`${label}: ${error.message}`)
}

function makeUniqueToken(ctx: ScenarioContext, suffix: string) {
    const base = `${ctx.runId}-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return base.replace(/[^a-zA-Z0-9_-]/g, '')
}

function toApiUrl(baseUrl: string, path: string) {
    const normalizedBase = baseUrl.replace(/\/$/, '')
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return `${normalizedBase}${normalizedPath}`
}

function redactHeaders(headers: Record<string, string>) {
    const entries = Object.keys(headers).map((key) => [key, '<redacted>'] as const)
    return Object.fromEntries(entries)
}

function redactBody(value: unknown): unknown {
    if (value == null) return value
    if (typeof value === 'string') return value.length > 200 ? `${value.slice(0, 200)}...` : value
    if (typeof value === 'number' || typeof value === 'boolean') return value
    if (Array.isArray(value)) return value.slice(0, 8).map((entry) => redactBody(entry))
    if (typeof value === 'object') {
        const source = value as Record<string, unknown>
        const out: Record<string, unknown> = {}
        for (const [key, entry] of Object.entries(source)) {
            const normalized = key.toLowerCase()
            if (normalized.includes('token') || normalized.includes('secret') || normalized.includes('password')) {
                out[key] = '<redacted>'
                continue
            }
            if (normalized.includes('email')) {
                out[key] = '<redacted>'
                continue
            }
            out[key] = redactBody(entry)
        }
        return out
    }
    return '<unserializable>'
}

function recordApiCall(state: ScenarioState, call: ApiCallResult) {
    state.requestSummary = {
        method: call.method,
        url: call.url,
        headersRedacted: redactHeaders(call.requestHeaders),
    }
    state.responseSnapshot = {
        status: call.status,
        bodyRedacted: redactBody(call.body),
    }
}

export function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

export function createScenarioState(): ScenarioState {
    return {
        createdIds: new Set<string>(),
        dbBeforeAfterKeys: {
            before: [],
            after: [],
        },
        cleanup: {
            userIds: new Set<string>(),
            subscriptionIds: new Set<string>(),
            webhookEventIds: new Set<string>(),
            invoiceProviderIds: new Set<string>(),
        },
    }
}

export function createServiceRoleClient(ctx: ScenarioContext) {
    return createClient(ctx.supabaseUrl, ctx.supabaseServiceRoleKey)
}

export function buildEvidence(state: ScenarioState): Evidence {
    return {
        requestSummary: state.requestSummary ?? {
            method: 'N/A',
            url: 'internal://no-http-call-captured',
            headersRedacted: {},
        },
        responseSnapshot: state.responseSnapshot ?? {
            status: 0,
            bodyRedacted: { note: 'No HTTP response captured.' },
        },
        createdIds: [...state.createdIds],
        dbBeforeAfterKeys: {
            before: state.dbBeforeAfterKeys.before,
            after: state.dbBeforeAfterKeys.after,
        },
        webhookEventId: state.webhookEventId,
        idempotencyKey: state.idempotencyKey,
    }
}

function parseJsonOrText(text: string): unknown {
    if (!text) return null
    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}

type ApiRequestArgs = {
    method: string
    path: string
    headers?: Record<string, string>
    jsonBody?: JsonValue
    rawBody?: string
}

export async function callApi(ctx: ScenarioContext, state: ScenarioState, args: ApiRequestArgs): Promise<ApiCallResult> {
    const url = toApiUrl(ctx.apiBaseUrl, args.path)
    const requestHeaders: Record<string, string> = {
        ...(args.headers ?? {}),
    }

    let body: string | undefined
    if (args.rawBody != null) {
        body = args.rawBody
    } else if (args.jsonBody != null) {
        body = JSON.stringify(args.jsonBody)
        if (!requestHeaders['Content-Type']) requestHeaders['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, {
        method: args.method,
        headers: requestHeaders,
        body,
    })

    const text = await response.text()
    const parsedBody = parseJsonOrText(text)
    const call = {
        method: args.method,
        url,
        requestHeaders,
        status: response.status,
        body: parsedBody,
    }
    recordApiCall(state, call)
    return call
}

export function expectStatus(call: ApiCallResult, expected: number, label: string) {
    if (call.status !== expected) {
        throw new Error(`${label}: expected HTTP ${expected}, received ${call.status}`)
    }
}

export function expectStatusOneOf(call: ApiCallResult, expected: number[], label: string) {
    if (!expected.includes(call.status)) {
        throw new Error(`${label}: expected HTTP ${expected.join(' or ')}, received ${call.status}`)
    }
}

function readApiData<T>(body: unknown): T {
    if (!body || typeof body !== 'object') throw new Error('API response body is missing JSON object')
    const record = body as Record<string, unknown>
    return record.data as T
}

type CreatedUser = {
    id: string
    email: string
}

export async function createScenarioUser(ctx: ScenarioContext, state: ScenarioState, label: string): Promise<CreatedUser> {
    const supabase = createServiceRoleClient(ctx)
    const token = makeUniqueToken(ctx, label).toLowerCase()
    const email = `apitest+${token}@deskly.local`
    const password = `DesklyStatus!${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`

    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
            full_name: `Status ${label} User`,
            name: `Status ${label} User`,
        },
    })
    throwIfError(userError, 'create auth user')

    const userId = userData.user?.id
    assert(userId, 'Failed to resolve created auth user id')

    const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
            id: userId,
            full_name: `Status ${label} User`,
            job_title: 'Operations Lead',
            phone_number: '+60111222333',
            role: 'customer',
        })
    throwIfError(profileError, 'upsert profile')

    const { error: companyError } = await supabase
        .from('companies')
        .insert({
            profile_id: userId,
            company_name: `Deskly Status ${token}`,
            registration_number: `REG-${token.toUpperCase().slice(0, 12)}`,
            address: '1 Status Test Road',
            office_city: 'Kuala Lumpur',
            office_zip_postal: '50000',
            delivery_address: '1 Status Test Road',
            delivery_city: 'Kuala Lumpur',
            delivery_zip_postal: '50000',
            industry: 'Technology',
            team_size: '11-50',
        })
    throwIfError(companyError, 'insert company')

    state.cleanup.userIds.add(userId)
    state.createdIds.add(`user:${userId}`)
    state.createdIds.add(`profile:${userId}`)

    return { id: userId, email }
}

export async function createSubscriptionForUser(
    ctx: ScenarioContext,
    state: ScenarioState,
    userId: string,
    label: string,
): Promise<ScenarioFixture> {
    const createCall = await callApi(ctx, state, {
        method: 'POST',
        path: '/api/subscriptions',
        jsonBody: {
            user_id: userId,
            monthly_total: 100,
            minimum_term_months: 12,
            items: [
                {
                    product_name: `Status Item ${label}`,
                    category: 'office',
                    monthly_price: 100,
                    duration_months: 12,
                    quantity: 1,
                },
            ],
            delivery_company_name: `Deskly Status ${label}`,
            delivery_address: '1 Status Test Road',
            delivery_city: 'Kuala Lumpur',
            delivery_zip_postal: '50000',
            delivery_contact_name: `Status ${label} Contact`,
            delivery_contact_phone: '+60111999888',
        },
    })
    expectStatus(createCall, 201, 'create subscription')

    const createdSubscription = readApiData<{ id?: unknown }>(createCall.body)
    const subscriptionId = typeof createdSubscription?.id === 'string' ? createdSubscription.id : null
    assert(subscriptionId, 'Subscription creation response is missing subscription id')

    const supabase = createServiceRoleClient(ctx)
    const { data: order, error: orderError } = await supabase
        .from('delivery_orders')
        .select('id')
        .eq('subscription_id', subscriptionId)
        .maybeSingle()
    throwIfError(orderError, 'load delivery order for subscription')
    const deliveryOrderId = typeof order?.id === 'string' ? order.id : null
    assert(deliveryOrderId, 'Delivery order was not created for subscription')

    state.cleanup.subscriptionIds.add(subscriptionId)
    state.createdIds.add(`subscription:${subscriptionId}`)
    state.createdIds.add(`delivery_order:${deliveryOrderId}`)

    return {
        userId,
        subscriptionId,
        deliveryOrderId,
    }
}

function createStripeSignature(secret: string, payload: string, timestamp: number) {
    const signedPayload = `${timestamp}.${payload}`
    const digest = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
    return `t=${timestamp},v1=${digest}`
}

type SupportedStripeEvent =
    | 'invoice.payment_failed'
    | 'invoice.paid'
    | 'invoice.payment_succeeded'
    | 'customer.subscription.deleted'
    | 'customer.subscription.updated'
    | 'customer.subscription.created'

type WebhookDispatchResult = {
    call: ApiCallResult
    eventId: string
    providerInvoiceId?: string
}

export async function sendStripeWebhook(
    ctx: ScenarioContext,
    state: ScenarioState,
    eventType: SupportedStripeEvent,
    subscriptionId: string,
    options?: {
        providerSubscriptionId?: string
        subscriptionStatus?: string
    },
): Promise<WebhookDispatchResult> {
    ctx.webhookSequence.current += 1
    const sequence = ctx.webhookSequence.current
    const nowEpoch = Math.floor(Date.now() / 1000)
    const eventId = `evt_${ctx.runId}_${sequence}`
    const providerSubscriptionId = options?.providerSubscriptionId ?? `sub_${ctx.runId}_${sequence}`
    const providerInvoiceId = `in_${ctx.runId}_${sequence}`

    const eventObject: Record<string, unknown> = {
        metadata: {
            internal_subscription_id: subscriptionId,
        },
    }

    if (eventType.startsWith('invoice.')) {
        const paid = eventType === 'invoice.paid' || eventType === 'invoice.payment_succeeded'
        eventObject.id = providerInvoiceId
        eventObject.subscription = providerSubscriptionId
        eventObject.customer = `cus_${ctx.runId}_${sequence}`
        eventObject.status = paid ? 'paid' : 'open'
        eventObject.paid = paid
        eventObject.currency = 'myr'
        eventObject.subtotal = 10000
        eventObject.total = 10800
        eventObject.amount_paid = paid ? 10800 : 0
        eventObject.amount_due = paid ? 0 : 10800
        eventObject.period_start = nowEpoch
        eventObject.period_end = nowEpoch + 60 * 60 * 24 * 30
        eventObject.status_transitions = {
            paid_at: paid ? nowEpoch : null,
        }
    } else {
        eventObject.id = providerSubscriptionId
        eventObject.customer = `cus_${ctx.runId}_${sequence}`
        eventObject.status = options?.subscriptionStatus ?? (eventType === 'customer.subscription.deleted' ? 'canceled' : 'active')
        eventObject.cancel_at_period_end = false
        eventObject.current_period_end = nowEpoch + 60 * 60 * 24 * 30
        eventObject.canceled_at = eventType === 'customer.subscription.deleted' ? nowEpoch : null
    }

    const payload = JSON.stringify({
        id: eventId,
        type: eventType,
        created: nowEpoch,
        data: {
            object: eventObject,
        },
    })
    const signature = createStripeSignature(ctx.stripeWebhookSecret, payload, nowEpoch)

    const call = await callApi(ctx, state, {
        method: 'POST',
        path: '/api/webhooks/stripe',
        rawBody: payload,
        headers: {
            'Content-Type': 'application/json',
            'stripe-signature': signature,
        },
    })
    expectStatus(call, 200, `dispatch webhook ${eventType}`)

    state.webhookEventId = eventId
    state.cleanup.webhookEventIds.add(eventId)
    state.createdIds.add(`webhook_event:${eventId}`)

    if (eventType.startsWith('invoice.')) {
        state.cleanup.invoiceProviderIds.add(providerInvoiceId)
        state.createdIds.add(`invoice:${providerInvoiceId}`)
    }

    return {
        call,
        eventId,
        providerInvoiceId: eventType.startsWith('invoice.') ? providerInvoiceId : undefined,
    }
}

export async function getSubscriptionStatus(ctx: ScenarioContext, subscriptionId: string) {
    const supabase = createServiceRoleClient(ctx)
    const { data, error } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('id', subscriptionId)
        .maybeSingle()
    throwIfError(error, 'load subscription status')
    return typeof data?.status === 'string' ? data.status : null
}

export async function getDeliveryOrderState(ctx: ScenarioContext, deliveryOrderId: string) {
    const supabase = createServiceRoleClient(ctx)
    const { data, error } = await supabase
        .from('delivery_orders')
        .select('id, subscription_id, do_status, failure_reason, rescheduled_at, cancelled_reason')
        .eq('id', deliveryOrderId)
        .maybeSingle()
    throwIfError(error, 'load delivery order state')
    assert(data, `delivery order not found: ${deliveryOrderId}`)
    return data
}

export async function getFulfillmentState(ctx: ScenarioContext, subscriptionId: string) {
    const supabase = createServiceRoleClient(ctx)
    const { data, error } = await supabase
        .from('subscription_fulfillment')
        .select('subscription_id, service_state, collection_status, first_delivery_at')
        .eq('subscription_id', subscriptionId)
        .maybeSingle()
    throwIfError(error, 'load fulfillment state')
    return data
}

export async function captureStateKeys(ctx: ScenarioContext, subscriptionId: string, deliveryOrderId: string) {
    const order = await getDeliveryOrderState(ctx, deliveryOrderId)
    const fulfillment = await getFulfillmentState(ctx, subscriptionId)
    const subscriptionStatus = await getSubscriptionStatus(ctx, subscriptionId)

    return [
        `subscription:${subscriptionId}:status=${subscriptionStatus ?? 'null'}`,
        `delivery_order:${deliveryOrderId}:status=${String(order.do_status)}`,
        `delivery_order:${deliveryOrderId}:failure_reason=${String(order.failure_reason ?? 'null')}`,
        `delivery_order:${deliveryOrderId}:rescheduled_at=${String(order.rescheduled_at ?? 'null')}`,
        `delivery_order:${deliveryOrderId}:cancelled_reason=${String(order.cancelled_reason ?? 'null')}`,
        `fulfillment:${subscriptionId}:service_state=${String((fulfillment as { service_state?: string } | null)?.service_state ?? 'null')}`,
        `fulfillment:${subscriptionId}:collection_status=${String((fulfillment as { collection_status?: string } | null)?.collection_status ?? 'null')}`,
        `fulfillment:${subscriptionId}:first_delivery_at=${String((fulfillment as { first_delivery_at?: string } | null)?.first_delivery_at ?? 'null')}`,
    ]
}

export async function cleanupScenario(ctx: ScenarioContext, state: ScenarioState): Promise<string[]> {
    const supabase = createServiceRoleClient(ctx)
    const errors: string[] = []

    const webhookEventIds = [...state.cleanup.webhookEventIds]
    const invoiceProviderIds = [...state.cleanup.invoiceProviderIds]
    const subscriptionIds = [...state.cleanup.subscriptionIds]
    const userIds = [...state.cleanup.userIds]

    if (webhookEventIds.length > 0) {
        const { error } = await supabase
            .from('billing_webhook_events')
            .delete()
            .eq('provider', 'stripe')
            .in('event_id', webhookEventIds)
        if (error) errors.push(`cleanup webhook events: ${error.message}`)
    }

    if (invoiceProviderIds.length > 0) {
        const { error } = await supabase
            .from('billing_invoices')
            .delete()
            .eq('provider', 'stripe')
            .in('provider_invoice_id', invoiceProviderIds)
        if (error) errors.push(`cleanup mirrored invoices by provider_invoice_id: ${error.message}`)
    }

    if (subscriptionIds.length > 0) {
        // Clean delivery_order_events via delivery_order IDs first (before deleting delivery_orders).
        for (const subId of subscriptionIds) {
            const { data: doRows } = await supabase
                .from('delivery_orders')
                .select('id')
                .eq('subscription_id', subId)
            const doIds = (doRows ?? []).map((row) => String((row as { id: string }).id))
            if (doIds.length > 0) {
                const { error: doEventsError } = await supabase
                    .from('delivery_order_events')
                    .delete()
                    .in('delivery_order_id', doIds)
                if (doEventsError) errors.push(`cleanup delivery_order_events: ${doEventsError.message}`)
            }
        }

        const tablesBySubscriptionId = [
            'subscription_fulfillment_events',
            'billing_invoices',
            'delivery_orders',
            'subscription_items',
            'subscription_fulfillment',
        ]

        for (const table of tablesBySubscriptionId) {
            const { error } = await supabase.from(table).delete().in('subscription_id', subscriptionIds)
            if (error) errors.push(`cleanup ${table}: ${error.message}`)
        }

        const { error: webhookBySubscriptionError } = await supabase
            .from('billing_webhook_events')
            .delete()
            .in('subscription_id', subscriptionIds)
        if (webhookBySubscriptionError) errors.push(`cleanup billing_webhook_events by subscription_id: ${webhookBySubscriptionError.message}`)

        const { error: subscriptionError } = await supabase
            .from('subscriptions')
            .delete()
            .in('id', subscriptionIds)
        if (subscriptionError) errors.push(`cleanup subscriptions: ${subscriptionError.message}`)
    }

    if (userIds.length > 0) {
        const { error: billingCustomerError } = await supabase
            .from('billing_customers')
            .delete()
            .in('user_id', userIds)
        if (billingCustomerError) errors.push(`cleanup billing_customers: ${billingCustomerError.message}`)

        const { error: companyError } = await supabase
            .from('companies')
            .delete()
            .in('profile_id', userIds)
        if (companyError) errors.push(`cleanup companies: ${companyError.message}`)

        const { error: profileError } = await supabase
            .from('profiles')
            .delete()
            .in('id', userIds)
        if (profileError) errors.push(`cleanup profiles: ${profileError.message}`)

        for (const userId of userIds) {
            const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId)
            if (deleteUserError) errors.push(`cleanup auth user ${userId}: ${deleteUserError.message}`)
        }
    }

    return errors
}

export async function getFulfillmentEvents(ctx: ScenarioContext, subscriptionId: string) {
    const supabase = createServiceRoleClient(ctx)
    const { data, error } = await supabase
        .from('subscription_fulfillment_events')
        .select('id, action, from_service_state, to_service_state, from_collection_status, to_collection_status, note, actor_label, created_at')
        .eq('subscription_id', subscriptionId)
        .order('created_at', { ascending: true })
    throwIfError(error, 'load fulfillment events')
    return (data ?? []) as Array<{
        id: string
        action: string
        from_service_state: string | null
        to_service_state: string | null
        from_collection_status: string | null
        to_collection_status: string | null
        note: string | null
        actor_label: string
        created_at: string
    }>
}

export async function getDeliveryOrderEvents(ctx: ScenarioContext, deliveryOrderId: string) {
    const supabase = createServiceRoleClient(ctx)
    const { data, error } = await supabase
        .from('delivery_order_events')
        .select('id, delivery_order_id, from_status, to_status, failure_reason, rescheduled_at, cancelled_reason, actor_label, created_at')
        .eq('delivery_order_id', deliveryOrderId)
        .order('created_at', { ascending: true })
    throwIfError(error, 'load delivery order events')
    return (data ?? []) as Array<{
        id: string
        delivery_order_id: string
        from_status: string | null
        to_status: string
        failure_reason: string | null
        rescheduled_at: string | null
        cancelled_reason: string | null
        actor_label: string
        created_at: string
    }>
}

export async function getInvoiceCountBySubscription(ctx: ScenarioContext, subscriptionId: string) {
    const supabase = createServiceRoleClient(ctx)
    const { count, error } = await supabase
        .from('billing_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_id', subscriptionId)
    throwIfError(error, 'count invoices by subscription')
    return count ?? 0
}

export async function createFixture(ctx: ScenarioContext, state: ScenarioState, label: string): Promise<ScenarioFixture> {
    const user = await createScenarioUser(ctx, state, label)
    return createSubscriptionForUser(ctx, state, user.id, label)
}

export async function patchDeliveryOrder(
    ctx: ScenarioContext,
    state: ScenarioState,
    deliveryOrderId: string,
    payload: JsonValue,
) {
    return callApi(ctx, state, {
        method: 'PATCH',
        path: `/api/admin/delivery-orders/${deliveryOrderId}`,
        jsonBody: payload,
    })
}

export async function postFulfillmentAction(
    ctx: ScenarioContext,
    state: ScenarioState,
    deliveryOrderId: string,
    action: 'mark_partially_collected' | 'mark_collected_and_close',
    note?: string,
) {
    return callApi(ctx, state, {
        method: 'POST',
        path: `/api/admin/delivery-orders/${deliveryOrderId}`,
        jsonBody: {
            action,
            note: note ?? null,
        },
    })
}
