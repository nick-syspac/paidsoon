## Context

See proposal.md for motivation. Current billing behavior is split across checkout, checkout-success reconciliation, webhook processing, dashboard gating, and admin diagnostics/actions. The current implementation still writes local trial state (`trialEndsAt`) during checkout and success reconciliation, and some guard logic uses local date comparisons directly. The webhook currently handles only a subset of required Stripe lifecycle events and lacks a durable event-order/idempotency watermark.

Existing constraints:
- Preserve existing plan catalog names, pricing, limits, and plan-to-price mapping.
- Keep Stripe secrets server-side only.
- Keep tenant isolation and RLS behavior; billing webhook remains privileged through `prismaAdmin`.
- Avoid destructive data changes; nullable additions only if schema expansion is required.

## Goals / Non-Goals

**Goals:**
- Make Stripe the sole authority for trial lifecycle dates and subscription status transitions.
- Ensure checkout creates Stripe-managed trial subscriptions for eligible new subscriptions only.
- Enforce duplicate-subscription protection for active/trialing subscribers.
- Reconcile all required lifecycle events idempotently and safely against out-of-order delivery.
- Drive access decisions and billing UI states from Stripe-synchronized status and dates.

**Non-Goals:**
- No plan catalog, entitlement matrix, or pricing changes.
- No Stripe Connect redesign.
- No replacement of existing downgrade scheduling architecture unless required for compatibility.
- No broad admin UX redesign beyond required trial-source-of-truth corrections.

## Decisions

### 1. Stripe lifecycle fields remain persisted in `UserProfile`, but Stripe stays authoritative
- Decision: Persist the latest Stripe subscription snapshot in `UserProfile` for low-latency app reads, while treating webhook/Stripe payload values as canonical.
- Rationale: App guards and UI require local reads; webhook-driven projection keeps reads fast while preserving Stripe authority.
- Alternatives considered:
  - Read Stripe live on every request: rejected due to latency, rate-limit risk, and degraded resilience.
  - Keep local computed trial windows: rejected because it creates split-brain billing logic.

### 2. Trial creation is applied only for trial-eligible self-serve plans
- Decision: Add an explicit eligibility check in checkout before setting `trial_period_days`; default eligibility is all self-serve paid plans with configured Stripe Price IDs (`starter`, `solo`, `small_business`, `business_pro`) and excludes contact-only/non-checkout tiers.
- Rationale: Requirement asks to confirm trial eligibility rules rather than assuming universal plan eligibility.
- Alternatives considered:
  - Apply trial to every plan: rejected because contact-only/exception plans may not be trial-eligible.
  - Hard-disable trials globally: rejected because target outcome is a Stripe-managed 14-day trial for eligible subscriptions.

### 3. Existing subscriber upgrades continue to use `subscriptions.update`; new subscriptions use Checkout + trial config
- Decision: Preserve the current split path and augment the Checkout branch with Stripe trial settings and stricter duplicate checks.
- Rationale: Current plan-switching path already prevents creating extra subscriptions for many upgrade flows.
- Alternatives considered:
  - Force all changes through Checkout: rejected due to duplicate-subscription risk for existing subscribers.

### 4. Add durable webhook idempotency and ordering guardrails
- Decision: Persist processed Stripe event IDs in a dedicated webhook event table plus a per-subscription ordering watermark (`latestStripeEventCreatedAt`) so duplicate deliveries are no-ops and older events cannot overwrite newer state.
- Rationale: Stripe retries and non-sequential delivery are expected; billing state must be monotonic from app perspective.
- Alternatives considered:
  - In-memory deduplication only: rejected because serverless/runtime restarts lose memory.
  - Trust event arrival order: rejected because Stripe does not guarantee ordering across retries/event types.

### 5. Access matrix is status-driven, not date-driven
- Decision: Standardize guards/UI behavior to the required status matrix (`trialing`, `active`, `past_due`, `incomplete`, `unpaid`, `canceled`) and treat synchronized dates as display/support data.
- Rationale: Prevents stale local dates from overriding Stripe truth and aligns UX messaging with actual subscription state.
- Alternatives considered:
  - Date-first checks with status fallback: rejected because it can reintroduce local drift bugs.

### 6. Schema evolution is additive and nullable if needed
- Decision: Reuse existing fields where possible; add nullable columns only for missing required Stripe projection fields (e.g., `price_id`, `cancel_at_period_end`, reconciliation watermark).
- Rationale: Minimizes migration risk for existing users and subscriptions.
- Alternatives considered:
  - Replace or rename existing billing columns: rejected as unnecessary migration risk.

## Risks / Trade-offs

- [Risk] Trial eligibility policy ambiguity across plans -> Mitigation: define explicit trial-eligible tier list in code/config and cover each plan in tests.
- [Risk] Historical webhook replay mutates current state -> Mitigation: persist Stripe event identity + created timestamp watermark per subscription/user before writes.
- [Risk] Temporary mismatch between checkout success redirect and webhook timing -> Mitigation: keep checkout-success reconciliation path but remove local trial derivation; rely on Stripe session/subscription snapshot.
- [Risk] Existing admin trial extension action conflicts with Stripe authority -> Mitigation: route extension through Stripe subscription update and sync back via webhook/reconciliation.
- [Risk] Additional DB write load from idempotency tracking -> Mitigation: bounded indexed dedupe storage with retention policy.

## Migration Plan

1. Add schema changes (if needed) as nullable fields and deploy migration.
2. Update webhook processing to write idempotency/order markers and Stripe lifecycle projection fields.
3. Update checkout and checkout-success logic to stop writing local trial-expiry decisions and attach Stripe trial configuration for eligible new subscriptions.
4. Update access guards and billing UI to the Stripe status matrix.
5. Update admin diagnostic/corrective paths that currently assume local trial authority.
6. Ship tests for checkout, webhook idempotency/order handling, and status-based access matrix.
7. Validate with Stripe test mode + CLI replay fixtures, then deploy.

Rollback strategy:
- Keep additive schema fields (no destructive rollback required).
- If needed, temporarily disable new event branches while retaining signature verification.
- Re-enable previous guard behavior only behind a short-lived emergency flag if a production incident occurs.

## Open Questions

None at proposal stage.