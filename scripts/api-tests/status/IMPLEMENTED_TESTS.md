# Implemented Status Test Catalog

This document describes every implemented scenario in the Delivery Order + Subscription + Fulfillment integration suite.

## Scope
- Harness location: `scripts/api-tests/status/`
- Runner: `scripts/api-tests/status/runner.ts`
- Scenario source: `scripts/api-tests/status/scenarios.ts`
- Total implemented scenarios: `23`

## Real APIs used by scenarios
- `POST /api/subscriptions`
- `PATCH /api/admin/delivery-orders/:id`
- `POST /api/admin/delivery-orders/:id` (fulfillment actions)
- `POST /api/webhooks/stripe`
- `GET /api/admin/delivery-orders` (invariant visibility check)

## Status values covered
- Delivery order statuses:
  - `confirmed`, `dispatched`, `delivered`, `partially_delivered`, `failed`, `rescheduled`, `cancelled`
- Billing statuses:
  - `active`, `pending_payment`, `payment_failed`, `cancelled`
- Fulfillment service/collection states:
  - `offboarding_requested`, `closed`, `in_service`
  - `not_collected`, `partially_collected`, `collected`

## Lane execution
- `local-status`: Packs `A-F` (21 scenarios)
- `local-status-deep`: Packs `A-G` (23 scenarios, includes race tests)

## Evidence contract
Every scenario stores required evidence fields:
- `requestSummary`
- `responseSnapshot`
- `createdIds`
- `dbBeforeAfterKeys`

The harness also records optional context when present (`webhookEventId`, `idempotencyKey`).

## Scenario catalog

## Pack A: Happy path
| ID | Lanes | What it tests | Key assertions |
|---|---|---|---|
| `STATUS-A-001` | `local-status`, `local-status-deep` | Confirmed order follows happy path to delivery. | `confirmed -> dispatched -> delivered`, DO ends `delivered`, fulfillment `service_state` is `in_service`, `first_delivery_at` is set. |
| `STATUS-A-002` | `local-status`, `local-status-deep` | Partial delivery path. | `confirmed -> dispatched -> partially_delivered`, DO ends `partially_delivered`, `first_delivery_at` is set. |
| `STATUS-A-003` | `local-status`, `local-status-deep` | Multiple subscriptions/DOs transition independently. | Two DOs are dispatched, only one is delivered, the second remains `dispatched`, list endpoint reflects separation by `subscription_id`. |

## Pack B: Billing blockers
| ID | Lanes | What it tests | Key assertions |
|---|---|---|---|
| `STATUS-B-001` | `local-status`, `local-status-deep` | Dispatch blocked for `pending_payment`. | Dispatch returns `409`, error includes `billing status must be active`. |
| `STATUS-B-002` | `local-status`, `local-status-deep` | Dispatch blocked for `payment_failed`. | Stripe webhook drives subscription to `payment_failed`; dispatch returns `409` with billing blocker message. |
| `STATUS-B-003` | `local-status`, `local-status-deep` | Dispatch blocked for `cancelled`. | Stripe webhook drives subscription to `cancelled`; dispatch returns `409` with billing blocker message. |
| `STATUS-B-004` | `local-status`, `local-status-deep` | Recovery unblocks dispatch. | `payment_failed` blocks dispatch first, then webhook transitions back to `active`, dispatch succeeds with `200` and DO becomes `dispatched`. |

## Pack C: Failure and reschedule flows
| ID | Lanes | What it tests | Key assertions |
|---|---|---|---|
| `STATUS-C-001` | `local-status`, `local-status-deep` | `failed` transition validation. | Missing `failure_reason` returns `400` and explicit validation error. |
| `STATUS-C-002` | `local-status`, `local-status-deep` | `rescheduled` transition validation. | Missing `rescheduled_at` returns `400` and explicit validation error. |
| `STATUS-C-003` | `local-status`, `local-status-deep` | Retry flow to successful delivery. | `dispatched -> failed -> rescheduled -> dispatched -> delivered`, DO ends `delivered`. |
| `STATUS-C-004` | `local-status`, `local-status-deep` | Multiple fail/reschedule cycles. | Two fail cycles are accepted with valid reasons/dates; final partial delivery ends with `partially_delivered`. |

## Pack D: Cancellation flows
| ID | Lanes | What it tests | Key assertions |
|---|---|---|---|
| `STATUS-D-001` | `local-status`, `local-status-deep` | Cancel from `confirmed`. | `confirmed -> cancelled` succeeds with valid `cancelled_reason`. |
| `STATUS-D-002` | `local-status`, `local-status-deep` | Cancel from `failed`. | `dispatched -> failed -> cancelled` succeeds. |
| `STATUS-D-003` | `local-status`, `local-status-deep` | Cancel from `rescheduled`. | `dispatched -> failed -> rescheduled -> cancelled` succeeds. |
| `STATUS-D-004` | `local-status`, `local-status-deep` | Terminal lock behavior. | After `delivered`, cancel attempt returns `409` with `Invalid transition`. |

## Pack E: Fulfillment blockers
| ID | Lanes | What it tests | Key assertions |
|---|---|---|---|
| `STATUS-E-001` | `local-status`, `local-status-deep` | `offboarding_requested` blocks dispatch. | Cancel webhook sets offboarding, billing is brought back to `active`, dispatch still returns `409` due to service-state blocker. |
| `STATUS-E-002` | `local-status`, `local-status-deep` | `closed` blocks dispatch. | Fulfillment action `mark_collected_and_close` sets `closed/collected`; dispatch returns `409` even with active billing. |
| `STATUS-E-003` | `local-status`, `local-status-deep` | Delivered transition must not overwrite offboarding/closed. | `delivered` preserves `offboarding_requested` in one fixture and preserves `closed` in another fixture. |

## Pack F: Invariants
| ID | Lanes | What it tests | Key assertions |
|---|---|---|---|
| `STATUS-F-001` | `local-status`, `local-status-deep` | No orphan DO references. | All `delivery_orders.subscription_id` values resolve to existing `subscriptions.id`. |
| `STATUS-F-002` | `local-status`, `local-status-deep` | `first_delivery_at` immutability. | After first partial delivery sets timestamp, repeated delivery status call does not change `first_delivery_at`. |
| `STATUS-F-003` | `local-status`, `local-status-deep` | Invalid/illegal transition rejection. | Unknown status returns `400`; illegal transition (`confirmed -> delivered`) returns `409`. |

## Pack G: Races (deep lane only)
| ID | Lanes | What it tests | Key assertions |
|---|---|---|---|
| `STATUS-G-001` | `local-status-deep` | Double retry with identical PATCH payload. | Two concurrent `failed` PATCH calls both return `200`; final DO state is consistently `failed` with reason. |
| `STATUS-G-002` | `local-status-deep` | Concurrent conflicting transitions. | Concurrent `failed` vs `delivered` yields exactly one `200` and one `409`; final DO state is either `failed` or `delivered` (single winner). |

## Notes on setup/verify/cleanup
- Setup and verification use Supabase service-role credentials.
- State transitions are always executed via HTTP API routes.
- Cleanup removes created auth users, profiles, companies, subscriptions, delivery orders, webhook rows, and mirrored invoices created by test fixtures.
