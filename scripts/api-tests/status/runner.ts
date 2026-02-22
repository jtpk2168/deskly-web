import fs from 'node:fs'
import path from 'node:path'
import { loadDotEnvIfPresent } from '../utils'
import { buildEvidence, cleanupScenario, createScenarioState, createServiceRoleClient } from './helpers'
import { STATUS_SCENARIOS } from './scenarios'
import { STATUS_LANES } from './types'
import type { RunReport, ScenarioContext, ScenarioResult, StatusLane } from './types'

function parseLane(args: string[]): StatusLane {
    const laneIndex = args.findIndex((arg) => arg === '--lane')
    const laneCandidate = laneIndex >= 0 ? args[laneIndex + 1] : null
    if (!laneCandidate) return 'local-status'

    if ((STATUS_LANES as readonly string[]).includes(laneCandidate)) {
        return laneCandidate as StatusLane
    }

    throw new Error(`Invalid lane "${laneCandidate}". Expected one of: ${STATUS_LANES.join(', ')}`)
}

function requireEnv(name: string): string {
    const value = process.env[name]?.trim()
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`)
    }
    return value
}

function printReport(report: RunReport) {
    console.log(`Lane: ${report.lane}`)
    console.log(`Total: ${report.total} | Pass: ${report.pass} | Fail: ${report.fail}`)
    console.log(`Duration: ${report.durationMs}ms`)
    console.log('')

    for (const result of report.results) {
        const statusLabel = result.status.toUpperCase()
        const reason = result.reason ? ` - ${result.reason}` : ''
        console.log(`${statusLabel} [Pack ${result.pack}] ${result.id}${reason}`)
    }
}

function writeReportFile(report: RunReport) {
    const reportPath = path.join('/tmp', `deskly-api-status-report-${report.lane}.json`)
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
    return reportPath
}

function formatConnectivityError(prefix: string, error: unknown) {
    if (!(error instanceof Error)) return `${prefix}: unknown error`
    const causeText = (() => {
        const cause = (error as Error & { cause?: unknown }).cause
        if (!cause || !(cause instanceof Error)) return null
        const code = (cause as Error & { code?: string }).code
        const host = (cause as Error & { hostname?: string }).hostname
        const detailParts = [code ?? null, host ?? null].filter(Boolean)
        return detailParts.length > 0 ? ` (${detailParts.join(' ')})` : ` (${cause.message})`
    })()
    return `${prefix}: ${error.message}${causeText ?? ''}`
}

async function preflightApi(ctx: ScenarioContext) {
    const normalizedBase = ctx.apiBaseUrl.replace(/\/$/, '')
    const healthPath = `${normalizedBase}/api/products?page=1&limit=1`

    let response: Response
    try {
        response = await fetch(healthPath, { method: 'GET' })
    } catch (error) {
        throw new Error(formatConnectivityError(`API preflight failed for ${healthPath}`, error))
    }

    if (response.status >= 500) {
        throw new Error(`API preflight failed for ${healthPath}: received HTTP ${response.status}`)
    }
}

async function preflightSupabase(ctx: ScenarioContext) {
    const supabase = createServiceRoleClient(ctx)
    try {
        const { error } = await supabase
            .from('profiles')
            .select('id')
            .limit(1)
        if (error) {
            throw new Error(error.message)
        }
    } catch (error) {
        const host = (() => {
            try {
                return new URL(ctx.supabaseUrl).hostname
            } catch {
                return ctx.supabaseUrl
            }
        })()
        throw new Error(formatConnectivityError(`Supabase preflight failed for host ${host}`, error))
    }
}

async function runScenario(ctx: ScenarioContext, scenario: (typeof STATUS_SCENARIOS)[number]): Promise<ScenarioResult> {
    const state = createScenarioState()
    const started = Date.now()
    let status: ScenarioResult['status'] = 'pass'
    let reason: string | undefined

    try {
        await scenario.run(ctx, state)
    } catch (error) {
        status = 'fail'
        reason = error instanceof Error ? error.message : 'Scenario execution failed'
    }

    const cleanupErrors = await cleanupScenario(ctx, state)
    if (cleanupErrors.length > 0) {
        const cleanupReason = `cleanup: ${cleanupErrors.join(' | ')}`
        if (status === 'pass') {
            status = 'fail'
            reason = cleanupReason
        } else {
            reason = reason ? `${reason}; ${cleanupReason}` : cleanupReason
        }
    }

    const evidence = buildEvidence(state)

    return {
        id: scenario.id,
        title: scenario.title,
        pack: scenario.pack,
        lane: ctx.lane,
        status,
        reason,
        evidence,
        durationMs: Date.now() - started,
    }
}

async function main() {
    const repoRoot = process.cwd()
    loadDotEnvIfPresent(repoRoot)

    const lane = parseLane(process.argv.slice(2))
    const apiBaseUrl = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000'
    const stripeWebhookSecret = requireEnv('STRIPE_WEBHOOK_SECRET')
    const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
    const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

    const context: ScenarioContext = {
        lane,
        repoRoot,
        runId: `status-${Date.now().toString(36)}`,
        apiBaseUrl,
        stripeWebhookSecret,
        supabaseUrl,
        supabaseServiceRoleKey,
        webhookSequence: {
            current: 0,
        },
    }

    await preflightApi(context)
    await preflightSupabase(context)

    const scenarios = STATUS_SCENARIOS.filter((scenario) => scenario.lanes.includes(lane))
    console.log(`Running Deskly status scenario packs on lane "${lane}"`)
    console.log(`API base URL: ${apiBaseUrl}`)
    console.log(`Scenarios selected: ${scenarios.length}`)
    console.log('')

    const started = Date.now()
    const results: ScenarioResult[] = []
    for (const scenario of scenarios) {
        const result = await runScenario(context, scenario)
        results.push(result)
    }

    const report: RunReport = {
        lane,
        total: results.length,
        pass: results.filter((result) => result.status === 'pass').length,
        fail: results.filter((result) => result.status === 'fail').length,
        durationMs: Date.now() - started,
        results,
    }

    printReport(report)
    const reportPath = writeReportFile(report)
    console.log('')
    console.log(`Report file: ${reportPath}`)

    if (report.fail > 0) {
        process.exitCode = 1
    }
}

void main()
