## Context

See proposal.md for motivation and product framing.

Current repository constraints that shape this design:
- User-facing data access is tenant-scoped via authenticated identity plus withUserContext(...) and RLS.
- Financial modules already use deterministic domain services in lib/** with App Router API surfaces under app/api/** and dashboard routes under app/dashboard/**.
- SpendLeak, CostGuard, CashPlan, and Tax Buffer already establish patterns for module-specific settings, alerts, and overview integration.
- Subscription behavior is centralized in the shared plan/feature catalog and enforced by shared entitlement helpers.
- Notification and audit trails exist and must be reused for module events and lifecycle actions.

## Goals / Non-Goals

**Goals:**
- Add CommitGuard as a first-class FinOps module that stores commitments, projects obligations, and computes free cash through one canonical service contract.
- Reuse existing tenancy, authentication, RLS, entitlement, audit, and notification architecture.
- Deliver commitment CRUD, renewal guardrails, deterministic detection review, and dashboard/settings surfaces with integration hooks for CashPlan, SpendLeak, CostGuard, and Tax Buffer.
- Keep all financial calculations deterministic, explainable, and testable with explicit confidence and status semantics.

**Non-Goals:**
- Building a separate AP/procurement product or write-back automation to accounting systems.
- Replacing existing SpendLeak or CostGuard analysis logic.
- Introducing a second notification or audit framework.
- Shipping AI-first commitment detection in v1; initial detection remains deterministic heuristic rules.

## Decisions

### D1. CommitGuard uses a dedicated commitment domain model on shared financial context
Decision:
- Add tenant-scoped commitment entities with lifecycle, recurrence, renewal, source, confidence, essentiality, and notes metadata.
- Keep commitment evidence references linked to shared financial records where available rather than duplicating spend ledgers.

Rationale:
- CommitGuard requires obligation-specific state not represented in existing tables.
- Shared context reuse preserves consistency with the rest of the FinOps platform.

Alternatives considered:
- Derive commitments only at read time from transactions.
: Rejected due to lack of lifecycle control, auditability, and user confirmation workflows.
- Reuse SpendLeak findings tables as commitment storage.
: Rejected because commitments and waste findings have different semantics and lifecycle states.

### D2. Free cash and commitment horizon outputs come from a canonical calculation service
Decision:
- Implement one domain contract that returns cashAvailable, committedCashByHorizon, taxProtectedCash, safetyBuffer, protectedCash, freeCash, and safetyStatus.
- All surfaces (CommitGuard dashboard, overview, CashPlan integration, and API summaries) consume this contract.

Rationale:
- Prevents formula drift and inconsistent thresholds across modules.
- Enables deterministic unit tests for edge cases and confidence partitioning.

Alternatives considered:
- Compute free cash independently in each API and component.
: Rejected because duplicated logic is high-risk for financial inconsistency.

### D3. Recurrence projection is dynamic, not pre-materialized at scale
Decision:
- Store recurrence metadata per commitment and project due instances for requested horizons at query time.
- Persist only required history and state transitions, not bulk future rows.

Rationale:
- Reduces write amplification and stale projection artifacts.
- Supports changing recurrence, amounts, or pause/cancel state without expensive backfills.

Alternatives considered:
- Pre-generate future obligations for 12+ months.
: Rejected due to maintenance complexity and high mutation cost when commitment parameters change.

### D4. Detection and confidence model starts deterministic and configurable
Decision:
- Implement configurable detection heuristics using repeat supplier, interval regularity, and amount tolerance.
- Place candidates in a review queue with confirm/ignore/not-a-commitment actions and rejection memory.

Rationale:
- Explainable behavior is required for trust and auditability.
- Deterministic v1 is faster to validate than opaque model-driven inference.

Alternatives considered:
- AI-only inference pipeline.
: Rejected for v1 due to explainability, controllability, and cost uncertainty.

### D5. API and UI follow existing modular conventions
Decision:
- Add CommitGuard routes under app/api/commitguard/** using zod boundary validation and session-derived identity.
- Add dashboard module routes and settings routes under existing modular navigation patterns.
- Keep filter/sort/search/pagination behavior consistent with current table UX conventions.

Rationale:
- Minimizes architectural drift and onboarding complexity.
- Leverages existing loading/empty/error state patterns and entitlement guardrails.

Alternatives considered:
- Single monolithic route for all CommitGuard operations.
: Rejected because maintainability and permission boundaries degrade quickly.

### D6. Integration boundaries preserve module responsibilities
Decision:
- CommitGuard provides known committed outflow data to CashPlan through shared service interfaces.
- SpendLeak and CostGuard provide linked insights/alerts into commitments without moving their analysis responsibilities into CommitGuard.
- Tax Buffer contributes protected cash to the same free-cash contract with overlap guards to avoid double counting.

Rationale:
- Maintains a clear FinOps progression and avoids circular ownership.

Alternatives considered:
- Merge SpendLeak/CostGuard/CommitGuard logic into a single analytics module.
: Rejected as overly coupled and contrary to existing modular architecture.

### D7. Entitlements, notifications, and audit stay centralized
Decision:
- Add CommitGuard capabilities to central plan feature definitions and enforce via shared feature guards in API and UI.
- Emit CommitGuard events through existing notification pipelines with deduping behavior.
- Record lifecycle and material field changes through existing audit mechanisms.

Rationale:
- Aligns with existing policy and avoids fragmented compliance behavior.

Alternatives considered:
- Module-local entitlement, notification, or audit mechanisms.
: Rejected as policy-inconsistent and high-maintenance.

## Risks / Trade-offs

- [Risk] Recurrence edge cases (month-end, leap year, due-today, timezone boundaries) can cause projection errors.
  -> Mitigation: isolate recurrence engine, add explicit edge-case tests, and normalize date handling with existing project conventions.

- [Risk] Tax Buffer and CommitGuard may overlap in protected-cash semantics.
  -> Mitigation: define protected-cash composition contract and overlap-prevention rules in shared calculation service.

- [Risk] Deterministic detection may under-detect early on.
  -> Mitigation: expose configurable thresholds, confidence tiers, and manual commitment creation as primary workflow.

- [Risk] Plan-gated feature rollout can produce confusing UX if not surfaced clearly.
  -> Mitigation: reuse existing gated-preview and upgrade messaging patterns in API + UI responses.

- [Risk] Commitment updates can invalidate downstream CashPlan snapshots.
  -> Mitigation: add explicit recalculation triggers/event hooks and integration tests for forecast refresh behavior.

## Migration Plan

1. Add CommitGuard schema entities, indexes, and relations in prisma/schema.prisma.
2. Generate migration and update RLS policies for all new tenant-scoped tables.
3. Implement domain services for commitment lifecycle, recurrence projection, renewal windows, and free-cash calculation with unit tests.
4. Add API routes with auth, entitlement checks, tenancy isolation, validation, and audit writes.
5. Build dashboard and settings UI routes, then wire navigation and overview summary integration.
6. Integrate CashPlan input contract plus SpendLeak/CostGuard linkage metadata and Tax Buffer protected-cash composition.
7. Wire notifications and dedupe behavior into existing event framework.
8. Add integration/UI tests for core flows and module boundaries.
9. Update DDD/HLD/runbook documentation with schema, API, settings, and integration contracts.
10. Run lint, typecheck, tests, and build before applying implementation.

Rollback strategy:
- Gate CommitGuard exposure by centralized feature flags/entitlements while retaining non-destructive schema additions.
- Disable navigation and API exposure if needed without deleting historical commitment data.

## Open Questions

No blocking open questions for apply.

Design defaults locked for v1 implementation:
- Commitments retain source currency and amount per record; free-cash and horizon summaries run in tenant base currency using existing conversion policy where available, otherwise they use source currency with explicit unsupported-mix warnings.
- Deterministic detection runs on demand and after completed ingestion sync events; no always-on background detector is required for v1.
- Renewal warning defaults are globally seeded (90/60/30/14/7 days) and user-overridable in CommitGuard settings.
