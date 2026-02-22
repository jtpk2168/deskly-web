# API Test Harness (Canonical README)

This is the single canonical README for `scripts/api-tests/`.

## Scope
- Core API scenario harness:
  - Runner: `scripts/api-tests/runner.ts`
  - Scenarios: `scripts/api-tests/scenarios.ts`
- Status lifecycle integration harness:
  - Runner: `scripts/api-tests/status/runner.ts`
  - Scenarios: `scripts/api-tests/status/scenarios.ts`
  - Full scenario catalog: `scripts/api-tests/status/IMPLEMENTED_TESTS.md`

## Lanes
Core harness lanes:
- `local-core`
- `local-full`
- `staging-sandbox-smoke`

Status harness lanes:
- `local-status` (packs A-F)
- `local-status-deep` (packs A-G, includes race tests)

## Policy
- Stripe-only policy is active for billing flows.
- `MANIFEST-001` is blocking in all of its lanes (`local-core`, `local-full`).
- Missing `manifest.ts` route-method entries are always a hard fail.
- Stale manifest entries are treated as manifest drift failures.
- `COVERAGE-001` validates positive/negative coverage mapping for manifest routes.
- `local-core` is minimal Stripe-sandbox smoke; retry/backoff is only for Stripe network/transient failures.
- No scenario is considered `pass` unless required evidence is recorded.

## Required Env Vars
For core harness:
- `API_BASE_URL` (optional; defaults per runner when supported)
- Stripe/Supabase vars used by selected scenarios

For status harness:
- `API_BASE_URL` (defaults to `http://127.0.0.1:3000`)
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Run Commands
From `web/`:

Core harness:
- `npm run check:api-tests:core`
- `npm run check:api-tests:full`
- `npm run check:api-tests:staging-sandbox-smoke`

Status harness:
- `npm run check:api-tests:status`
- `npm run check:api-tests:status-deep`

## Reports
- Core harness prints lane summaries in terminal.
- Status harness writes JSON reports:
  - `/tmp/deskly-api-status-report-local-status.json`
  - `/tmp/deskly-api-status-report-local-status-deep.json`

## Audit Artifacts
- v1 vs v2.3 gap matrix: `scripts/api-tests/docs/v1-v2.3-gap-matrix.md`
- Status implemented scenario matrix: `scripts/api-tests/status/IMPLEMENTED_TESTS.md`
