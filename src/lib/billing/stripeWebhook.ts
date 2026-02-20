import { createHmac, timingSafeEqual } from 'node:crypto'
import { BillingStatus } from './types'

export type StripeWebhookEvent = {
    id: string
    type: string
    created?: number
    data?: {
        object?: Record<string, unknown>
    }
}

function parseStripeSignatureHeader(signatureHeader: string) {
    const entries = signatureHeader
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)

    let timestamp: number | null = null
    const v1Signatures: string[] = []

    for (const entry of entries) {
        const [rawKey, rawValue] = entry.split('=')
        const key = rawKey?.trim()
        const value = rawValue?.trim()
        if (!key || !value) continue

        if (key === 't') {
            const parsed = Number.parseInt(value, 10)
            if (Number.isFinite(parsed)) timestamp = parsed
        }
        if (key === 'v1') {
            v1Signatures.push(value)
        }
    }

    if (!timestamp || v1Signatures.length === 0) return null
    return { timestamp, v1Signatures }
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | null, secret: string, toleranceSeconds = 300) {
    if (!signatureHeader) return false
    const parsed = parseStripeSignatureHeader(signatureHeader)
    if (!parsed) return false

    const nowEpochSeconds = Math.floor(Date.now() / 1000)
    if (Math.abs(nowEpochSeconds - parsed.timestamp) > toleranceSeconds) {
        return false
    }

    const signedPayload = `${parsed.timestamp}.${payload}`
    const expectedSignature = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8')

    return parsed.v1Signatures.some((candidate) => {
        const candidateBuffer = Buffer.from(candidate, 'utf8')
        if (candidateBuffer.length !== expectedBuffer.length) return false
        return timingSafeEqual(candidateBuffer, expectedBuffer)
    })
}

export function mapStripeSubscriptionStatus(status: string | null | undefined): BillingStatus {
    if (!status) return 'pending_payment'

    switch (status) {
        case 'active':
        case 'trialing':
            return 'active'
        case 'past_due':
        case 'unpaid':
            return 'payment_failed'
        case 'incomplete':
        case 'incomplete_expired':
            return 'pending_payment'
        case 'canceled':
            return 'cancelled'
        case 'paused':
            return 'pending_payment'
        default:
            return 'pending_payment'
    }
}
