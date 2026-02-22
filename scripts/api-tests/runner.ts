import { KNOWN_GAPS } from './knownGaps'
import { API_TEST_SCENARIOS } from './scenarios'
import { TEST_LANES } from './types'
import type { Evidence, RunReport, Scenario, ScenarioResult, ScenarioRuntimeState, ScenarioStatus, ScenarioStepResult, TestLane } from './types'
import { ensurePassEvidence, loadDotEnvIfPresent, measureStep } from './utils'

function parseLaneFromArgs(args: string[]): TestLane {
    const laneIndex = args.findIndex((arg) => arg === '--lane')
    const laneValue = laneIndex >= 0 ? args[laneIndex + 1] : null
    const fallbackLane = 'local-core'

    if (!laneValue) return fallbackLane
    if ((TEST_LANES as readonly string[]).includes(laneValue)) {
        return laneValue as TestLane
    }

    throw new Error(`Invalid lane "${laneValue}". Expected one of: ${TEST_LANES.join(', ')}`)
}

function toBlockingFail(result: ScenarioResult) {
    return result.status === 'fail' && result.blocking
}

function mergeEvidencePatch(evidence: Partial<Evidence>, patch: Partial<Evidence> | undefined) {
    if (!patch) return evidence

    return {
        ...evidence,
        ...patch,
        dbBeforeAfterKeys: {
            before: patch.dbBeforeAfterKeys?.before ?? evidence.dbBeforeAfterKeys?.before ?? [],
            after: patch.dbBeforeAfterKeys?.after ?? evidence.dbBeforeAfterKeys?.after ?? [],
        },
        timingsMs: {
            ...evidence.timingsMs,
            ...patch.timingsMs,
        },
    }
}

function applyStepResult(state: ScenarioRuntimeState, result: ScenarioStepResult | void) {
    if (!result) return
    state.evidence = mergeEvidencePatch(state.evidence, result.evidencePatch)
    if (result.reason) state.reason = result.reason
}

async function runScenario(lane: TestLane, scenario: Scenario, repoRoot: string): Promise<ScenarioResult> {
    const state: ScenarioRuntimeState = {
        evidence: {},
    }

    const context = {
        lane,
        repoRoot,
        apiBaseUrl: process.env.API_BASE_URL?.trim() || null,
        stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() || null,
        stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
    }

    if (scenario.executionState === 'pending_until_gap_closed') {
        return {
            id: scenario.id,
            title: scenario.title,
            category: scenario.category,
            coverageStatus: scenario.coverageStatus,
            lane,
            status: 'skipped',
            blocking: scenario.blocking,
            reason: `Skipped until gap closure${scenario.knownGapId ? ` (${scenario.knownGapId})` : ''}.`,
        }
    }

    try {
        if (scenario.setup) {
            const { value, duration } = await measureStep(() => scenario.setup?.(context, state))
            applyStepResult(state, value)
            state.evidence = mergeEvidencePatch(state.evidence, { timingsMs: { setup: duration } })
            if (value && (value.status === 'soft_fail' || value.status === 'skipped')) {
                return {
                    id: scenario.id,
                    title: scenario.title,
                    category: scenario.category,
                    coverageStatus: scenario.coverageStatus,
                    lane,
                    status: value.status,
                    blocking: scenario.blocking,
                    reason: value.reason ?? state.reason,
                    evidence: ensurePassEvidence(state.evidence) ?? undefined,
                }
            }
        }

        const { value: runResult, duration: runDuration } = await measureStep(() => scenario.run(context, state))
        applyStepResult(state, runResult)
        state.evidence = mergeEvidencePatch(state.evidence, { timingsMs: { run: runDuration } })
        if (runResult && (runResult.status === 'soft_fail' || runResult.status === 'skipped')) {
            return {
                id: scenario.id,
                title: scenario.title,
                category: scenario.category,
                coverageStatus: scenario.coverageStatus,
                lane,
                status: runResult.status,
                blocking: scenario.blocking,
                reason: runResult.reason ?? state.reason,
                evidence: ensurePassEvidence(state.evidence) ?? undefined,
            }
        }

        if (scenario.verify) {
            const { value, duration } = await measureStep(() => scenario.verify?.(context, state))
            applyStepResult(state, value)
            state.evidence = mergeEvidencePatch(state.evidence, { timingsMs: { verify: duration } })
            if (value && (value.status === 'soft_fail' || value.status === 'skipped')) {
                return {
                    id: scenario.id,
                    title: scenario.title,
                    category: scenario.category,
                    coverageStatus: scenario.coverageStatus,
                    lane,
                    status: value.status,
                    blocking: scenario.blocking,
                    reason: value.reason ?? state.reason,
                    evidence: ensurePassEvidence(state.evidence) ?? undefined,
                }
            }
        }
    } catch (error) {
        return {
            id: scenario.id,
            title: scenario.title,
            category: scenario.category,
            coverageStatus: scenario.coverageStatus,
            lane,
            status: 'fail',
            blocking: scenario.blocking,
            reason: error instanceof Error ? error.message : 'Scenario failed',
            evidence: ensurePassEvidence(state.evidence) ?? undefined,
        }
    } finally {
        if (scenario.cleanup) {
            try {
                const { value, duration } = await measureStep(() => scenario.cleanup?.(context, state))
                applyStepResult(state, value)
                state.evidence = mergeEvidencePatch(state.evidence, { timingsMs: { cleanup: duration } })
            } catch (cleanupError) {
                const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : 'Cleanup failed'
                state.reason = state.reason ? `${state.reason}; cleanup: ${cleanupMessage}` : `cleanup: ${cleanupMessage}`
            }
        }
    }

    const evidence = ensurePassEvidence(state.evidence)
    if (!evidence) {
        return {
            id: scenario.id,
            title: scenario.title,
            category: scenario.category,
            coverageStatus: scenario.coverageStatus,
            lane,
            status: 'fail',
            blocking: scenario.blocking,
            reason: 'No scenario is considered pass unless evidence is recorded.',
        }
    }

    return {
        id: scenario.id,
        title: scenario.title,
        category: scenario.category,
        coverageStatus: scenario.coverageStatus,
        lane,
        status: 'pass',
        blocking: scenario.blocking,
        reason: state.reason,
        evidence,
    }
}

function summarize(lane: TestLane, startedAtMs: number, results: ScenarioResult[]): RunReport {
    return {
        lane,
        pass: results.filter((result) => result.status === 'pass').length,
        fail: results.filter((result) => result.status === 'fail').length,
        softFail: results.filter((result) => result.status === 'soft_fail').length,
        skipped: results.filter((result) => result.status === 'skipped').length,
        durationMs: Date.now() - startedAtMs,
        scenarioResults: results,
    }
}

function printReport(report: RunReport) {
    console.log(`Lane: ${report.lane}`)
    console.log(`Pass: ${report.pass} | Fail: ${report.fail} | Soft fail: ${report.softFail} | Skipped: ${report.skipped}`)
    console.log(`Duration: ${report.durationMs}ms`)
    console.log('')

    for (const result of report.scenarioResults) {
        const blockingTag = result.blocking ? '[blocking]' : '[non-blocking]'
        const statusLabel = result.status.toUpperCase()
        const reason = result.reason ? ` - ${result.reason}` : ''
        console.log(`${statusLabel} ${blockingTag} ${result.id} (${result.category}/${result.coverageStatus})${reason}`)
    }
}

async function main() {
    const repoRoot = process.cwd()
    loadDotEnvIfPresent(repoRoot)

    const lane = parseLaneFromArgs(process.argv.slice(2))
    const startedAtMs = Date.now()

    const scenariosForLane = API_TEST_SCENARIOS.filter((scenario) => scenario.lanes.includes(lane))
    const results: ScenarioResult[] = []

    console.log('Stripe-only policy active: no mock-provider lanes are supported.')
    console.log('local-core is a minimal Stripe-sandbox smoke subset with the fewest Stripe calls possible.')
    console.log('Retries/backoff are permitted only for Stripe network/transient failures.')
    console.log(`Known gaps loaded: ${KNOWN_GAPS.length}`)
    console.log(`Executing scenarios for lane "${lane}": ${scenariosForLane.length}`)
    console.log('')

    for (const scenario of scenariosForLane) {
        const result = await runScenario(lane, scenario, repoRoot)
        results.push(result)
    }

    const report = summarize(lane, startedAtMs, results)
    printReport(report)

    const hasBlockingFailure = results.some(toBlockingFail)
    if (hasBlockingFailure) {
        process.exitCode = 1
    }
}

void main()
