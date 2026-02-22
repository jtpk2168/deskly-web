import fs from 'node:fs'
import path from 'node:path'
import type { Evidence } from './types'

export function nowMs() {
    return Date.now()
}

export async function measureStep<T>(run: () => Promise<T> | T) {
    const started = nowMs()
    const value = await run()
    const duration = nowMs() - started
    return { value, duration }
}

export function loadDotEnvIfPresent(rootDirectory: string) {
    const candidate = path.join(rootDirectory, '.env.local')
    if (!fs.existsSync(candidate)) return

    const source = fs.readFileSync(candidate, 'utf8')
    for (const rawLine of source.split('\n')) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue

        const separatorIndex = line.indexOf('=')
        if (separatorIndex <= 0) continue

        const key = line.slice(0, separatorIndex).trim()
        let value = line.slice(separatorIndex + 1).trim()

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1)
        }

        if (!(key in process.env)) {
            process.env[key] = value
        }
    }
}

export function ensurePassEvidence(evidence: Partial<Evidence>): Evidence | null {
    const requestSummary = evidence.requestSummary
    const responseSnapshot = evidence.responseSnapshot
    const createdIds = evidence.createdIds
    const dbBeforeAfterKeys = evidence.dbBeforeAfterKeys

    if (!requestSummary || !responseSnapshot || !createdIds || !dbBeforeAfterKeys) {
        return null
    }

    return {
        requestSummary,
        responseSnapshot,
        createdIds,
        dbBeforeAfterKeys,
        webhookEventId: evidence.webhookEventId,
        idempotencyKey: evidence.idempotencyKey,
        timingsMs: evidence.timingsMs,
        attempts: evidence.attempts,
    }
}

export function makePlaceholderEvidence(body: unknown): Partial<Evidence> {
    return {
        requestSummary: {
            method: 'N/A',
            url: 'internal://scenario',
            headersRedacted: {},
        },
        responseSnapshot: {
            status: 200,
            bodyRedacted: body,
        },
        createdIds: [],
        dbBeforeAfterKeys: {
            before: [],
            after: [],
        },
    }
}

