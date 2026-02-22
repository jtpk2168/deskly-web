import type { Evidence } from '../types'

export const STATUS_LANES = ['local-status', 'local-status-deep'] as const
export type StatusLane = (typeof STATUS_LANES)[number]

export const STATUS_PACKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
export type StatusPack = (typeof STATUS_PACKS)[number]

export type ScenarioStatus = 'pass' | 'fail'

export type ScenarioResult = {
    id: string
    title: string
    pack: StatusPack
    lane: StatusLane
    status: ScenarioStatus
    reason?: string
    evidence: Evidence
    durationMs: number
}

export type ScenarioState = {
    requestSummary?: Evidence['requestSummary']
    responseSnapshot?: Evidence['responseSnapshot']
    createdIds: Set<string>
    dbBeforeAfterKeys: {
        before: string[]
        after: string[]
    }
    webhookEventId?: string
    idempotencyKey?: string
    cleanup: {
        userIds: Set<string>
        subscriptionIds: Set<string>
        webhookEventIds: Set<string>
        invoiceProviderIds: Set<string>
    }
}

export type ScenarioContext = {
    lane: StatusLane
    repoRoot: string
    runId: string
    apiBaseUrl: string
    stripeWebhookSecret: string
    supabaseUrl: string
    supabaseServiceRoleKey: string
    webhookSequence: {
        current: number
    }
}

export type ScenarioDefinition = {
    id: string
    title: string
    pack: StatusPack
    lanes: StatusLane[]
    run: (ctx: ScenarioContext, state: ScenarioState) => Promise<void>
}

export type RunReport = {
    lane: StatusLane
    total: number
    pass: number
    fail: number
    durationMs: number
    results: ScenarioResult[]
}

export type ApiCallResult = {
    method: string
    url: string
    requestHeaders: Record<string, string>
    status: number
    body: unknown
}

export type ScenarioFixture = {
    userId: string
    subscriptionId: string
    deliveryOrderId: string
}
