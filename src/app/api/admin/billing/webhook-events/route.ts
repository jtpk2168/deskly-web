import { NextRequest } from 'next/server'
import { parsePaginationParams } from '@/lib/pagination'
import { errorResponse, successResponse } from '../../../../../../lib/apiResponse'
import { supabaseServer } from '../../../../../../lib/supabaseServer'

const WEBHOOK_EVENT_STATUSES = ['received', 'processed', 'failed'] as const
const WEBHOOK_EVENT_PROVIDERS = ['stripe', 'mock'] as const

type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number]
type WebhookEventProvider = (typeof WEBHOOK_EVENT_PROVIDERS)[number]

type WebhookEventRecord = {
    id: string
    provider: WebhookEventProvider
    event_id: string
    event_type: string
    status: WebhookEventStatus
    error_message: string | null
    processed_at: string | null
    created_at: string
    subscription_id: string | null
}

function normalizeStatus(value: string | null): WebhookEventStatus | null {
    const key = (value ?? '').trim().toLowerCase()
    if (!key) return null
    return WEBHOOK_EVENT_STATUSES.includes(key as WebhookEventStatus)
        ? (key as WebhookEventStatus)
        : null
}

function normalizeProvider(value: string | null): WebhookEventProvider | null {
    const key = (value ?? '').trim().toLowerCase()
    if (!key) return null
    return WEBHOOK_EVENT_PROVIDERS.includes(key as WebhookEventProvider)
        ? (key as WebhookEventProvider)
        : null
}

function normalizeSearch(value: string | null) {
    const normalized = (value ?? '').trim()
    if (!normalized) return null
    return normalized.replace(/,/g, ' ')
}

/** GET /api/admin/billing/webhook-events — List billing webhook events */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const { page, limit, from, to } = parsePaginationParams(searchParams)
        const status = normalizeStatus(searchParams.get('status'))
        const provider = normalizeProvider(searchParams.get('provider'))
        const search = normalizeSearch(searchParams.get('search'))

        let query = supabaseServer
            .from('billing_webhook_events')
            .select(`
                id,
                provider,
                event_id,
                event_type,
                status,
                error_message,
                processed_at,
                created_at,
                subscription_id
            `, { count: 'exact' })
            .order('created_at', { ascending: false })

        if (status) query = query.eq('status', status)
        if (provider) query = query.eq('provider', provider)
        if (search) query = query.or(`event_id.ilike.%${search}%,event_type.ilike.%${search}%`)

        const { data, error, count } = await query.range(from, to)
        if (error) return errorResponse(error.message, 500)

        return successResponse((data ?? []) as WebhookEventRecord[], 200, {
            page,
            limit,
            total: count ?? 0,
        })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}
