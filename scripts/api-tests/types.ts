export const TEST_LANES = ['local-core', 'local-full', 'staging-sandbox-smoke'] as const
export type TestLane = (typeof TEST_LANES)[number]

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export type AuthExpectation = 'required' | 'soft_gap'
export type ExecutionState = 'active' | 'pending_until_gap_closed'
export type ScenarioStatus = 'pass' | 'fail' | 'soft_fail' | 'skipped'
export type ScenarioCategory =
    | 'cross-cutting'
    | 'catalog'
    | 'profile'
    | 'subscription'
    | 'billing'
    | 'webhook'
    | 'admin-products'
    | 'admin-subscriptions'
    | 'admin-delivery'
    | 'admin-users'
    | 'dashboard'
    | 'invariants'
    | 'setup'

export type CoverageStatus = 'implemented' | 'placeholder' | 'pending_gap'

export type RequestSummary = {
    method: string
    url: string
    headersRedacted: Record<string, string>
}

export type ResponseSnapshot = {
    status: number
    bodyRedacted: unknown
}

export type Evidence = {
    requestSummary: RequestSummary
    responseSnapshot: ResponseSnapshot
    createdIds: string[]
    dbBeforeAfterKeys: {
        before: string[]
        after: string[]
    }
    webhookEventId?: string
    idempotencyKey?: string
    timingsMs?: {
        setup?: number
        run?: number
        verify?: number
        cleanup?: number
    }
    attempts?: number
}

export type ScenarioStepResult = {
    status?: Exclude<ScenarioStatus, 'pass' | 'fail'>
    reason?: string
    evidencePatch?: Partial<Evidence>
}

export type ScenarioRuntimeState = {
    evidence: Partial<Evidence>
    reason?: string
}

export type ScenarioContext = {
    lane: TestLane
    repoRoot: string
    apiBaseUrl: string | null
    stripeSecretKey: string | null
    stripeWebhookSecret: string | null
}

export type ScenarioStep = (ctx: ScenarioContext, state: ScenarioRuntimeState) => Promise<ScenarioStepResult | void> | ScenarioStepResult | void

export type Scenario = {
    id: string
    title: string
    category: ScenarioCategory
    coverageStatus: CoverageStatus
    v1SourceId?: string
    endpoint: string
    method: HttpMethod | 'N/A'
    lanes: TestLane[]
    authExpectation: AuthExpectation
    executionState: ExecutionState
    blocking: boolean
    knownGapId?: string
    setup?: ScenarioStep
    run: ScenarioStep
    verify?: ScenarioStep
    cleanup?: ScenarioStep
}

export type ScenarioResult = {
    id: string
    title: string
    category: ScenarioCategory
    coverageStatus: CoverageStatus
    lane: TestLane
    status: ScenarioStatus
    blocking: boolean
    reason?: string
    evidence?: Evidence
}

export type RunReport = {
    lane: TestLane
    pass: number
    fail: number
    softFail: number
    skipped: number
    durationMs: number
    scenarioResults: ScenarioResult[]
}

export type RouteManifestEntry = {
    endpoint: string
    method: HttpMethod
}
