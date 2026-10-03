## Context

See proposal.md for motivation and product framing.

Current repository state that shapes this design:
- Tenant-scoped application behavior is enforced via withUserContext(...) + Postgres RLS policies.
- Financial modules already follow a pattern of deterministic domain engines in lib/** and dashboard/API surfaces in app/dashboard/** + app/api/**.
- Cost Guard and SpendLeak already model explainability, confidence, and module-level states (loading/empty/stale).
- CashPlan already has a schema and domain engine for planning outputs, buffer targets, snapshots, overrides, and alerts, but limited dedicated module UI.
- Accounting provider integrations are isolated behind provider-agnostic interfaces and normalized records.
- Import/export and notification/digest infrastructure already exist and should be reused rather than duplicated.

## Goals / Non-Goals

**Goals:**
- Introduce Tax Buffer as a first-class module that computes required tax reserves and safe-to-spend outputs.
- Reuse existing financial data ingestion, tenancy/RLS, feature entitlement, notification, and dashboard patterns.
- Keep calculations deterministic, explainable, and confidence-scored.
- Persist reserve history and overrides in an auditable, tenant-scoped model.
- Integrate Tax Buffer outputs into dashboard overview and CashPlan-compatible commitment surfaces.

**Non-Goals:**
- BAS lodgement, tax filing, statutory reporting, or tax-agent workflows.
- Building a separate accounting ledger or provider-specific tax engines in UI/controllers.
- Creating a second permissions or notifications framework.
- Shipping every advanced forecasting feature in v1 (historical charts and adviser workflows may be phased).

## Decisions

### D1. Tax Buffer uses a dedicated domain model but shared financial inputs
Decision:
- Add Tax Buffer entities for configuration, reserve categories, obligations, snapshots, and overrides.
- Continue consuming canonical financial data (invoices, payments, spend, supplier/category signals) from existing normalized and imported sources.

Rationale:
- Tax reserve behavior needs state not currently represented in CashPlan or Cost Guard tables.
- Reusing shared inputs avoids duplicate ingestion paths and provider lock-in.

Alternatives considered:
- Extend only existing CashPlan tables.
: Rejected because Tax Buffer requires category-specific settings, manual override lineage, tax frequency rules, and obligation semantics that would overfit the current CashPlan model.
- Compute everything on read without persistence.
: Rejected due to explainability/audit/history requirements.

### D2. Safe-to-spend is a shared computed contract
Decision:
- Publish a normalized summary contract from Tax Buffer service:
  availableCash, totalRequiredReserve, totalReserved, reserveGap, safeToSpend, healthStatus, warnings.
- Dashboard overview and CashPlan status panels consume this contract rather than recomputing logic independently.

Rationale:
- Prevents drift between module views.
- Makes Safe to Spend the cross-module control metric with one source of truth.

Alternatives considered:
- Compute safe-to-spend separately in each UI/API surface.
: Rejected because it causes inconsistent values and harder testing.

### D3. Calculations are method-driven and basis-aware
Decision:
- Per-category methods are stored in Tax Buffer settings (fixed amount, percentage of revenue/profit, manual, integration-derived where possible).
- GST behavior is explicitly basis-aware (cash vs accrual) via configuration.
- Each output includes data source and confidence metadata.

Rationale:
- Matches real-world data variability and avoids false precision.
- Enables future provider enhancements without changing domain contracts.

Alternatives considered:
- Single universal formula for all tenants.
: Rejected because business type, accounting basis, and data maturity differ.

### D4. Provider-specific tax parsing remains adapter-local
Decision:
- Extend accounting provider normalization to expose tax-relevant metadata when available (for example tax code/GST amount fields).
- Keep Tax Buffer domain provider-agnostic.

Rationale:
- Maintains clean boundaries already established in lib/providers/accounting.
- Supports Xero/MYOB parity and future providers.

Alternatives considered:
- Put Xero/MYOB conditionals directly in Tax Buffer services.
: Rejected as a layering violation and long-term maintenance risk.

### D5. API and UI follow existing module conventions
Decision:
- Add new Tax Buffer API routes under app/api/tax-buffer/** with zod validation, session user resolution, and withUserContext queries.
- Add Tax Buffer dashboard pages under app/dashboard/tax-buffer/** and settings pages under app/dashboard/settings/tax-buffer/**.
- Add navigation link via existing DashboardNavRail pattern and entitlement checks.

Rationale:
- Minimizes architectural surprise and reuses access/state handling patterns.

Alternatives considered:
- Build Tax Buffer entirely inside existing dashboard overview route.
: Rejected because module-level workflows (setup, obligations table, overrides) need dedicated surfaces.

### D6. Entitlements integrate with central feature catalog
Decision:
- Add Tax Buffer-related feature keys in the subscription feature catalog and gate APIs/UI through existing requireFeature and hasPlanFeature checks.
- Keep plan behavior progressive by features, not tier-name branching.

Rationale:
- Existing billing/entitlement architecture already supports this and aligns with repo policy.

Alternatives considered:
- Hard-code tier checks in components.
: Rejected as brittle and inconsistent with current architecture.

### D7. Notifications and audit reuse existing event patterns
Decision:
- Emit Tax Buffer state-change and recommendation events for digest/immediate notification pipelines.
- Persist override and configuration changes as auditable events with actor and reason.

Rationale:
- Reuses existing product behavior for non-spammy, state-aware notifications.

Alternatives considered:
- Build a Tax Buffer-specific notification engine.
: Rejected due to duplication and policy inconsistency.

## Risks / Trade-offs

- [Risk] Provider tax metadata coverage is uneven across tenants and integrations.
  -> Mitigation: confidence bands, explicit source labels, fallback methods, and unknown-state messaging instead of forcing zeros.

- [Risk] Safe-to-spend may conflict with legacy assumptions in dashboard copy.
  -> Mitigation: single computed contract, shared formatter helpers, and acceptance tests across module surfaces.

- [Risk] Scope expansion from advanced tax categories and forecasting.
  -> Mitigation: phase v1 to core categories and recommendation flow; capture advanced modelling in deferred tasks.

- [Risk] Overlap with CashPlan commitments could duplicate obligations.
  -> Mitigation: shared obligation identifiers and mapping layer; Tax Buffer references/augments existing commitments where possible.

- [Risk] Manual overrides can mask bad source data.
  -> Mitigation: always store calculated vs override values, require reason, show override badges in UI.

## Migration Plan

1. Add schema changes for Tax Buffer tables and relations in prisma/schema.prisma.
2. Generate and apply migration, then update prisma/rls-policies.sql with tenant-scoped policies.
3. Implement Tax Buffer domain service and pure calculation functions with tests first.
4. Add API routes and entitlement guards.
5. Add dashboard/settings UI and navigation entry.
6. Integrate overview safe-to-spend card and CashPlan summary contract.
7. Add notification wiring and audit event writes.
8. Update docs (DDD/HLD/runbook matrix and module doc).
9. Validate with lint, typecheck, targeted tests, and verify-rls.

Rollback strategy:
- Feature-gate Tax Buffer surfaces off by entitlement/config flag while retaining migrations.
- Revert route exposure and navigation links without destructive data rollback.

## Open Questions

No blocking open questions for v1.

Design defaults locked for this change:
- Tax Buffer export endpoints are deferred; v1 focuses on reserve calculation, settings, dashboard, obligations, and integration contracts.
- Notification rollout starts with in-app status and digest-friendly event production, with email delivery behind existing notification preferences.
- For tenants without reliable account-balance feeds, available cash uses explicit manual entry or existing stored balance inputs and is marked with reduced confidence.
