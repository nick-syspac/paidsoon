## Context

See proposal.md for motivation and scope intent. This design defines how RunwayGuard is implemented in the existing PaidSoon FinOps architecture without duplicating forecasting, entitlement, tenancy, or alert infrastructure.

Current constraints that shape design:
- FinOps data is distributed across existing module services (PaidSoon receivables, CashPlan, TaxBuffer, SpendLeak, CostGuard, CommitGuard, MarginGuard).
- Tenant isolation and authorization follow Supabase auth identity + server-side checks + RLS-safe access patterns.
- Entitlements are centrally controlled by existing plan-feature mechanisms and implementation-gated feature controls.
- Forecasting already exists in CashPlan and must remain the preferred source of future cash assumptions.
- Alerts and notifications infrastructure already exists and should be extended rather than replaced.

## Goals / Non-Goals

**Goals:**
- Add a reusable RunwayGuard service layer that computes usable cash, runway, status, confidence, trend, and explainability artifacts.
- Integrate RunwayGuard as a first-class dashboard/module experience with owner-friendly language and clear action guidance.
- Provide standardized scenario/simulation APIs consumable by UI, CommitGuard, MarginGuard, and recommendation flows.
- Persist runway snapshots and transition-aware alert state for trend analytics and non-spam alerting.
- Enforce strict tenant isolation and server-side entitlement checks for all RunwayGuard reads/writes.

**Non-Goals:**
- Replacing CashPlan forecasting internals.
- Rebuilding module-specific analytics engines already owned by MarginGuard, SpendLeak, or CostGuard.
- Introducing a new global notification framework.
- Introducing speculative financial modeling beyond deterministic policy-driven assumptions defined in specs.

## Decisions

### 1) Create a dedicated RunwayGuard domain service layer in lib
Decision:
- Introduce a RunwayGuard service boundary that provides calculation, simulation, driver extraction, confidence scoring, and history retrieval APIs.

Rationale:
- Keeps financial logic deterministic/testable and separate from page/components.
- Enables CommitGuard and other modules to query runway impact via shared interfaces.

Alternatives considered:
- Embedding logic in dashboard routes/components.
  Rejected due to duplication risk, weak testability, and poor reusability.

### 2) Use CashPlan forecast timeline as primary runway engine input
Decision:
- RunwayGuard consumes CashPlan timeline projections where available and performs resilience interpretation on top.
- Fallback estimate path is used only when forecast data is missing, with explicit confidence downgrade and missing-data guidance.

Rationale:
- Avoids duplicate forecasting engines and preserves source-of-truth behavior.

Alternatives considered:
- Independent RunwayGuard forecast engine.
  Rejected to prevent drift from CashPlan and added maintenance burden.

### 3) Define a policy object for runway status thresholds and confidence weighting
Decision:
- Centralize threshold bands, low-confidence inflow weighting, horizon defaults, and alert materiality rules in RunwayGuard settings/policy services.

Rationale:
- Prevents hard-coded threshold spread and allows future plan/tenant overrides.

Alternatives considered:
- Constants scattered per component/route.
  Rejected due to configuration drift and poor governance.

### 4) Model protected cash and inflow reliability as first-class calculation inputs
Decision:
- Usable cash explicitly excludes protected balances (TaxBuffer + protected categories + commitments).
- Inflows are confidence-weighted by invoice status/overdue/dispute/promise characteristics and reliability signals.

Rationale:
- Prevents inflated runway from non-spendable or risky cash assumptions.

Alternatives considered:
- Treating all forecast inflows equally.
  Rejected due to inaccurate runway optimism.

### 5) Snapshot-first trend and alert transitions
Decision:
- Persist periodic runway snapshots with compact metrics and calculation version metadata.
- Alert evaluator compares current vs prior effective state to detect threshold crossings, recovery crossings, and material declines.

Rationale:
- Enables reliable trend analysis and duplicate-alert suppression.

Alternatives considered:
- Stateless alerting from current values only.
  Rejected because it cannot detect transitions and causes repeated alerts.

### 6) Runway scenario engine with standard presets + validated custom inputs
Decision:
- Implement a scenario adapter over base forecast assumptions:
  - Base: no assumption change
  - Conservative: moderate inflow delay/decrease and cost uplift
  - Stress: stronger delay/decrease and cost pressure
  - Custom: server-validated explicit overrides

Rationale:
- Gives consistent owner-level what-if analysis and reusable module integrations.

Alternatives considered:
- UI-only scenario transforms.
  Rejected because server-side enforcement/validation and cross-module use are required.

### 7) Integrate with existing plan entitlements and implementation gates
Decision:
- All RunwayGuard capabilities map to existing plan-feature framework and implementation-gated checks.
- Server routes enforce entitlement before returning runway detail/scenario/advanced data.

Rationale:
- Avoids parallel permission systems and secures API-level access.

Alternatives considered:
- UI-only feature hiding.
  Rejected because it is bypassable and not secure.

## Risks / Trade-offs

- [Risk] Forecast quality varies with integration completeness.
  Mitigation: confidence scoring, explicit missing-data reasons, and setup guidance.

- [Risk] Heavy aggregation could impact request latency.
  Mitigation: snapshot caching, bounded horizons, and background recalculation for expensive paths.

- [Risk] Cross-module contracts can drift over time.
  Mitigation: typed integration adapters, contract tests, and versioned calculation metadata.

- [Risk] Scenario controls can be misread as certainty.
  Mitigation: mandatory estimate labeling and assumption disclosures in UI/API payloads.

- [Risk] Alert noise from frequent recalculation.
  Mitigation: transition-aware deduplication and materiality thresholds.

## Migration Plan

1. Add RunwayGuard data structures and persistence for snapshots/alerts/settings/scenario assumptions (or extend equivalent existing models).
2. Implement service layer and integration adapters in `lib` with deterministic tests.
3. Add API endpoints for runway read models, simulations, recommendations, and settings updates with entitlement + auth enforcement.
4. Add dashboard summary card and RunwayGuard module page with loading/empty/degraded states.
5. Wire CommitGuard and MarginGuard integration points to reusable runway simulation APIs.
6. Integrate alert generation into existing scheduled/background processing with idempotency safeguards.
7. Add docs and feature matrix updates, then validate lint/typecheck/tests/build.

Rollback strategy:
- Feature-gate all RunwayGuard entry points.
- If issues occur, disable gate while retaining snapshot history tables and isolated services without affecting existing modules.
