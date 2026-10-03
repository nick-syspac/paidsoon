## Why

PaidSoon currently helps operators collect cash and identify spend risk, but it does not provide a canonical view of cash already committed to upcoming obligations. CommitGuard is needed now to prevent accidental overspending by turning known commitments, tax protection, and safety buffers into a single free-cash decision surface that integrates with existing FinOps modules.

## What Changes

- Add CommitGuard as a first-class FinOps module with secure tenant-scoped commitment records, lifecycle states, recurrence, renewals, and confidence/source metadata.
- Add deterministic commitment forecast and free-cash domain services that produce 7/30/60/90-day committed totals, protected cash totals, and safety statuses (SAFE, WATCH, AT_RISK, SHORTFALL).
- Add CommitGuard API routes for summary, upcoming horizon views, timeline/renewals, commitment CRUD, and detected-commitment review actions using existing auth, RLS, entitlement, audit, and notification patterns.
- Add CommitGuard dashboard and settings surfaces inside existing navigation and modular settings architecture, including useful empty states and responsive data presentation.
- Integrate CommitGuard with Tax Buffer (no double-counting), CashPlan (known outflow input), SpendLeak (waste signal linkage), and CostGuard (commitment-change linkage).
- Extend shared notification and entitlement models for CommitGuard events and feature gating.
- Add tests for recurrence, horizon math, free-cash calculations, renewal windows, status logic, API tenancy/entitlement enforcement, and core CommitGuard UI flows.
- Update architecture and runbook documentation for CommitGuard behavior, schema, APIs, settings, entitlements, and integration boundaries.

## Capabilities

### New Capabilities
- `commitguard-foundation`: Commitment domain model, category/frequency/source/confidence/status abstractions, tenant ownership, persistence, and baseline query patterns.
- `commitguard-forecast-and-free-cash`: Deterministic recurrence projection, horizon totals, protected cash aggregation, safety buffer handling, and canonical free-cash calculation/status service.
- `commitguard-dashboard`: CommitGuard dashboard UX with hero metrics, commitment horizon summaries, upcoming commitments table, timeline/forecast views, and clear empty states.
- `commitguard-commitment-lifecycle`: Commitment CRUD and lifecycle actions (create, edit, pause, cancel, confirm, classify) with audit trail and non-destructive history handling.
- `commitguard-renewal-guard`: Renewal and notice-period alerting model, severity derivation, and renewals-focused user views.
- `commitguard-detection-review`: Deterministic recurring-commitment detection heuristics, confidence scoring, review queue, and rejection memory.
- `commitguard-settings`: Module settings for horizon defaults, safety buffer strategy, detection thresholds, and alert preferences.
- `commitguard-notifications`: CommitGuard events integrated into the shared notification pipeline and user preference controls.

### Modified Capabilities
- `dashboard-overview`: Add CommitGuard metrics/cards (committed cash, free cash, status) to FinOps overview with consistent semantics.
- `implementation-gated-entitlements`: Add CommitGuard feature gating and limits through centralized entitlement checks.
- `subscription-plan-tiers`: Extend plan capability matrix with CommitGuard allowances aligned to the current canonical PaidSoon plan catalog.
- `cost-guard-alerts`: Surface commitment-change linkage from CostGuard without duplicating CostGuard analysis responsibilities.
- `spendleak-insights`: Surface SpendLeak-to-CommitGuard linkage so potentially wasteful commitments remain visible as obligations until changed.
- `settings-import-export`: Include CommitGuard settings in existing modular settings persistence/import-export behavior where applicable.

## Impact

- Database: New tenant-scoped commitment entities and supporting indexes/constraints; potential settings and detection-review persistence extensions.
- API: New `app/api/commitguard/*` route family and shared validation/service wiring.
- Domain services: New FinOps calculation and detection services plus integrations into CashPlan, CostGuard, SpendLeak, and Tax Buffer aggregation.
- UI: New dashboard and settings screens/components, plus overview/navigation updates.
- Entitlements and notifications: Centralized plan feature map and event catalog updates.
- Testing and docs: Expanded tests and documentation to keep implementation and architecture contracts in sync.
