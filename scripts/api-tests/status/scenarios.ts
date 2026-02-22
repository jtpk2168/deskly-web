import {
    assert,
    callApi,
    captureStateKeys,
    createFixture,
    createScenarioUser,
    createServiceRoleClient,
    createSubscriptionForUser,
    expectStatus,
    patchDeliveryOrder,
    postFulfillmentAction,
    sendStripeWebhook,
    getDeliveryOrderState,
    getFulfillmentState,
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
]
