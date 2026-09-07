## Context

See proposal.md for motivation. The current AI rewrite route (`POST /api/settings/ai`) already enforces authentication, entitlement, and payload validation, then executes the provider call and logs successful usage to `ai_usage_logs`. The data needed for usage-based guardrails already exists, and tier-aware policy inputs are already modelled in the subscription catalog.

## Goals / Non-Goals

**Goals:**
- Enforce monthly quota, rolling hourly cap, and rolling burst cap for AI rewrite requests before provider invocation.
- Derive remaining monthly credits from existing successful usage logs.
- Keep enforcement server-side so client bypass attempts cannot circumvent limits.
- Surface remaining credits and limit feedback to templates UI without changing core template save/edit behavior.

**Non-Goals:**
- Introducing prepaid top-up packs or a persisted credit-ledger model.
- Changing plan pricing or Stripe billing flows.
- Implementing distributed token-bucket infrastructure (Redis) in this change.
- Retrofitting historical cost data beyond existing `ai_usage_logs` records.

## Decisions

### D1: Derived credits over stored ledger
**Decision:** Monthly credits are computed from successful rewrite counts in `ai_usage_logs` rather than a new credit balance table.

**Rationale:** Existing usage logs already capture successful consumption and are sufficient for deterministic monthly allowance enforcement with minimal schema complexity.

**Alternative considered:** A credit ledger with debit/reservation rows. Rejected for this phase due to migration and operational complexity not yet justified by current product needs.

### D2: Multi-window policy checks before provider call
**Decision:** Enforce three checks in order before AI invocation: monthly quota, rolling hourly cap, then rolling burst cap.

**Rationale:** This layered check sequence provides predictable monthly cost bounds while also blocking short-window abuse patterns.

**Alternative considered:** Hourly-only checks. Rejected because it cannot provide a predictable monthly budget ceiling.

### D3: Count only successful rewrites
**Decision:** Limits are consumed only by successful provider responses that produce a usage log row.

**Rationale:** Failed requests should not penalize users or reduce allowance; this aligns billing fairness and existing usage logging semantics.

**Alternative considered:** Count attempts at request start. Rejected due to false consumption during transient provider failures.

### D4: Keep enforcement stateless and DB-backed for now
**Decision:** Use database-window counts from `ai_usage_logs` as the source of truth.

**Rationale:** This keeps enforcement simple and auditable using existing primitives.

**Alternative considered:** Redis token bucket. Rejected for now to avoid introducing infrastructure dependency during first guardrail rollout.

### D5: Acknowledge bounded concurrency overshoot risk
**Decision:** Accept small overshoot risk under concurrent requests in this phase.

**Rationale:** Request-check-plus-log ordering can race without reservation locks; tolerating small overshoot is acceptable for initial rollout and can be hardened later.

**Alternative considered:** Reservation rows or locking semantics before provider invocation. Deferred to a follow-up if observed abuse requires strict hard-stop guarantees.

### D6: Use a single 403 limit contract
**Decision:** Return HTTP 403 with a usage-limit message for monthly, hourly, and burst-cap rejections.

**Rationale:** A single contract keeps client handling simple and aligns with existing entitlement-style rejection behavior for this endpoint.

**Alternative considered:** Use HTTP 429 for burst-cap rejections. Rejected in this phase to avoid split error handling paths in templates UI.

### D7: Use a finite accountant-partner quota
**Decision:** Enforce a high but finite monthly quota for accountant-partner AI rewrite usage.

**Rationale:** Finite quotas preserve cost predictability while still providing materially higher allowance for high-volume partner accounts.

**Alternative considered:** Unlimited quota. Rejected because it removes a deterministic monthly cost ceiling for the feature.

## Risks / Trade-offs

- [Risk] Concurrent requests can pass checks simultaneously near quota boundaries -> Mitigation: monitor near-boundary behavior and add reservation/locking follow-up if overshoot appears in production metrics.
- [Risk] UI and backend policy drift on remaining credits -> Mitigation: treat backend response as source of truth; UI displays only server-provided values.
- [Risk] Policy values become stale relative to pricing strategy -> Mitigation: centralize policy configuration and add explicit task coverage for tests at boundary values.
- [Trade-off] DB count queries add latency to rewrite requests -> Mitigation: keep queries indexed by `userId` and `createdAt` (already indexed on `ai_usage_logs`).

## Migration Plan

1. Introduce policy and usage evaluation helper(s) in `lib/`.
2. Apply guardrail checks in `POST /api/settings/ai` before `rewriteMessage(...)`.
3. Extend route responses to include remaining monthly credits and limit-feedback payload.
4. Update templates UI to display remaining credits and limit messages.
5. Add automated route and UI behavior tests for allowed and blocked cases.
6. Deploy with observability checks on limit rejection rates and successful rewrite volume.

Rollback:
- Revert the route guardrail checks while preserving usage logging if regressions occur.
- UI credit display can be removed independently without data rollback.
