# Implemented Status Test Catalog

This document describes every implemented scenario in the Delivery Order + Subscription + Fulfillment integration suite.

## Scope
- Harness location: `scripts/api-tests/status/`
- Runner: `scripts/api-tests/status/runner.ts`
- Scenario source: `scripts/api-tests/status/scenarios.ts`
- Total implemented scenarios: `42`

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
- `local-status`: Packs `A-F`, `H-M` (40 scenarios)
- `local-status-deep`: Packs `A-M` (42 scenarios, includes race tests)

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

## Pack H: Billing lifecycle
| ID | Lanes | What it tests | Key assertions |
|---|---|---|---|
| `STATUS-H-001` | `local-status`, `local-status-deep` | `invoice.paid` webhook transitions subscription to active. | Subscription status becomes `active` after webhook. |
| `STATUS-H-002` | `local-status`, `local-status-deep` | `invoice.payment_failed` transitions active to payment_failed. | Active subscription becomes `payment_failed` after webhook. |
| `STATUS-H-003` | `local-status`, `local-status-deep` | Recovery: payment_failed back to active via `invoice.paid`. | `payment_failed` → `active` transition asserted. |
| `STATUS-H-004` | `local-status`, `local-status-deep` | `customer.subscription.deleted` sets cancelled. | Subscription status becomes `cancelled` after deletion webhook. |
| `STATUS-H-005` | `local-status`, `local-status-deep` | `customer.subscription.updated` with `past_due` sets payment_failed. | Subscription status becomes `payment_failed` via Stripe status mapping. |

## Pack I: Fulfillment collection lifecycle
| ID | Lanes | What it tests | Key assertions |
|---|---|---|---|
| `STATUS-I-001` | `local-status`, `local-status-deep` | Full collection flow: offboarding → partial → close. | Final state is `closed/collected`. Intermediate states verified at each step. |
| `STATUS-I-002` | `local-status`, `local-status-deep` | `mark_collected_and_close` without note returns 400. | API returns `400` with `note is required`. |
| `STATUS-I-003` | `local-status`, `local-status-deep` | `mark_partially_collected` rejected when service_state is in_service. | API returns `409` — action requires `offboarding_requested`. |
| `STATUS-I-004` | `local-status`, `local-status-deep` | Fulfillment events audit trail correctness. | At least 2 events created. `from_collection_status`, `to_collection_status`, `to_service_state`, and `note` verified. |

## Pack J: Webhook edge cases
| ID | Lanes | What it tests | Key assertions |
|---|---|---|---|
| `STATUS-J-001` | `local-status`, `local-status-deep` | Duplicate webhook event returns `duplicate: true`. | Second call with same `event.id` returns `200` with `duplicate=true`. |
| `STATUS-J-002` | `local-status`, `local-status-deep` | Invalid webhook signature returns 400. | Malformed `stripe-signature` header yields `400`. |
| `STATUS-J-003` | `local-status`, `local-status-deep` | Empty/whitespace `failure_reason` returns 400. | `"   "` and `""` both rejected with `failure_reason is required`. |

## Pack K: Field clearing and edge cases
| ID | Lanes | What it tests | Key assertions |
|---|---|---|---|
| `STATUS-K-001` | `local-status`, `local-status-deep` | Conditional fields are nulled on transition away. | `failure_reason` null after reschedule, `rescheduled_at` null after dispatch. |
| `STATUS-K-002` | `local-status`, `local-status-deep` | Cancelled state persists reason and clears others. | `cancelled_reason` set, `failure_reason` and `rescheduled_at` are null. |
| `STATUS-K-003` | `local-status`, `local-status-deep` | PATCH with `service_state` or `collection_status` returns 400. | Locked fulfillment fields rejected with `managed by admin actions`. |

## Pack L: Delivery order audit trail
| ID | Lanes | What it tests | Key assertions |
|---|---|---|---|
| `STATUS-L-001` | `local-status`, `local-status-deep` | Happy path transitions are logged. | 2 events: confirmed→dispatched, dispatched→delivered with correct from/to. |
| `STATUS-L-002` | `local-status`, `local-status-deep` | Failure and cancel reasons captured in events. | `failure_reason` and `cancelled_reason` persisted in event rows. |
| `STATUS-L-003` | `local-status`, `local-status-deep` | Idempotent same-status PATCH does not create event. | Only 1 event after dispatch + repeat dispatch. |

## Pack M: Webhook ordering guard
| ID | Lanes | What it tests | Key assertions |
|---|---|---|---|
| `STATUS-M-001` | `local-status`, `local-status-deep` | Out-of-order stale event does not regress billing status. | After `invoice.paid` (recent), a stale `invoice.payment_failed` (epoch 1970) is accepted but status remains `active`. |

## Notes on setup/verify/cleanup
- Setup and verification use Supabase service-role credentials.
- State transitions are always executed via HTTP API routes.
- Cleanup removes created auth users, profiles, companies, subscriptions, delivery orders, webhook rows, and mirrored invoices created by test fixtures.
