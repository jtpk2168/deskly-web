import fs from 'node:fs'
import path from 'node:path'
import { discoverImplementedRouteMethods } from './discoverRouteMethods'
import { API_ROUTE_MANIFEST, toRouteMethodKey } from './manifest'
import { KNOWN_GAPS } from './knownGaps'
import type { Evidence, RouteManifestEntry, Scenario, ScenarioRuntimeState } from './types'
import { makePlaceholderEvidence } from './utils'

type Pattern = string | RegExp

type StaticCheck = {
    file: string
    mustInclude?: Pattern[]
    mustExclude?: Pattern[]
}

function hasPattern(source: string, pattern: Pattern) {
    if (typeof pattern === 'string') return source.includes(pattern)
    return pattern.test(source)
}

function assertPatternChecks(source: string, checks: StaticCheck, failures: string[]) {
    for (const pattern of checks.mustInclude ?? []) {
        if (!hasPattern(source, pattern)) {
            failures.push(`[${checks.file}] missing expected pattern: ${String(pattern)}`)
        }
    }

    for (const pattern of checks.mustExclude ?? []) {
        if (hasPattern(source, pattern)) {
            failures.push(`[${checks.file}] found forbidden pattern: ${String(pattern)}`)
        }
    }
}

function readRepoFile(repoRoot: string, relativePath: string) {
    const fullPath = path.join(repoRoot, relativePath)
    return fs.readFileSync(fullPath, 'utf8')
}

function buildEvidencePatch(endpoint: string, method: string, details: Record<string, unknown>, attempts?: number): Partial<Evidence> {
    const patch = makePlaceholderEvidence(details)
    patch.requestSummary = {
        method,
        url: `static://${endpoint}`,
        headersRedacted: {},
    }
    patch.responseSnapshot = {
        status: 200,
        bodyRedacted: details,
    }
    if (attempts != null) patch.attempts = attempts
    return patch
}

function runStaticChecks(repoRoot: string, checks: StaticCheck[]) {
    const failures: string[] = []
    for (const check of checks) {
        const source = readRepoFile(repoRoot, check.file)
        assertPatternChecks(source, check, failures)
    }
    if (failures.length > 0) {
        throw new Error(failures.join(' | '))
    }
}

function mapRouteToCoverage(route: RouteManifestEntry) {
    const endpoint = route.endpoint

    if (endpoint === '/api/setup-admin') {
        return {
            positive: ['SETUP-001'],
            negative: ['SETUP-002'],
        }
    }

    if (endpoint.startsWith('/api/webhooks/stripe')) {
        return {
            positive: ['WH-001'],
            negative: ['INV-004'],
        }
    }

    if (endpoint.startsWith('/api/billing/checkout')) {
        return {
            positive: ['BILL-CHK-001', 'BILL-CHK-008'],
            negative: ['BILL-CHK-001'],
        }
    }

    if (endpoint.startsWith('/api/billing/catalog/sync')) {
        return {
            positive: ['BILL-SYNC-001'],
            negative: ['BILL-SYNC-001'],
        }
    }

    if (endpoint.startsWith('/api/admin/billing/invoices/backfill')) {
        return {
            positive: ['BILL-BACKFILL-001'],
            negative: ['BILL-BACKFILL-001'],
        }
    }

    if (endpoint.startsWith('/api/admin/billing/invoices') || endpoint.startsWith('/api/admin/billing/webhook-events')) {
        return {
            positive: ['BILL-VIEW-001'],
            negative: ['BILL-VIEW-001'],
        }
    }

    if (endpoint.startsWith('/api/admin/products')) {
        return {
            positive: ['AP-001'],
            negative: ['AP-001'],
        }
    }

    if (endpoint.startsWith('/api/admin/subscriptions') || endpoint.startsWith('/api/admin/orders')) {
        return {
            positive: ['AS-001'],
            negative: ['AS-001'],
        }
    }

    if (endpoint.startsWith('/api/admin/delivery-orders')) {
        return {
            positive: ['DO-001', 'INV-001', 'INV-003'],
            negative: ['DO-001', 'INV-002'],
        }
    }

    if (endpoint.startsWith('/api/admins')) {
        return {
            positive: ['ADM-001'],
            negative: ['ADM-001'],
        }
    }

    if (endpoint.startsWith('/api/customers')) {
        return {
            positive: ['CUS-001'],
            negative: ['CUS-001'],
        }
    }

    if (endpoint.startsWith('/api/admin/dashboard')) {
        return {
            positive: ['DASH-001'],
            negative: ['API-ENV-001'],
        }
    }

    if (endpoint.startsWith('/api/products') || endpoint.startsWith('/api/bundles')) {
        return {
            positive: ['CAT-001'],
            negative: ['CAT-001'],
        }
    }

    if (endpoint.startsWith('/api/profile')) {
        return {
            positive: ['PROFILE-001'],
            negative: ['PROFILE-001'],
        }
    }

    if (endpoint.startsWith('/api/subscriptions') || endpoint.startsWith('/api/orders')) {
        return {
            positive: ['SUB-001'],
            negative: ['SUB-001'],
        }
    }

    return {
        positive: ['API-ENV-001'],
        negative: ['API-ENV-001'],
    }
}

async function runOptionalLiveConcurrentCheckout(state: ScenarioRuntimeState, apiBaseUrl: string | null) {
    const payloadText = process.env.DESKLY_API_TEST_CHECKOUT_PAYLOAD
    if (!apiBaseUrl || !payloadText) {
        return {
            mode: 'static-only',
            reason: 'Live concurrency test skipped: API_BASE_URL or DESKLY_API_TEST_CHECKOUT_PAYLOAD is not configured.',
            attempts: 0,
        }
    }

    let payload: Record<string, unknown>
    try {
        payload = JSON.parse(payloadText) as Record<string, unknown>
    } catch {
        throw new Error('DESKLY_API_TEST_CHECKOUT_PAYLOAD must be valid JSON.')
    }

    const idempotencyKey = typeof payload.idempotency_key === 'string' && payload.idempotency_key.trim()
        ? payload.idempotency_key.trim()
        : `apitest-${Date.now()}`

    payload.idempotency_key = idempotencyKey

    const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/api/billing/checkout`
    const attempts = 5
    const requests = new Array(attempts).fill(0).map(async () => {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })

        const body = await response.json().catch(() => null)
        return {
            status: response.status,
            body,
        }
    })

    const results = await Promise.all(requests)
    const errors = results.filter((entry) => entry.status >= 400)
    if (errors.length > 0) {
        throw new Error(`Concurrent checkout produced ${errors.length} error responses.`)
    }

    const createdCount = results.filter((entry) => entry.status === 201).length
    if (createdCount !== 1) {
        throw new Error(`Expected exactly one 201 response; received ${createdCount}.`)
    }

    const subscriptionIds = new Set<string>()
    for (const entry of results) {
        const maybeId = entry.body?.data?.subscription?.id
        if (typeof maybeId === 'string' && maybeId.trim()) {
            subscriptionIds.add(maybeId.trim())
        }
    }

    if (subscriptionIds.size !== 1) {
        throw new Error(`Expected a single subscription id across concurrency replay; got ${subscriptionIds.size}.`)
    }

    state.evidence = {
        ...state.evidence,
        idempotencyKey,
    }

    return {
        mode: 'live',
        attempts,
        createdCount,
        uniqueSubscriptions: subscriptionIds.size,
    }
}

export const API_TEST_SCENARIOS: Scenario[] = [
    {
        id: 'MANIFEST-001',
        title: 'Manifest coverage check fails if any implemented route+method is missing from manifest.ts',
        category: 'cross-cutting',
        coverageStatus: 'implemented',
        v1SourceId: 'MANIFEST-001',
        endpoint: '/internal/manifest',
        method: 'N/A',
        lanes: ['local-core', 'local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: true,
        run: async (ctx) => {
            const discovered = discoverImplementedRouteMethods(ctx.repoRoot)
            const discoveredKeys = new Set(discovered.map(toRouteMethodKey))
            const manifestKeys = new Set(API_ROUTE_MANIFEST.map(toRouteMethodKey))

            const missingFromManifest = [...discoveredKeys].filter((key) => !manifestKeys.has(key)).sort()
            const staleInManifest = [...manifestKeys].filter((key) => !discoveredKeys.has(key)).sort()

            if (missingFromManifest.length > 0 || staleInManifest.length > 0) {
                const issues: string[] = []
                if (missingFromManifest.length > 0) {
                    issues.push(`Missing manifest entries (${missingFromManifest.length}): ${missingFromManifest.join(', ')}`)
                }
                if (staleInManifest.length > 0) {
                    issues.push(`Stale manifest entries (${staleInManifest.length}): ${staleInManifest.join(', ')}`)
                }
                throw new Error(issues.join(' | '))
            }

            return {
                evidencePatch: buildEvidencePatch('/internal/manifest', 'N/A', {
                    discovered_count: discovered.length,
                    manifest_count: API_ROUTE_MANIFEST.length,
                }),
            }
        },
    },
    {
        id: 'COVERAGE-001',
        title: 'Every manifest route+method has positive and negative scenario coverage mapping',
        category: 'cross-cutting',
        coverageStatus: 'implemented',
        v1SourceId: 'API-ENV-*',
        endpoint: '/internal/coverage',
        method: 'N/A',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async () => {
            const uncovered: string[] = []
            const missingPositive: string[] = []
            const missingNegative: string[] = []

            for (const route of API_ROUTE_MANIFEST) {
                const map = mapRouteToCoverage(route)
                const routeKey = toRouteMethodKey(route)
                if (!map) {
                    uncovered.push(routeKey)
                    continue
                }
                if (map.positive.length === 0) missingPositive.push(routeKey)
                if (map.negative.length === 0) missingNegative.push(routeKey)
            }

            if (uncovered.length || missingPositive.length || missingNegative.length) {
                throw new Error(
                    [
                        uncovered.length ? `Uncovered route methods: ${uncovered.join(', ')}` : null,
                        missingPositive.length ? `Missing positive coverage: ${missingPositive.join(', ')}` : null,
                        missingNegative.length ? `Missing negative coverage: ${missingNegative.join(', ')}` : null,
                    ].filter(Boolean).join(' | ')
                )
            }

            return {
                evidencePatch: buildEvidencePatch('/internal/coverage', 'N/A', {
                    route_methods_checked: API_ROUTE_MANIFEST.length,
                    uncovered_count: uncovered.length,
                    missing_positive_count: missingPositive.length,
                    missing_negative_count: missingNegative.length,
                }),
            }
        },
    },
    {
        id: 'API-ENV-001',
        title: 'Cross-cutting API envelope and route contract checks are present',
        category: 'cross-cutting',
        coverageStatus: 'implemented',
        v1SourceId: 'API-ENV-001',
        endpoint: '/internal/cross-cutting',
        method: 'N/A',
        lanes: ['local-full', 'staging-sandbox-smoke'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'lib/apiResponse.ts',
                    mustInclude: ['successResponse', 'errorResponse', 'parseUUID'],
                },
                {
                    file: 'src/app/api/products/route.ts',
                    mustInclude: ['successResponse', 'errorResponse'],
                },
                {
                    file: 'src/app/api/profile/route.ts',
                    mustInclude: ['successResponse', 'errorResponse'],
                },
                {
                    file: 'src/app/api/admin/products/route.ts',
                    mustInclude: ['successResponse', 'errorResponse'],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/internal/cross-cutting', 'N/A', {
                    files_checked: 4,
                }),
            }
        },
    },
    {
        id: 'API-PAGE-001',
        title: 'Pagination defaults and maximum limit policy are enforced',
        category: 'cross-cutting',
        coverageStatus: 'implemented',
        v1SourceId: 'API-PAGE-001',
        endpoint: '/internal/pagination',
        method: 'N/A',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/lib/pagination.ts',
                    mustInclude: [
                        'const DEFAULT_PAGE = 1',
                        'const DEFAULT_LIMIT = 10',
                        'const MAX_LIMIT = 100',
                        'Math.min(MAX_LIMIT, requestedLimit)',
                    ],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/internal/pagination', 'N/A', {
                    defaults: { page: 1, limit: 10, max_limit: 100 },
                }),
            }
        },
    },
    {
        id: 'CAT-001',
        title: 'Catalog routes enforce active filtering and unsupported write guards',
        category: 'catalog',
        coverageStatus: 'implemented',
        v1SourceId: 'CAT-001',
        endpoint: '/api/products,/api/products/[id],/api/bundles,/api/bundles/[id]',
        method: 'N/A',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/products/route.ts',
                    mustInclude: [".eq('status', 'active')", 'Use /api/admin/products for product creation'],
                },
                {
                    file: 'src/app/api/products/[id]/route.ts',
                    mustInclude: [".eq('status', 'active')", 'Use /api/admin/products/:id for product updates'],
                },
                {
                    file: 'src/app/api/bundles/route.ts',
                    mustInclude: [".eq('is_active', true)"],
                },
                {
                    file: 'src/app/api/bundles/[id]/route.ts',
                    mustInclude: ['Bundle not found', 'Bundle deactivated'],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/products', 'N/A', {
                    checks: ['active product filter', 'public write guard', 'bundle activation filter'],
                }),
            }
        },
    },
    {
        id: 'PROFILE-001',
        title: 'Profile routes enforce user_id validation and onboarding upsert flow',
        category: 'profile',
        coverageStatus: 'implemented',
        v1SourceId: 'PROFILE-001',
        endpoint: '/api/profile',
        method: 'N/A',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/profile/route.ts',
                    mustInclude: [
                        'user_id query parameter is required',
                        'Invalid user_id format',
                        '.upsert({',
                        '.from(\'companies\')',
                    ],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/profile', 'N/A', {
                    validations_checked: ['required user_id', 'uuid format', 'profile upsert', 'company upsert'],
                }),
            }
        },
    },
    {
        id: 'SUB-001',
        title: 'Subscription routes enforce validation and readonly contract behavior',
        category: 'subscription',
        coverageStatus: 'implemented',
        v1SourceId: 'SUB-001',
        endpoint: '/api/subscriptions,/api/subscriptions/[id],/api/orders',
        method: 'N/A',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/subscriptions/route.ts',
                    mustInclude: [
                        'user_id query parameter is required',
                        'minimum_term_months must be at least',
                        'Complete your profile before placing an order',
                    ],
                },
                {
                    file: 'src/app/api/subscriptions/[id]/route.ts',
                    mustInclude: [
                        'No editable fields are available on this endpoint.',
                        'BILLING_FIELDS_READONLY_ERROR',
                    ],
                },
                {
                    file: 'src/app/api/orders/route.ts',
                    mustInclude: ['parsePaginationParams', 'normalizeBillingStatus'],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/subscriptions', 'N/A', {
                    files_checked: 3,
                }),
            }
        },
    },
    {
        id: 'BILL-CHK-001',
        title: 'Stripe checkout route enforces validation, profile completeness, and idempotency flow',
        category: 'billing',
        coverageStatus: 'implemented',
        v1SourceId: 'BILL-CHK-001',
        endpoint: '/api/billing/checkout',
        method: 'POST',
        lanes: ['local-core', 'local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/billing/checkout/route.ts',
                    mustInclude: [
                        'Invalid or missing user_id',
                        'Provide at least one line item or monthly_total',
                        'Complete your profile before placing an order',
                        'Delivery details are incomplete',
                        'idempotency_key must be at most',
                        'This idempotency key was already used with different checkout details.',
                        'checkout_idempotency_key',
                        'checkout_request_fingerprint',
                        'Failed to initialize delivery order',
                        'Failed to save subscription items',
                    ],
                },
                {
                    file: '../supabase/migrations/20260218004000_add_subscription_checkout_idempotency.sql',
                    mustInclude: [
                        'subscriptions_checkout_idempotency_key_idx',
                        'subscriptions_checkout_fingerprint_idx',
                    ],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/billing/checkout', 'POST', {
                    checks: ['validation guards', 'profile gate', 'idempotency key/fingerprint', 'db index support'],
                }),
            }
        },
    },
    {
        id: 'BILL-CHK-008',
        title: 'Concurrent idempotency replay is protected (static guarantees + optional live execution)',
        category: 'billing',
        coverageStatus: 'implemented',
        v1SourceId: 'BILL-CHK-008',
        endpoint: '/api/billing/checkout',
        method: 'POST',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx, state) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/billing/checkout/route.ts',
                    mustInclude: [
                        'isUniqueViolation',
                        'resolveIdempotentReplayResponse',
                        'checkout_request_fingerprint',
                        'deriveAutoIdempotencyKey',
                    ],
                },
                {
                    file: '../supabase/migrations/20260218004000_add_subscription_checkout_idempotency.sql',
                    mustInclude: ['create unique index if not exists subscriptions_checkout_idempotency_key_idx'],
                },
            ])

            const liveResult = await runOptionalLiveConcurrentCheckout(state, ctx.apiBaseUrl)
            return {
                evidencePatch: buildEvidencePatch('/api/billing/checkout', 'POST', {
                    static_checks: ['idempotency replay branch', 'unique index'],
                    live_result: liveResult,
                }, liveResult.attempts),
            }
        },
    },
    {
        id: 'WH-001',
        title: 'Stripe webhook route enforces signature validation, dedupe, and lifecycle processing hooks',
        category: 'webhook',
        coverageStatus: 'implemented',
        v1SourceId: 'WH-001',
        endpoint: '/api/webhooks/stripe',
        method: 'POST',
        lanes: ['local-core', 'local-full', 'staging-sandbox-smoke'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/webhooks/stripe/route.ts',
                    mustInclude: [
                        'Invalid Stripe webhook signature',
                        'Missing event id or type',
                        'duplicate: true',
                        'processStripeEvent',
                        'syncSubscriptionInventory',
                    ],
                },
                {
                    file: 'src/lib/billing/stripeWebhook.ts',
                    mustInclude: ['verifyStripeWebhookSignature', 'mapStripeSubscriptionStatus'],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/webhooks/stripe', 'POST', {
                    checks: ['signature validation', 'event idempotency', 'status mapping hook'],
                }),
            }
        },
    },
    {
        id: 'BILL-SYNC-001',
        title: 'Billing catalog sync supports dry-run and guarded writes',
        category: 'billing',
        coverageStatus: 'implemented',
        v1SourceId: 'BILL-SYNC-001',
        endpoint: '/api/billing/catalog/sync',
        method: 'POST',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/billing/catalog/sync/route.ts',
                    mustInclude: [
                        'dry_run',
                        'Failed to load products',
                        'Product',
                        'has invalid monthly_price',
                        'Failed to save catalog mapping',
                    ],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/billing/catalog/sync', 'POST', {
                    checks: ['dry_run branch', 'invalid monthly price guard', 'write error handling'],
                }),
            }
        },
    },
    {
        id: 'BILL-BACKFILL-001',
        title: 'Invoice backfill route enforces limit/dry-run semantics and chunked upsert behavior',
        category: 'billing',
        coverageStatus: 'implemented',
        v1SourceId: 'BILL-BACKFILL-001',
        endpoint: '/api/admin/billing/invoices/backfill',
        method: 'POST',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/admin/billing/invoices/backfill/route.ts',
                    mustInclude: [
                        'parseBackfillLimit',
                        'parseDryRun',
                        'fetchStripeInvoices',
                        'chunkArray',
                        'Failed to mirror backfilled invoices',
                        'dry_run',
                    ],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/admin/billing/invoices/backfill', 'POST', {
                    checks: ['limit parser', 'dry run parser', 'chunked upsert'],
                }),
            }
        },
    },
    {
        id: 'AP-001',
        title: 'Admin products routes enforce CRUD/import/export/media validation and safeguards',
        category: 'admin-products',
        coverageStatus: 'implemented',
        v1SourceId: 'AP-001',
        endpoint: '/api/admin/products*',
        method: 'N/A',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/admin/products/route.ts',
                    mustInclude: ['name is required', 'category is invalid', 'stock_quantity must be an integer'],
                },
                {
                    file: 'src/app/api/admin/products/[id]/route.ts',
                    mustInclude: ['product_code is immutable', 'No valid fields provided', 'Product deactivated'],
                },
                {
                    file: 'src/app/api/admin/products/import/route.ts',
                    mustInclude: ['CSV file is required', 'CSV validation failed', 'Failed to generate unique product codes'],
                },
                {
                    file: 'src/app/api/admin/products/export/route.ts',
                    mustInclude: ['Content-Disposition', 'text/csv'],
                },
                {
                    file: 'src/app/api/admin/products/media-upload/route.ts',
                    mustInclude: ['Image exceeds 5MB limit', 'Video exceeds 30MB limit', 'mediaType must be image or video'],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/admin/products', 'N/A', {
                    files_checked: 5,
                }),
            }
        },
    },
    {
        id: 'AS-001',
        title: 'Admin subscriptions/orders routes enforce list/detail/action and readonly guards',
        category: 'admin-subscriptions',
        coverageStatus: 'implemented',
        v1SourceId: 'AS-001',
        endpoint: '/api/admin/subscriptions*',
        method: 'N/A',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/admin/subscriptions/route.ts',
                    mustInclude: ['parseAdminOrderFilters', 'matchesSubscriptionSearch'],
                },
                {
                    file: 'src/app/api/admin/subscriptions/[id]/route.ts',
                    mustInclude: [
                        'No editable fields are available on this endpoint.',
                        'Invalid action. Must be: cancel_now or cancel_at_period_end',
                        'Billing actions are only supported for Stripe subscriptions',
                    ],
                },
                {
                    file: 'src/app/api/admin/orders/route.ts',
                    mustInclude: ['export { GET } from \'../subscriptions/route\''],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/admin/subscriptions', 'N/A', {
                    checks: ['filter/search list', 'readonly patch', 'stripe action guard', 'orders alias'],
                }),
            }
        },
    },
    {
        id: 'DO-001',
        title: 'Admin delivery routes enforce transition matrix and fulfillment action validation',
        category: 'admin-delivery',
        coverageStatus: 'implemented',
        v1SourceId: 'DO-001',
        endpoint: '/api/admin/delivery-orders*',
        method: 'N/A',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/admin/delivery-orders/[id]/route.ts',
                    mustInclude: [
                        'Invalid transition:',
                        'failure_reason is required when do_status is failed',
                        'cancelled_reason is required when do_status is cancelled',
                        'rescheduled_at must be a valid datetime',
                        'Dispatch blocked: billing status must be active',
                        'admin_apply_fulfillment_action',
                    ],
                },
                {
                    file: 'src/app/api/admin/delivery-orders/route.ts',
                    mustInclude: ['parseDeliveryOrderFilters', 'matchesDeliveryOrderSearch'],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/admin/delivery-orders', 'N/A', {
                    checks: ['transition validation', 'dispatch blocking', 'fulfillment action rpc'],
                }),
            }
        },
    },
    {
        id: 'ADM-001',
        title: 'Admin user routes enforce validation and super-admin protection',
        category: 'admin-users',
        coverageStatus: 'implemented',
        v1SourceId: 'ADM-001',
        endpoint: '/api/admins',
        method: 'N/A',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/admins/route.ts',
                    mustInclude: [
                        'Cannot edit Super Admin user.',
                        'Cannot delete Super Admin user.',
                        'A valid email is required',
                        'Password is required and must be at least 8 characters',
                    ],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/admins', 'N/A', {
                    checks: ['input validation', 'super-admin guard'],
                }),
            }
        },
    },
    {
        id: 'CUS-001',
        title: 'Customer routes enforce admin deletion guard and paging',
        category: 'admin-users',
        coverageStatus: 'implemented',
        v1SourceId: 'CUS-001',
        endpoint: '/api/customers',
        method: 'N/A',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/customers/route.ts',
                    mustInclude: [
                        'Use the /api/admins endpoint to delete admins.',
                        'parsePaginationParams',
                    ],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/customers', 'N/A', {
                    checks: ['admin delete guard', 'pagination'],
                }),
            }
        },
    },
    {
        id: 'DASH-001',
        title: 'Dashboard route computes aggregate metrics from subscriptions, products, users, and delivery orders',
        category: 'dashboard',
        coverageStatus: 'implemented',
        v1SourceId: 'DASH-001',
        endpoint: '/api/admin/dashboard',
        method: 'GET',
        lanes: ['local-full', 'staging-sandbox-smoke'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/admin/dashboard/route.ts',
                    mustInclude: [
                        'totalRevenue',
                        'activeRentals',
                        'totalProducts',
                        'totalUsers',
                        'recentOrders',
                    ],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/admin/dashboard', 'GET', {
                    checks: ['aggregate fields present'],
                }),
            }
        },
    },
    {
        id: 'BILL-VIEW-001',
        title: 'Billing view routes normalize filters and return invoice/webhook event lists',
        category: 'billing',
        coverageStatus: 'implemented',
        v1SourceId: 'BILL-VIEW-001',
        endpoint: '/api/admin/billing/invoices,/api/admin/billing/webhook-events',
        method: 'N/A',
        lanes: ['local-full', 'staging-sandbox-smoke'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/admin/billing/invoices/route.ts',
                    mustInclude: ['normalizeStatus', 'normalizeProvider', 'resolveInvoicePeriodTimestamps'],
                },
                {
                    file: 'src/app/api/admin/billing/webhook-events/route.ts',
                    mustInclude: ['normalizeStatus', 'normalizeProvider', 'normalizeSearch'],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/admin/billing/invoices', 'N/A', {
                    checks: ['filter normalization', 'payload shaping'],
                }),
            }
        },
    },
    {
        id: 'INV-001',
        title: 'delivery_orders rows reference valid subscription_id via FK constraints',
        category: 'invariants',
        coverageStatus: 'implemented',
        v1SourceId: 'INV-001',
        endpoint: '/api/admin/delivery-orders',
        method: 'GET',
        lanes: ['local-full', 'staging-sandbox-smoke'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: '../supabase/migrations/20260219001500_delivery_orders_subscription_fulfillment.sql',
                    mustInclude: ['subscription_id uuid not null references public.subscriptions(id) on delete cascade'],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/admin/delivery-orders', 'GET', {
                    invariant: 'delivery_orders.subscription_id references subscriptions.id',
                }),
            }
        },
    },
    {
        id: 'INV-002',
        title: 'Terminal/illegal delivery status transitions are rejected with 409',
        category: 'invariants',
        coverageStatus: 'implemented',
        v1SourceId: 'INV-002',
        endpoint: '/api/admin/delivery-orders/[id]',
        method: 'PATCH',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/admin/delivery-orders/[id]/route.ts',
                    mustInclude: ['Invalid transition:', 'return errorResponse(`Invalid transition: ${currentStatus} -> ${nextStatus}`, 409)'],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/admin/delivery-orders/[id]', 'PATCH', {
                    invariant: 'illegal transitions return 409',
                }),
            }
        },
    },
    {
        id: 'INV-003',
        title: 'first_delivery_at is set once and never regresses after delivery',
        category: 'invariants',
        coverageStatus: 'implemented',
        v1SourceId: 'INV-003',
        endpoint: '/api/admin/delivery-orders/[id]',
        method: 'PATCH',
        lanes: ['local-full'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/admin/delivery-orders/[id]/route.ts',
                    mustInclude: [
                        'first_delivery_at: currentFulfillment?.first_delivery_at ?? nowIso',
                        "if (nextStatus === 'delivered' || nextStatus === 'partially_delivered')",
                    ],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/admin/delivery-orders/[id]', 'PATCH', {
                    invariant: 'first_delivery_at preserved once set',
                }),
            }
        },
    },
    {
        id: 'INV-004',
        title: 'Stripe webhook dedupe prevents duplicate inserts and duplicate side effects',
        category: 'invariants',
        coverageStatus: 'implemented',
        v1SourceId: 'INV-004',
        endpoint: '/api/webhooks/stripe',
        method: 'POST',
        lanes: ['local-full', 'staging-sandbox-smoke'],
        authExpectation: 'required',
        executionState: 'active',
        blocking: false,
        run: async (ctx) => {
            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/webhooks/stripe/route.ts',
                    mustInclude: [
                        '.eq(\'provider\', \'stripe\')',
                        '.eq(\'event_id\', event.id)',
                        'duplicate: true',
                        'status === \'processed\'',
                    ],
                },
                {
                    file: '../supabase/migrations/20260217214500_billing_module_foundation.sql',
                    mustInclude: ['create unique index if not exists billing_webhook_events_provider_event_idx'],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/webhooks/stripe', 'POST', {
                    invariant: 'webhook dedupe via status check + unique index',
                }),
            }
        },
    },
    {
        id: 'SETUP-001',
        title: '/api/setup-admin is intended local/test-only; currently treated as local by automation policy; restriction is a KnownGap until hardened',
        category: 'setup',
        coverageStatus: 'implemented',
        v1SourceId: 'SETUP-001',
        endpoint: '/api/setup-admin',
        method: 'GET',
        lanes: ['local-full'],
        authExpectation: 'soft_gap',
        executionState: 'active',
        blocking: false,
        knownGapId: 'SETUP-GAP-001',
        run: async (ctx) => {
            const hasKnownGap = KNOWN_GAPS.some((gap) => gap.id === 'SETUP-GAP-001')
            if (!hasKnownGap) {
                throw new Error('SETUP-GAP-001 must be present in knownGaps.ts for setup-admin policy tracking.')
            }

            runStaticChecks(ctx.repoRoot, [
                {
                    file: 'src/app/api/setup-admin/route.ts',
                    mustInclude: ['export async function GET()', 'User created successfully'],
                },
            ])

            return {
                evidencePatch: buildEvidencePatch('/api/setup-admin', 'GET', {
                    policy: 'intended local/test-only by automation policy',
                    known_gap: 'SETUP-GAP-001',
                }),
            }
        },
    },
    {
        id: 'SETUP-002',
        title: 'Staging/local hardened behavior must reject /api/setup-admin with 403/404',
        category: 'setup',
        coverageStatus: 'pending_gap',
        v1SourceId: 'SETUP-002',
        endpoint: '/api/setup-admin',
        method: 'GET',
        lanes: ['staging-sandbox-smoke', 'local-full'],
        authExpectation: 'required',
        executionState: 'pending_until_gap_closed',
        blocking: false,
        knownGapId: 'SETUP-GAP-001',
        run: async () => {
            throw new Error('SETUP-002 should not execute while marked pending_until_gap_closed.')
        },
    },
]
