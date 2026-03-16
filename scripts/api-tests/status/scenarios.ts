import {
    assert,
    callApi,
    captureStateKeys,
    createFixture,
    createScenarioUser,
    createServiceRoleClient,
    createSubscriptionForUser,
    expectStatus,
    expectStatusOneOf,
    patchDeliveryOrder,
    postFulfillmentAction,
    sendStripeWebhook,
    getDeliveryOrderEvents,
    getDeliveryOrderState,
    getFulfillmentEvents,
    getFulfillmentState,
    getInvoiceCountBySubscription,
    getSubscriptionStatus,
} from './helpers'
import type { ApiCallResult, ScenarioContext, ScenarioDefinition, ScenarioState } from './types'

const STATUS_LANES_BASE = ['local-status', 'local-status-deep'] as const

function readErrorMessage(body: unknown) {
    if (!body || typeof body !== 'object') return null
    const errorValue = (body as Record<string, unknown>).error
    return typeof errorValue === 'string' ? errorValue : null
}

function expectErrorContains(call: ApiCallResult, fragment: string, label: string) {
    const errorMessage = readErrorMessage(call.body) ?? ''
    if (!errorMessage.toLowerCase().includes(fragment.toLowerCase())) {
        throw new Error(`${label}: expected error to include "${fragment}", got "${errorMessage || '<empty>'}"`)
    }
}

async function ensureActive(ctx: ScenarioContext, state: ScenarioState, subscriptionId: string) {
    await sendStripeWebhook(ctx, state, 'invoice.paid', subscriptionId)
    const status = await getSubscriptionStatus(ctx, subscriptionId)
    assert(status === 'active', `Expected subscription ${subscriptionId} to be active, got ${status ?? 'null'}`)
}

async function ensurePaymentFailed(ctx: ScenarioContext, state: ScenarioState, subscriptionId: string) {
    await sendStripeWebhook(ctx, state, 'invoice.payment_failed', subscriptionId)
    const status = await getSubscriptionStatus(ctx, subscriptionId)
    assert(status === 'payment_failed', `Expected subscription ${subscriptionId} to be payment_failed, got ${status ?? 'null'}`)
}

async function ensureCancelled(ctx: ScenarioContext, state: ScenarioState, subscriptionId: string) {
    await sendStripeWebhook(ctx, state, 'customer.subscription.deleted', subscriptionId)
    const status = await getSubscriptionStatus(ctx, subscriptionId)
    assert(status === 'cancelled', `Expected subscription ${subscriptionId} to be cancelled, got ${status ?? 'null'}`)
}

async function bootstrapActiveFixture(ctx: ScenarioContext, state: ScenarioState, label: string) {
    const fixture = await createFixture(ctx, state, label)
    await ensureActive(ctx, state, fixture.subscriptionId)
    return fixture
}

async function dispatchOrder(ctx: ScenarioContext, state: ScenarioState, deliveryOrderId: string) {
    const call = await patchDeliveryOrder(ctx, state, deliveryOrderId, {
        do_status: 'dispatched',
    })
    expectStatus(call, 200, 'dispatch delivery order')
    return call
}

async function failOrder(ctx: ScenarioContext, state: ScenarioState, deliveryOrderId: string, reason: string) {
    const call = await patchDeliveryOrder(ctx, state, deliveryOrderId, {
        do_status: 'failed',
        failure_reason: reason,
    })
    expectStatus(call, 200, 'fail delivery order')
    return call
}

async function rescheduleOrder(ctx: ScenarioContext, state: ScenarioState, deliveryOrderId: string, dateIso: string) {
    const call = await patchDeliveryOrder(ctx, state, deliveryOrderId, {
        do_status: 'rescheduled',
        rescheduled_at: dateIso,
    })
    expectStatus(call, 200, 'reschedule delivery order')
    return call
}

async function cancelOrder(ctx: ScenarioContext, state: ScenarioState, deliveryOrderId: string, reason: string) {
    const call = await patchDeliveryOrder(ctx, state, deliveryOrderId, {
        do_status: 'cancelled',
        cancelled_reason: reason,
    })
    expectStatus(call, 200, 'cancel delivery order')
    return call
}

async function deliverOrder(ctx: ScenarioContext, state: ScenarioState, deliveryOrderId: string) {
    const call = await patchDeliveryOrder(ctx, state, deliveryOrderId, {
        do_status: 'delivered',
    })
    expectStatus(call, 200, 'deliver delivery order')
    return call
}

async function partiallyDeliverOrder(ctx: ScenarioContext, state: ScenarioState, deliveryOrderId: string) {
    const call = await patchDeliveryOrder(ctx, state, deliveryOrderId, {
        do_status: 'partially_delivered',
    })
    expectStatus(call, 200, 'partially deliver delivery order')
    return call
}

async function setBeforeAfterForFixture(
    ctx: ScenarioContext,
    state: ScenarioState,
    fixture: { subscriptionId: string; deliveryOrderId: string },
    when: 'before' | 'after',
) {
    const keys = await captureStateKeys(ctx, fixture.subscriptionId, fixture.deliveryOrderId)
    state.dbBeforeAfterKeys[when] = keys
}

function setCombinedBeforeAfter(
    state: ScenarioState,
    before: string[],
    after: string[],
) {
    state.dbBeforeAfterKeys.before = before
    state.dbBeforeAfterKeys.after = after
}

export const STATUS_SCENARIOS: ScenarioDefinition[] = [
    {
        id: 'STATUS-A-001',
        title: 'Pack A / happy path: confirmed -> dispatched -> delivered',
        pack: 'A',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'a001')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await deliverOrder(ctx, state, fixture.deliveryOrderId)

            const order = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            const fulfillment = await getFulfillmentState(ctx, fixture.subscriptionId)
            assert(order.do_status === 'delivered', `Expected delivered status, got ${String(order.do_status)}`)
            assert(fulfillment?.service_state === 'in_service', `Expected service_state in_service, got ${String(fulfillment?.service_state ?? 'null')}`)
            assert(Boolean(fulfillment?.first_delivery_at), 'Expected first_delivery_at to be populated after delivery')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-A-002',
        title: 'Pack A / partial path: confirmed -> dispatched -> partially_delivered',
        pack: 'A',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'a002')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await partiallyDeliverOrder(ctx, state, fixture.deliveryOrderId)

            const order = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            const fulfillment = await getFulfillmentState(ctx, fixture.subscriptionId)
            assert(order.do_status === 'partially_delivered', `Expected partially_delivered, got ${String(order.do_status)}`)
            assert(Boolean(fulfillment?.first_delivery_at), 'Expected first_delivery_at to be populated after partial delivery')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-A-003',
        title: 'Pack A / multi-DO handling: independent transitions across multiple subscriptions',
        pack: 'A',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const user = await createScenarioUser(ctx, state, 'a003')
            const first = await createSubscriptionForUser(ctx, state, user.id, 'a003-s1')
            const second = await createSubscriptionForUser(ctx, state, user.id, 'a003-s2')
            await ensureActive(ctx, state, first.subscriptionId)
            await ensureActive(ctx, state, second.subscriptionId)

            const beforeFirst = await captureStateKeys(ctx, first.subscriptionId, first.deliveryOrderId)
            const beforeSecond = await captureStateKeys(ctx, second.subscriptionId, second.deliveryOrderId)
            setCombinedBeforeAfter(state, [...beforeFirst, ...beforeSecond], [])

            await dispatchOrder(ctx, state, first.deliveryOrderId)
            await dispatchOrder(ctx, state, second.deliveryOrderId)
            await deliverOrder(ctx, state, first.deliveryOrderId)

            const firstOrder = await getDeliveryOrderState(ctx, first.deliveryOrderId)
            const secondOrder = await getDeliveryOrderState(ctx, second.deliveryOrderId)
            assert(firstOrder.do_status === 'delivered', `First delivery order should be delivered, got ${String(firstOrder.do_status)}`)
            assert(secondOrder.do_status === 'dispatched', `Second delivery order should remain dispatched, got ${String(secondOrder.do_status)}`)

            const firstListCall = await callApi(ctx, state, {
                method: 'GET',
                path: `/api/admin/delivery-orders?subscription_id=${first.subscriptionId}&page=1&limit=10`,
            })
            expectStatus(firstListCall, 200, 'list first delivery order subscription')

            const secondListCall = await callApi(ctx, state, {
                method: 'GET',
                path: `/api/admin/delivery-orders?subscription_id=${second.subscriptionId}&page=1&limit=10`,
            })
            expectStatus(secondListCall, 200, 'list second delivery order subscription')

            const afterFirst = await captureStateKeys(ctx, first.subscriptionId, first.deliveryOrderId)
            const afterSecond = await captureStateKeys(ctx, second.subscriptionId, second.deliveryOrderId)
            state.dbBeforeAfterKeys.after = [...afterFirst, ...afterSecond]
        },
    },
    {
        id: 'STATUS-B-001',
        title: 'Pack B / billing blocker: pending_payment blocks dispatch',
        pack: 'B',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await createFixture(ctx, state, 'b001')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            const dispatchCall = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'dispatched',
            })
            expectStatus(dispatchCall, 409, 'dispatch while pending_payment')
            expectErrorContains(dispatchCall, 'billing status must be active', 'pending_payment blocker')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-B-002',
        title: 'Pack B / billing blocker: payment_failed blocks dispatch',
        pack: 'B',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await createFixture(ctx, state, 'b002')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await ensurePaymentFailed(ctx, state, fixture.subscriptionId)
            const dispatchCall = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'dispatched',
            })
            expectStatus(dispatchCall, 409, 'dispatch while payment_failed')
            expectErrorContains(dispatchCall, 'billing status must be active', 'payment_failed blocker')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-B-003',
        title: 'Pack B / billing blocker: cancelled blocks dispatch',
        pack: 'B',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await createFixture(ctx, state, 'b003')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await ensureCancelled(ctx, state, fixture.subscriptionId)
            const dispatchCall = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'dispatched',
            })
            expectStatus(dispatchCall, 409, 'dispatch while cancelled')
            expectErrorContains(dispatchCall, 'billing status must be active', 'cancelled blocker')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-B-004',
        title: 'Pack B / billing recovery: payment_failed to active unblocks dispatch',
        pack: 'B',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await createFixture(ctx, state, 'b004')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await ensurePaymentFailed(ctx, state, fixture.subscriptionId)
            const blockedDispatch = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, { do_status: 'dispatched' })
            expectStatus(blockedDispatch, 409, 'dispatch blocked while payment_failed')

            await ensureActive(ctx, state, fixture.subscriptionId)
            await dispatchOrder(ctx, state, fixture.deliveryOrderId)

            const finalOrder = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            const finalStatus = await getSubscriptionStatus(ctx, fixture.subscriptionId)
            assert(finalOrder.do_status === 'dispatched', `Expected dispatched after recovery, got ${String(finalOrder.do_status)}`)
            assert(finalStatus === 'active', `Expected active after recovery, got ${finalStatus ?? 'null'}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-C-001',
        title: 'Pack C / failed transition requires failure_reason',
        pack: 'C',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'c001')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')
            await dispatchOrder(ctx, state, fixture.deliveryOrderId)

            const failedWithoutReason = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'failed',
            })
            expectStatus(failedWithoutReason, 400, 'failed transition without reason')
            expectErrorContains(failedWithoutReason, 'failure_reason is required', 'failed requires reason')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-C-002',
        title: 'Pack C / rescheduled transition requires rescheduled_at',
        pack: 'C',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'c002')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')
            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await failOrder(ctx, state, fixture.deliveryOrderId, 'customer not present at site')

            const rescheduleWithoutDate = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'rescheduled',
            })
            expectStatus(rescheduleWithoutDate, 400, 'reschedule without date')
            expectErrorContains(rescheduleWithoutDate, 'rescheduled_at must be a valid datetime', 'reschedule requires date')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-C-003',
        title: 'Pack C / retry flow: failed -> rescheduled -> dispatched -> delivered',
        pack: 'C',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'c003')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await failOrder(ctx, state, fixture.deliveryOrderId, 'loading dock unavailable')
            await rescheduleOrder(ctx, state, fixture.deliveryOrderId, new Date(Date.now() + 60 * 60 * 24 * 1000).toISOString())
            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await deliverOrder(ctx, state, fixture.deliveryOrderId)

            const finalOrder = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            assert(finalOrder.do_status === 'delivered', `Expected delivered after retry flow, got ${String(finalOrder.do_status)}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-C-004',
        title: 'Pack C / multiple fail cycles with eventual partial delivery',
        pack: 'C',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'c004')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await failOrder(ctx, state, fixture.deliveryOrderId, 'access denied by security')
            await rescheduleOrder(ctx, state, fixture.deliveryOrderId, new Date(Date.now() + 60 * 60 * 24 * 1000).toISOString())
            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await failOrder(ctx, state, fixture.deliveryOrderId, 'lift unavailable')
            await rescheduleOrder(ctx, state, fixture.deliveryOrderId, new Date(Date.now() + 60 * 60 * 48 * 1000).toISOString())
            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await partiallyDeliverOrder(ctx, state, fixture.deliveryOrderId)

            const finalOrder = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            assert(finalOrder.do_status === 'partially_delivered', `Expected partially_delivered after multiple cycles, got ${String(finalOrder.do_status)}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-D-001',
        title: 'Pack D / cancellation before dispatch from confirmed',
        pack: 'D',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'd001')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await cancelOrder(ctx, state, fixture.deliveryOrderId, 'customer cancelled before dispatch')
            const order = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            assert(order.do_status === 'cancelled', `Expected cancelled from confirmed, got ${String(order.do_status)}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-D-002',
        title: 'Pack D / cancellation from failed',
        pack: 'D',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'd002')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await failOrder(ctx, state, fixture.deliveryOrderId, 'damaged access gate')
            await cancelOrder(ctx, state, fixture.deliveryOrderId, 'customer requested cancellation after failed attempt')

            const order = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            assert(order.do_status === 'cancelled', `Expected cancelled from failed, got ${String(order.do_status)}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-D-003',
        title: 'Pack D / cancellation from rescheduled',
        pack: 'D',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'd003')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await failOrder(ctx, state, fixture.deliveryOrderId, 'customer requested later slot')
            await rescheduleOrder(ctx, state, fixture.deliveryOrderId, new Date(Date.now() + 60 * 60 * 24 * 1000).toISOString())
            await cancelOrder(ctx, state, fixture.deliveryOrderId, 'customer cancelled rescheduled delivery')

            const order = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            assert(order.do_status === 'cancelled', `Expected cancelled from rescheduled, got ${String(order.do_status)}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-D-004',
        title: 'Pack D / terminal state lock: delivered cannot transition to cancelled',
        pack: 'D',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'd004')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await deliverOrder(ctx, state, fixture.deliveryOrderId)

            const invalidCancel = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'cancelled',
                cancelled_reason: 'too late cancellation',
            })
            expectStatus(invalidCancel, 409, 'cancel after delivered should be locked')
            expectErrorContains(invalidCancel, 'Invalid transition', 'terminal lock check')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-E-001',
        title: 'Pack E / fulfillment blocker: offboarding_requested blocks dispatch',
        pack: 'E',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'e001')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await ensureCancelled(ctx, state, fixture.subscriptionId)
            await ensureActive(ctx, state, fixture.subscriptionId)

            const blockedDispatch = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'dispatched',
            })
            expectStatus(blockedDispatch, 409, 'dispatch while offboarding_requested')
            expectErrorContains(blockedDispatch, 'service state offboarding_requested', 'offboarding dispatch blocker')

            const fulfillment = await getFulfillmentState(ctx, fixture.subscriptionId)
            assert(fulfillment?.service_state === 'offboarding_requested', `Expected offboarding_requested, got ${String(fulfillment?.service_state ?? 'null')}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-E-002',
        title: 'Pack E / fulfillment blocker: closed blocks dispatch',
        pack: 'E',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'e002')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await ensureCancelled(ctx, state, fixture.subscriptionId)
            const closeCall = await postFulfillmentAction(ctx, state, fixture.deliveryOrderId, 'mark_collected_and_close', 'items collected and contract closed')
            expectStatus(closeCall, 200, 'close fulfillment state')
            await ensureActive(ctx, state, fixture.subscriptionId)

            const blockedDispatch = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'dispatched',
            })
            expectStatus(blockedDispatch, 409, 'dispatch while closed')
            expectErrorContains(blockedDispatch, 'service state closed', 'closed dispatch blocker')

            const fulfillment = await getFulfillmentState(ctx, fixture.subscriptionId)
            assert(fulfillment?.service_state === 'closed', `Expected closed, got ${String(fulfillment?.service_state ?? 'null')}`)
            assert(fulfillment?.collection_status === 'collected', `Expected collection_status collected, got ${String(fulfillment?.collection_status ?? 'null')}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-E-003',
        title: 'Pack E / delivered must not overwrite offboarding_requested or closed service_state',
        pack: 'E',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const offboardingFixture = await bootstrapActiveFixture(ctx, state, 'e003-offboarding')
            const closedFixture = await bootstrapActiveFixture(ctx, state, 'e003-closed')

            const beforeOffboarding = await captureStateKeys(ctx, offboardingFixture.subscriptionId, offboardingFixture.deliveryOrderId)
            const beforeClosed = await captureStateKeys(ctx, closedFixture.subscriptionId, closedFixture.deliveryOrderId)
            setCombinedBeforeAfter(state, [...beforeOffboarding, ...beforeClosed], [])

            await dispatchOrder(ctx, state, offboardingFixture.deliveryOrderId)
            await ensureCancelled(ctx, state, offboardingFixture.subscriptionId)
            await deliverOrder(ctx, state, offboardingFixture.deliveryOrderId)
            const offboardingFulfillment = await getFulfillmentState(ctx, offboardingFixture.subscriptionId)
            assert(offboardingFulfillment?.service_state === 'offboarding_requested', `Expected offboarding_requested to persist, got ${String(offboardingFulfillment?.service_state ?? 'null')}`)

            await dispatchOrder(ctx, state, closedFixture.deliveryOrderId)
            await ensureCancelled(ctx, state, closedFixture.subscriptionId)
            const closeCall = await postFulfillmentAction(ctx, state, closedFixture.deliveryOrderId, 'mark_collected_and_close', 'close before final completion')
            expectStatus(closeCall, 200, 'close fulfillment before delivery')
            await deliverOrder(ctx, state, closedFixture.deliveryOrderId)
            const closedFulfillment = await getFulfillmentState(ctx, closedFixture.subscriptionId)
            assert(closedFulfillment?.service_state === 'closed', `Expected closed to persist, got ${String(closedFulfillment?.service_state ?? 'null')}`)

            const afterOffboarding = await captureStateKeys(ctx, offboardingFixture.subscriptionId, offboardingFixture.deliveryOrderId)
            const afterClosed = await captureStateKeys(ctx, closedFixture.subscriptionId, closedFixture.deliveryOrderId)
            state.dbBeforeAfterKeys.after = [...afterOffboarding, ...afterClosed]
        },
    },
    {
        id: 'STATUS-F-001',
        title: 'Pack F / invariant: delivery_orders must not contain orphan subscription references',
        pack: 'F',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const listCall = await callApi(ctx, state, {
                method: 'GET',
                path: '/api/admin/delivery-orders?page=1&limit=5',
            })
            expectStatus(listCall, 200, 'list delivery orders for invariant check')

            const supabase = createServiceRoleClient(ctx)
            const { data: orders, error: ordersError } = await supabase
                .from('delivery_orders')
                .select('id, subscription_id')
            if (ordersError) throw new Error(`load delivery_orders for orphan check: ${ordersError.message}`)

            const orderRows = (orders ?? []) as Array<{ id: string; subscription_id: string }>
            const subscriptionIds = [...new Set(orderRows.map((row) => row.subscription_id))]

            let subscriptionSet = new Set<string>()
            if (subscriptionIds.length > 0) {
                const { data: subscriptions, error: subscriptionsError } = await supabase
                    .from('subscriptions')
                    .select('id')
                    .in('id', subscriptionIds)
                if (subscriptionsError) throw new Error(`load subscriptions for orphan check: ${subscriptionsError.message}`)
                subscriptionSet = new Set((subscriptions ?? []).map((row) => String((row as { id: string }).id)))
            }

            const orphanIds = orderRows
                .filter((row) => !subscriptionSet.has(row.subscription_id))
                .map((row) => row.id)

            state.dbBeforeAfterKeys.before = [
                `delivery_orders_count=${orderRows.length}`,
                `candidate_subscriptions=${subscriptionIds.length}`,
            ]
            state.dbBeforeAfterKeys.after = [
                `orphan_delivery_orders=${orphanIds.length}`,
                ...orphanIds.map((id) => `orphan_delivery_order_id=${id}`),
            ]
            assert(orphanIds.length === 0, `Found orphan delivery_orders: ${orphanIds.join(', ')}`)
        },
    },
    {
        id: 'STATUS-F-002',
        title: 'Pack F / invariant: first_delivery_at is immutable after initial delivery',
        pack: 'F',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'f002')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await partiallyDeliverOrder(ctx, state, fixture.deliveryOrderId)
            const firstFulfillment = await getFulfillmentState(ctx, fixture.subscriptionId)
            const firstDeliveryAt = firstFulfillment?.first_delivery_at ?? null
            assert(Boolean(firstDeliveryAt), 'Expected first_delivery_at to be set after first partial delivery')

            const idempotentRepeat = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'partially_delivered',
            })
            expectStatus(idempotentRepeat, 200, 'repeat partial delivery for immutability check')

            const secondFulfillment = await getFulfillmentState(ctx, fixture.subscriptionId)
            assert(secondFulfillment?.first_delivery_at === firstDeliveryAt, 'Expected first_delivery_at to remain unchanged on repeat delivery status')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-F-003',
        title: 'Pack F / invariant: invalid status and illegal transitions are rejected',
        pack: 'F',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'f003')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            const invalidStatus = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'unknown_transition',
            })
            expectStatus(invalidStatus, 400, 'invalid do_status rejection')
            expectErrorContains(invalidStatus, 'Invalid do_status', 'invalid do_status')

            const illegalTransition = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'delivered',
            })
            expectStatus(illegalTransition, 409, 'illegal transition rejection')
            expectErrorContains(illegalTransition, 'Invalid transition', 'illegal transition')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-G-001',
        title: 'Pack G / race: double PATCH retry with same payload stays consistent',
        pack: 'G',
        lanes: ['local-status-deep'],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'g001')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')
            await dispatchOrder(ctx, state, fixture.deliveryOrderId)

            const [attemptOne, attemptTwo] = await Promise.all([
                patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                    do_status: 'failed',
                    failure_reason: 'transient route overlap',
                }),
                patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                    do_status: 'failed',
                    failure_reason: 'transient route overlap',
                }),
            ])

            expectStatus(attemptOne, 200, 'double retry attempt one')
            expectStatus(attemptTwo, 200, 'double retry attempt two')

            const finalOrder = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            assert(finalOrder.do_status === 'failed', `Expected final failed status after double retry, got ${String(finalOrder.do_status)}`)
            assert(typeof finalOrder.failure_reason === 'string' && finalOrder.failure_reason.length > 0, 'Expected persisted failure_reason after double retry')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-G-002',
        title: 'Pack G / race: concurrent conflicting transitions should not both commit',
        pack: 'G',
        lanes: ['local-status-deep'],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'g002')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')
            await dispatchOrder(ctx, state, fixture.deliveryOrderId)

            const [failedAttempt, deliveredAttempt] = await Promise.all([
                patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                    do_status: 'failed',
                    failure_reason: 'address gate inaccessible',
                }),
                patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                    do_status: 'delivered',
                }),
            ])

            const statuses = [failedAttempt.status, deliveredAttempt.status]
            const successCount = statuses.filter((status) => status === 200).length
            const conflictCount = statuses.filter((status) => status === 409).length
            assert(
                successCount === 1 && conflictCount === 1,
                `Expected one success and one 409 in conflicting race, got [${statuses.join(', ')}]`,
            )

            const finalOrder = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            assert(
                finalOrder.do_status === 'failed' || finalOrder.do_status === 'delivered',
                `Expected terminal race outcome to be failed or delivered, got ${String(finalOrder.do_status)}`,
            )

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Pack H: Subscription billing lifecycle transitions
    // ──────────────────────────────────────────────────────────────────────────

    {
        id: 'STATUS-H-001',
        title: 'Pack H / billing lifecycle: invoice.paid transitions subscription to active',
        pack: 'H',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await createFixture(ctx, state, 'h001')

            const statusBefore = await getSubscriptionStatus(ctx, fixture.subscriptionId)
            state.dbBeforeAfterKeys.before = [
                `subscription:${fixture.subscriptionId}:status=${statusBefore ?? 'null'}`,
            ]

            await sendStripeWebhook(ctx, state, 'invoice.paid', fixture.subscriptionId)

            const statusAfter = await getSubscriptionStatus(ctx, fixture.subscriptionId)
            assert(statusAfter === 'active', `Expected active after invoice.paid, got ${statusAfter ?? 'null'}`)

            state.dbBeforeAfterKeys.after = [
                `subscription:${fixture.subscriptionId}:status=${statusAfter ?? 'null'}`,
            ]
        },
    },
    {
        id: 'STATUS-H-002',
        title: 'Pack H / billing lifecycle: invoice.payment_failed transitions active to payment_failed',
        pack: 'H',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await createFixture(ctx, state, 'h002')
            await ensureActive(ctx, state, fixture.subscriptionId)

            state.dbBeforeAfterKeys.before = [
                `subscription:${fixture.subscriptionId}:status=active`,
            ]

            await sendStripeWebhook(ctx, state, 'invoice.payment_failed', fixture.subscriptionId)

            const statusAfter = await getSubscriptionStatus(ctx, fixture.subscriptionId)
            assert(statusAfter === 'payment_failed', `Expected payment_failed after invoice.payment_failed, got ${statusAfter ?? 'null'}`)

            state.dbBeforeAfterKeys.after = [
                `subscription:${fixture.subscriptionId}:status=${statusAfter ?? 'null'}`,
            ]
        },
    },
    {
        id: 'STATUS-H-003',
        title: 'Pack H / billing lifecycle: payment_failed recovers to active via invoice.paid',
        pack: 'H',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await createFixture(ctx, state, 'h003')
            await ensureActive(ctx, state, fixture.subscriptionId)
            await ensurePaymentFailed(ctx, state, fixture.subscriptionId)

            state.dbBeforeAfterKeys.before = [
                `subscription:${fixture.subscriptionId}:status=payment_failed`,
            ]

            await sendStripeWebhook(ctx, state, 'invoice.paid', fixture.subscriptionId)

            const statusAfter = await getSubscriptionStatus(ctx, fixture.subscriptionId)
            assert(statusAfter === 'active', `Expected active after recovery via invoice.paid, got ${statusAfter ?? 'null'}`)

            state.dbBeforeAfterKeys.after = [
                `subscription:${fixture.subscriptionId}:status=${statusAfter ?? 'null'}`,
            ]
        },
    },
    {
        id: 'STATUS-H-004',
        title: 'Pack H / billing lifecycle: customer.subscription.deleted transitions to cancelled and sets offboarding',
        pack: 'H',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await createFixture(ctx, state, 'h004')
            await ensureActive(ctx, state, fixture.subscriptionId)

            state.dbBeforeAfterKeys.before = [
                `subscription:${fixture.subscriptionId}:status=active`,
            ]

            await sendStripeWebhook(ctx, state, 'customer.subscription.deleted', fixture.subscriptionId)

            const statusAfter = await getSubscriptionStatus(ctx, fixture.subscriptionId)
            assert(statusAfter === 'cancelled', `Expected cancelled after subscription.deleted, got ${statusAfter ?? 'null'}`)

            state.dbBeforeAfterKeys.after = [
                `subscription:${fixture.subscriptionId}:status=${statusAfter ?? 'null'}`,
            ]
        },
    },
    {
        id: 'STATUS-H-005',
        title: 'Pack H / billing lifecycle: customer.subscription.updated with past_due sets payment_failed',
        pack: 'H',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await createFixture(ctx, state, 'h005')
            await ensureActive(ctx, state, fixture.subscriptionId)

            state.dbBeforeAfterKeys.before = [
                `subscription:${fixture.subscriptionId}:status=active`,
            ]

            await sendStripeWebhook(ctx, state, 'customer.subscription.updated', fixture.subscriptionId, {
                subscriptionStatus: 'past_due',
            })

            const statusAfter = await getSubscriptionStatus(ctx, fixture.subscriptionId)
            assert(statusAfter === 'payment_failed', `Expected payment_failed after subscription.updated with past_due, got ${statusAfter ?? 'null'}`)

            state.dbBeforeAfterKeys.after = [
                `subscription:${fixture.subscriptionId}:status=${statusAfter ?? 'null'}`,
            ]
        },
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Pack I: Fulfillment collection lifecycle
    // ──────────────────────────────────────────────────────────────────────────

    {
        id: 'STATUS-I-001',
        title: 'Pack I / collection lifecycle: offboarding -> partial collection -> close',
        pack: 'I',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'i001')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            // Deliver first so fulfillment row exists with in_service
            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await deliverOrder(ctx, state, fixture.deliveryOrderId)

            // Cancel subscription to trigger offboarding_requested
            await ensureCancelled(ctx, state, fixture.subscriptionId)

            const afterCancel = await getFulfillmentState(ctx, fixture.subscriptionId)
            assert(afterCancel?.service_state === 'offboarding_requested', `Expected offboarding_requested after cancel, got ${String(afterCancel?.service_state ?? 'null')}`)

            // Mark partially collected
            const partialCall = await postFulfillmentAction(ctx, state, fixture.deliveryOrderId, 'mark_partially_collected')
            expectStatus(partialCall, 200, 'mark partially collected')

            const afterPartial = await getFulfillmentState(ctx, fixture.subscriptionId)
            assert(afterPartial?.collection_status === 'partially_collected', `Expected partially_collected, got ${String(afterPartial?.collection_status ?? 'null')}`)
            assert(afterPartial?.service_state === 'offboarding_requested', `Expected service_state to remain offboarding_requested, got ${String(afterPartial?.service_state ?? 'null')}`)

            // Mark collected and close
            const closeCall = await postFulfillmentAction(ctx, state, fixture.deliveryOrderId, 'mark_collected_and_close', 'all items returned and verified')
            expectStatus(closeCall, 200, 'mark collected and close')

            const finalFulfillment = await getFulfillmentState(ctx, fixture.subscriptionId)
            assert(finalFulfillment?.service_state === 'closed', `Expected closed, got ${String(finalFulfillment?.service_state ?? 'null')}`)
            assert(finalFulfillment?.collection_status === 'collected', `Expected collected, got ${String(finalFulfillment?.collection_status ?? 'null')}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-I-002',
        title: 'Pack I / collection validation: mark_collected_and_close without note returns 400',
        pack: 'I',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'i002')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await deliverOrder(ctx, state, fixture.deliveryOrderId)
            await ensureCancelled(ctx, state, fixture.subscriptionId)

            // Attempt close without note via raw API call
            const closeWithoutNote = await callApi(ctx, state, {
                method: 'POST',
                path: `/api/admin/delivery-orders/${fixture.deliveryOrderId}`,
                jsonBody: { action: 'mark_collected_and_close' },
            })
            expectStatus(closeWithoutNote, 400, 'close without note should be rejected')
            expectErrorContains(closeWithoutNote, 'note is required', 'close requires note')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-I-003',
        title: 'Pack I / collection validation: mark_partially_collected rejected when not offboarding',
        pack: 'I',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'i003')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await deliverOrder(ctx, state, fixture.deliveryOrderId)

            // service_state is in_service — mark_partially_collected should fail
            const partialCall = await postFulfillmentAction(ctx, state, fixture.deliveryOrderId, 'mark_partially_collected')
            expectStatus(partialCall, 409, 'partial collection from in_service should be rejected')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-I-004',
        title: 'Pack I / collection audit trail: fulfillment events recorded correctly',
        pack: 'I',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'i004')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await deliverOrder(ctx, state, fixture.deliveryOrderId)
            await ensureCancelled(ctx, state, fixture.subscriptionId)

            await postFulfillmentAction(ctx, state, fixture.deliveryOrderId, 'mark_partially_collected')
            await postFulfillmentAction(ctx, state, fixture.deliveryOrderId, 'mark_collected_and_close', 'final collection verified')

            const events = await getFulfillmentEvents(ctx, fixture.subscriptionId)
            assert(events.length >= 2, `Expected at least 2 fulfillment events, got ${events.length}`)

            const partialEvent = events.find((e) => e.action === 'mark_partially_collected')
            assert(partialEvent, 'Expected mark_partially_collected event in audit trail')
            assert(partialEvent?.from_collection_status === 'not_collected', `Expected from_collection_status=not_collected, got ${String(partialEvent?.from_collection_status)}`)
            assert(partialEvent?.to_collection_status === 'partially_collected', `Expected to_collection_status=partially_collected, got ${String(partialEvent?.to_collection_status)}`)

            const closeEvent = events.find((e) => e.action === 'mark_collected_and_close')
            assert(closeEvent, 'Expected mark_collected_and_close event in audit trail')
            assert(closeEvent?.to_service_state === 'closed', `Expected to_service_state=closed, got ${String(closeEvent?.to_service_state)}`)
            assert(closeEvent?.to_collection_status === 'collected', `Expected to_collection_status=collected, got ${String(closeEvent?.to_collection_status)}`)
            assert(closeEvent?.note === 'final collection verified', `Expected note to match, got ${String(closeEvent?.note)}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Pack J: Webhook edge cases
    // ──────────────────────────────────────────────────────────────────────────

    {
        id: 'STATUS-J-001',
        title: 'Pack J / webhook idempotency: duplicate event returns duplicate=true',
        pack: 'J',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await createFixture(ctx, state, 'j001')

            state.dbBeforeAfterKeys.before = [
                `subscription:${fixture.subscriptionId}:pre_webhook`,
            ]

            // First webhook call
            const firstResult = await sendStripeWebhook(ctx, state, 'invoice.paid', fixture.subscriptionId)
            expectStatus(firstResult.call, 200, 'first webhook dispatch')

            // Re-send the exact same event by using the same event ID
            // We need to manually construct this since sendStripeWebhook generates a new ID
            const { createHmac } = await import('node:crypto')
            const nowEpoch = Math.floor(Date.now() / 1000)
            const duplicatePayload = JSON.stringify({
                id: firstResult.eventId,
                type: 'invoice.paid',
                created: nowEpoch,
                data: {
                    object: {
                        id: `in_dup_${ctx.runId}`,
                        metadata: { internal_subscription_id: fixture.subscriptionId },
                        subscription: `sub_dup_${ctx.runId}`,
                        customer: `cus_dup_${ctx.runId}`,
                        status: 'paid',
                        paid: true,
                        currency: 'myr',
                        subtotal: 10000,
                        total: 10800,
                        amount_paid: 10800,
                        amount_due: 0,
                        period_start: nowEpoch,
                        period_end: nowEpoch + 60 * 60 * 24 * 30,
                        status_transitions: { paid_at: nowEpoch },
                    },
                },
            })
            const signedPayload = `${nowEpoch}.${duplicatePayload}`
            const digest = createHmac('sha256', ctx.stripeWebhookSecret).update(signedPayload, 'utf8').digest('hex')
            const signature = `t=${nowEpoch},v1=${digest}`

            const duplicateCall = await callApi(ctx, state, {
                method: 'POST',
                path: '/api/webhooks/stripe',
                rawBody: duplicatePayload,
                headers: {
                    'Content-Type': 'application/json',
                    'stripe-signature': signature,
                },
            })
            expectStatus(duplicateCall, 200, 'duplicate webhook should still return 200')

            const duplicateBody = duplicateCall.body as Record<string, unknown> | null
            const dataField = duplicateBody?.data as Record<string, unknown> | undefined
            assert(dataField?.duplicate === true, `Expected duplicate=true in response, got ${JSON.stringify(dataField)}`)

            state.dbBeforeAfterKeys.after = [
                `subscription:${fixture.subscriptionId}:duplicate_webhook_handled`,
            ]
        },
    },
    {
        id: 'STATUS-J-002',
        title: 'Pack J / webhook validation: invalid signature returns 400',
        pack: 'J',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await createFixture(ctx, state, 'j002')

            state.dbBeforeAfterKeys.before = [
                `subscription:${fixture.subscriptionId}:pre_bad_signature`,
            ]

            const payload = JSON.stringify({
                id: `evt_bad_sig_${ctx.runId}`,
                type: 'invoice.paid',
                created: Math.floor(Date.now() / 1000),
                data: {
                    object: {
                        id: `in_bad_${ctx.runId}`,
                        metadata: { internal_subscription_id: fixture.subscriptionId },
                        status: 'paid',
                        paid: true,
                    },
                },
            })

            const badSignatureCall = await callApi(ctx, state, {
                method: 'POST',
                path: '/api/webhooks/stripe',
                rawBody: payload,
                headers: {
                    'Content-Type': 'application/json',
                    'stripe-signature': 't=1234567890,v1=invalidsignaturehash',
                },
            })
            expectStatus(badSignatureCall, 400, 'invalid signature should return 400')

            state.dbBeforeAfterKeys.after = [
                `subscription:${fixture.subscriptionId}:bad_signature_rejected`,
            ]
        },
    },
    {
        id: 'STATUS-J-003',
        title: 'Pack J / field validation: empty/whitespace failure_reason returns 400',
        pack: 'J',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'j003')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')
            await dispatchOrder(ctx, state, fixture.deliveryOrderId)

            const whitespaceReason = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'failed',
                failure_reason: '   ',
            })
            expectStatus(whitespaceReason, 400, 'whitespace-only failure_reason should be rejected')
            expectErrorContains(whitespaceReason, 'failure_reason is required', 'whitespace failure_reason validation')

            const emptyReason = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'failed',
                failure_reason: '',
            })
            expectStatus(emptyReason, 400, 'empty failure_reason should be rejected')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Pack K: Field clearing and edge cases
    // ──────────────────────────────────────────────────────────────────────────

    {
        id: 'STATUS-K-001',
        title: 'Pack K / field clearing: conditional fields are nulled on transition away',
        pack: 'K',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'k001')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await failOrder(ctx, state, fixture.deliveryOrderId, 'building access issue')

            // Verify failure_reason is set
            const afterFailed = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            assert(afterFailed.failure_reason === 'building access issue', `Expected failure_reason set, got ${String(afterFailed.failure_reason)}`)

            await rescheduleOrder(ctx, state, fixture.deliveryOrderId, new Date(Date.now() + 60 * 60 * 24 * 1000).toISOString())

            // After rescheduled, failure_reason should be cleared
            const afterRescheduled = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            assert(afterRescheduled.failure_reason === null, `Expected failure_reason null after reschedule, got ${String(afterRescheduled.failure_reason)}`)
            assert(afterRescheduled.rescheduled_at !== null, 'Expected rescheduled_at to be set')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)

            // After dispatched, rescheduled_at should be cleared
            const afterDispatched = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            assert(afterDispatched.rescheduled_at === null, `Expected rescheduled_at null after dispatch, got ${String(afterDispatched.rescheduled_at)}`)
            assert(afterDispatched.failure_reason === null, `Expected failure_reason still null, got ${String(afterDispatched.failure_reason)}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-K-002',
        title: 'Pack K / edge case: cancelled_reason cleared after cancel persists correctly',
        pack: 'K',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'k002')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await cancelOrder(ctx, state, fixture.deliveryOrderId, 'customer changed their mind')

            const afterCancel = await getDeliveryOrderState(ctx, fixture.deliveryOrderId)
            assert(afterCancel.do_status === 'cancelled', `Expected cancelled, got ${String(afterCancel.do_status)}`)
            assert(afterCancel.cancelled_reason === 'customer changed their mind', `Expected cancelled_reason, got ${String(afterCancel.cancelled_reason)}`)
            assert(afterCancel.failure_reason === null, `Expected failure_reason null in cancelled state, got ${String(afterCancel.failure_reason)}`)
            assert(afterCancel.rescheduled_at === null, `Expected rescheduled_at null in cancelled state, got ${String(afterCancel.rescheduled_at)}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-K-003',
        title: 'Pack K / locked fields: PATCH with service_state or collection_status returns 400',
        pack: 'K',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'k003')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            const serviceStateEdit = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'dispatched',
                service_state: 'closed',
            })
            expectStatus(serviceStateEdit, 400, 'service_state in PATCH should be rejected')
            expectErrorContains(serviceStateEdit, 'managed by admin actions', 'locked field guard')

            const collectionStatusEdit = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'dispatched',
                collection_status: 'collected',
            })
            expectStatus(collectionStatusEdit, 400, 'collection_status in PATCH should be rejected')
            expectErrorContains(collectionStatusEdit, 'managed by admin actions', 'locked field guard')

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Pack L: Delivery order audit trail
    // ──────────────────────────────────────────────────────────────────────────

    {
        id: 'STATUS-L-001',
        title: 'Pack L / audit trail: happy path transitions are logged',
        pack: 'L',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'l001')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await deliverOrder(ctx, state, fixture.deliveryOrderId)

            const events = await getDeliveryOrderEvents(ctx, fixture.deliveryOrderId)
            assert(events.length === 2, `Expected 2 DO events, got ${events.length}`)

            assert(events[0]?.from_status === 'confirmed', `Expected first event from_status=confirmed, got ${String(events[0]?.from_status)}`)
            assert(events[0]?.to_status === 'dispatched', `Expected first event to_status=dispatched, got ${String(events[0]?.to_status)}`)

            assert(events[1]?.from_status === 'dispatched', `Expected second event from_status=dispatched, got ${String(events[1]?.from_status)}`)
            assert(events[1]?.to_status === 'delivered', `Expected second event to_status=delivered, got ${String(events[1]?.to_status)}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-L-002',
        title: 'Pack L / audit trail: failure and cancel reasons are captured in events',
        pack: 'L',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'l002')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)
            await failOrder(ctx, state, fixture.deliveryOrderId, 'gate locked')
            await cancelOrder(ctx, state, fixture.deliveryOrderId, 'customer gave up')

            const events = await getDeliveryOrderEvents(ctx, fixture.deliveryOrderId)
            assert(events.length === 3, `Expected 3 DO events, got ${events.length}`)

            const failEvent = events.find((e) => e.to_status === 'failed')
            assert(failEvent, 'Expected a failed event in audit trail')
            assert(failEvent?.failure_reason === 'gate locked', `Expected failure_reason in event, got ${String(failEvent?.failure_reason)}`)

            const cancelEvent = events.find((e) => e.to_status === 'cancelled')
            assert(cancelEvent, 'Expected a cancelled event in audit trail')
            assert(cancelEvent?.cancelled_reason === 'customer gave up', `Expected cancelled_reason in event, got ${String(cancelEvent?.cancelled_reason)}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },
    {
        id: 'STATUS-L-003',
        title: 'Pack L / audit trail: idempotent same-status PATCH does not create event',
        pack: 'L',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await bootstrapActiveFixture(ctx, state, 'l003')
            await setBeforeAfterForFixture(ctx, state, fixture, 'before')

            await dispatchOrder(ctx, state, fixture.deliveryOrderId)

            // Send the same status again (idempotent path)
            const idempotentCall = await patchDeliveryOrder(ctx, state, fixture.deliveryOrderId, {
                do_status: 'dispatched',
            })
            expectStatus(idempotentCall, 200, 'idempotent same-status should succeed')

            const events = await getDeliveryOrderEvents(ctx, fixture.deliveryOrderId)
            // Only the first dispatch should be logged, not the repeat
            assert(events.length === 1, `Expected exactly 1 DO event (no duplicate), got ${events.length}`)
            assert(events[0]?.to_status === 'dispatched', `Expected to_status=dispatched, got ${String(events[0]?.to_status)}`)

            await setBeforeAfterForFixture(ctx, state, fixture, 'after')
        },
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Pack M: Webhook ordering guard
    // ──────────────────────────────────────────────────────────────────────────

    {
        id: 'STATUS-M-001',
        title: 'Pack M / webhook ordering: out-of-order event does not regress billing status',
        pack: 'M',
        lanes: [...STATUS_LANES_BASE],
        run: async (ctx, state) => {
            const fixture = await createFixture(ctx, state, 'm001')

            state.dbBeforeAfterKeys.before = [
                `subscription:${fixture.subscriptionId}:pre_ordering_test`,
            ]

            // Step 1: Send a recent invoice.paid → active
            await sendStripeWebhook(ctx, state, 'invoice.paid', fixture.subscriptionId)
            const afterPaid = await getSubscriptionStatus(ctx, fixture.subscriptionId)
            assert(afterPaid === 'active', `Expected active after invoice.paid, got ${afterPaid ?? 'null'}`)

            // Step 2: Send a STALE invoice.payment_failed with an older timestamp.
            // We forge a webhook with created=1 (epoch 1970) to simulate an old event.
            const { createHmac } = await import('node:crypto')
            const staleEpoch = 1 // 1970-01-01 — definitely older than the invoice.paid above
            const nowEpoch = Math.floor(Date.now() / 1000)
            ctx.webhookSequence.current += 1
            const seq = ctx.webhookSequence.current
            const staleEventId = `evt_stale_${ctx.runId}_${seq}`
            const stalePayload = JSON.stringify({
                id: staleEventId,
                type: 'invoice.payment_failed',
                created: staleEpoch,
                data: {
                    object: {
                        id: `in_stale_${ctx.runId}_${seq}`,
                        metadata: { internal_subscription_id: fixture.subscriptionId },
                        subscription: `sub_stale_${ctx.runId}_${seq}`,
                        customer: `cus_stale_${ctx.runId}_${seq}`,
                        status: 'open',
                        paid: false,
                        currency: 'myr',
                        subtotal: 10000,
                        total: 10800,
                        amount_paid: 0,
                        amount_due: 10800,
                        period_start: staleEpoch,
                        period_end: staleEpoch + 60 * 60 * 24 * 30,
                        status_transitions: { paid_at: null },
                    },
                },
            })
            const signedPayload = `${nowEpoch}.${stalePayload}`
            const digest = createHmac('sha256', ctx.stripeWebhookSecret).update(signedPayload, 'utf8').digest('hex')
            const signature = `t=${nowEpoch},v1=${digest}`

            const staleCall = await callApi(ctx, state, {
                method: 'POST',
                path: '/api/webhooks/stripe',
                rawBody: stalePayload,
                headers: {
                    'Content-Type': 'application/json',
                    'stripe-signature': signature,
                },
            })
            expectStatus(staleCall, 200, 'stale webhook should be accepted (200) but not applied')

            state.cleanup.webhookEventIds.add(staleEventId)
            state.cleanup.invoiceProviderIds.add(`in_stale_${ctx.runId}_${seq}`)

            // Step 3: Verify status is still active — the stale event should not have regressed it
            const finalStatus = await getSubscriptionStatus(ctx, fixture.subscriptionId)
            assert(finalStatus === 'active', `Expected status to remain active after stale event, got ${finalStatus ?? 'null'}`)

            state.dbBeforeAfterKeys.after = [
                `subscription:${fixture.subscriptionId}:ordering_guard_held`,
            ]
        },
    },
]
