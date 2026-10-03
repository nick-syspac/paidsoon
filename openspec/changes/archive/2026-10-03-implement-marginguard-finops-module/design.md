## Context

See proposal.md for motivation and scope.

PaidSoon is a Next.js App Router TypeScript application with strict RLS-enforced tenant isolation via `withUserContext(userId, tx => ...)`, canonical financial records in Prisma (`FinancialInvoice`, `FinancialPayment`, spend import/bill tables), and module-centric dashboard/settings architecture. Existing FinOps modules (SpendLeak, CostGuard, CashPlan, CommitGuard, Tax Buffer) already establish conventions for:

- module navigation and entitlement-gated visibility
- module settings under `dashboard/settings/*`
- deterministic domain services in `lib/*`
- event/audit models with dedupe keys
- cron/worker orchestration and idempotent upserts
- test coverage split across unit/domain + API/security behaviors

MarginGuard must integrate into these conventions without creating duplicate transaction stores, duplicate auth or settings frameworks, or request-time heavy recomputation.

## Goals / Non-Goals

**Goals:**
- Introduce MarginGuard as a first-class FinOps module with dashboard, settings, APIs, and background processing.
- Compute explainable gross-profit and margin analytics from canonical revenue/cost data using safe arithmetic and deterministic status/confidence logic.
- Enforce tenant isolation, entitlement checks, and audit/event history consistent with current platform patterns.
- Reuse canonical spend/cost/invoice/payment sources and existing module outputs rather than copying business facts.
- Support incremental rollout where each phase leaves the app functional.

**Non-Goals:**
- Building a full accounting ledger or replacing upstream accounting systems.
- Introducing new authentication, RBAC, or notification frameworks outside existing architecture.
- Creating AI-only opaque recommendations; deterministic rule-based calculations remain the baseline.
- Reworking unrelated modules or changing chase/reminder business behavior.

## Decisions

### 1. Add MarginGuard data model as tenant-scoped metadata and derived snapshots
Decision:
- Add MarginGuard-specific tables for settings, targets/overrides, cost classification metadata/rules, alerts/events, periodic snapshots, scenarios, and opportunities.
- Reference canonical entities (financial invoices/payments, imported bills/transactions, contacts/customers, categories/suppliers) via foreign keys or source references.

Rationale:
- Keeps single source of truth for financial transactions while enabling module-specific behavior/state.
- Aligns with existing pattern in Tax Buffer, CommitGuard, and CostGuard where derived state is persisted for performance and traceability.

Alternatives considered:
- Alternative A: Persist no MarginGuard tables, compute everything on demand. Rejected due to performance and poor trend/audit support.
- Alternative B: Duplicate transaction rows into MarginGuard tables. Rejected due to source-of-truth drift and reconciliation risk.

### 2. Use snapshot-first analytics for trend and deterioration detection
Decision:
- Persist periodic `margin_snapshots` (daily or configured interval) with period, amounts (in cents), percentages (fixed precision), completeness, and calculation metadata.
- Read dashboard trend and deterioration checks primarily from snapshots; recalc on sync/import deltas and scheduled jobs.

Rationale:
- Prevents request-time full-history scans across large transaction sets.
- Supports reliable trend comparisons and alert debouncing.

Alternatives considered:
- Alternative A: Compute trend series per request from raw transactions. Rejected for scaling risk.
- Alternative B: Materialized views only. Deferred; operational complexity is higher than needed for current architecture.

### 3. Centralize MarginGuard calculations in a reusable domain layer
Decision:
- Implement formula and status functions in `lib/marginguard/*` (or equivalent module domain path), not in React components.
- Required deterministic functions include gross profit, gross margin, contribution margin (when complete), target variance, required price, scenario impact, completeness, and status severity.

Rationale:
- Enables precise unit testing and consistent values across API/UI/background jobs.
- Matches existing separation used by CostGuard/Tax Buffer/CashPlan domain layers.

Alternatives considered:
- Alternative A: Component-local calculations. Rejected because values diverge and become hard to test.

### 4. Reuse existing entitlement and settings navigation architecture
Decision:
- Add MarginGuard feature flags/capabilities to `lib/subscriptionPlans.ts` and gate navigation/routes through existing `hasPlanFeature`/`requireFeature` patterns.
- Add MarginGuard settings under existing settings nav groups and route conventions.

Rationale:
- Avoids entitlement checks scattered in UI and API logic.
- Preserves predictable behavior for upgrades/downgrades and existing plan matrix.

Alternatives considered:
- Alternative A: Ad hoc entitlement checks in each component. Rejected for maintainability and policy drift risk.

### 5. Classification precedence model: manual override > rule > default
Decision:
- Apply classification rules in priority order (`active`, highest priority first), but always preserve explicit per-transaction manual classifications unless user clears/changes them.
- Support preview mode before bulk application; record rule/classification events.

Rationale:
- Delivers predictable behavior for users and avoids automation unexpectedly overwriting intentional data corrections.

Alternatives considered:
- Alternative A: Rules always override manual edits. Rejected as unsafe and user-hostile.

### 6. Alert and opportunity generation remains deterministic and explainable
Decision:
- Alert severity derives from configured thresholds and observed metrics; opportunities derive from explicit rule conditions and estimated impact formulas.
- Each alert/opportunity stores evidence payload and completeness confidence.

Rationale:
- Financial trust requires traceability and reproducibility.
- Keeps room for future AI summarization while preserving deterministic baseline.

Alternatives considered:
- Alternative A: AI-generated recommendations without deterministic counterpart. Rejected for trust and auditability concerns.

### 7. Follow existing API shape, validation, and RLS context patterns
Decision:
- Add `/app/api/margin-guard/*` routes using current route conventions: auth via Supabase user, Zod validation, RLS-scoped access via `withUserContext`, safe response DTOs.
- No route accepts tenant identity from client payload.

Rationale:
- Maintains security invariants and consistency with existing API implementation.

Alternatives considered:
- Alternative A: direct client reads over mixed server/admin contexts. Rejected due to isolation and auditing risk.

### 8. Integrate module summaries and status into existing FinOps composition points
Decision:
- Add concise MarginGuard summary card to dashboard overview composition logic and nav rail.
- Expose normalized module status (`healthy`, `watch`, `warning`, `critical`, `insufficient_data`) for broader FinOps health composition.

Rationale:
- Makes MarginGuard discoverable and actionable without duplicating dashboard aggregation patterns.

Alternatives considered:
- Alternative A: Isolated module with no overview presence. Rejected because it weakens cross-module utility.

## Risks / Trade-offs

- [Risk] Incomplete or misclassified costs produce false confidence. -> Mitigation: first-class completeness scoring, confidence states, and explicit suppression of high-confidence outputs when completeness is low.
- [Risk] Snapshot jobs create duplicate or inconsistent records under retries. -> Mitigation: deterministic tenant-period keys, upsert semantics, and dedupe keys for alert events.
- [Risk] Performance regression from unindexed aggregation queries. -> Mitigation: add targeted indexes and rely on snapshots for trend workloads.
- [Risk] Entitlement drift between UI and API. -> Mitigation: central feature flags plus server-side route enforcement; UI only reflects allowed actions.
- [Risk] Cross-module semantic mismatch (CostGuard/SpendLeak category meaning). -> Mitigation: explicit mapping contract in MarginGuard foundation and integration tests.
- [Risk] Users interpret outputs as formal financial advice. -> Mitigation: product language and contextual disclaimers that outputs are decision support from available data.

## Migration Plan

1. Schema phase
- Add new MarginGuard tables and relations in `prisma/schema.prisma`.
- Generate migration and update `prisma/rls-policies.sql` with tenant policies.
- Validate from clean DB and run `npm run verify-rls`.

2. Domain phase
- Implement `lib/marginguard` calculation, completeness, threshold, classification precedence, and status functions.
- Add robust unit tests for formulas and edge cases.

3. API phase
- Add margin summary/trends/breakdowns/customers/alerts/settings/classification/scenario routes.
- Apply auth + Zod + entitlement + RLS transaction patterns.
- Add API tests for validation, isolation, and lifecycle transitions.

4. UI phase
- Add dashboard module page, reusable cards/charts/tables, explainability blocks, empty states, and onboarding helpers.
- Add settings pages and forms under existing module settings structure.
- Add overview summary tile and nav links.

5. Background processing phase
- Add snapshot and alert evaluation jobs using existing scheduler/worker conventions.
- Ensure idempotency, retry-safety, observability logs, and dedupe event behavior.

6. Integration and productization phase
- Wire cross-module integration points and export/report options where infrastructure exists.
- Add entitlement matrix updates, seed/demo data, and end-to-end documentation updates.

7. Verification and rollout
- Run tests, lint, typecheck, build, migration validation, and TODO/FIXME scans.
- Confirm no duplication of canonical financial sources and no RLS regressions.

Rollback strategy:
- Keep MarginGuard behind entitlement/enablement flags during rollout.
- If issues occur, disable MarginGuard feature flags and pause background evaluators; existing core modules continue operating.
- Schema rollback follows standard Prisma migration rollback procedures for non-production and forward-fix in production.

## Open Questions

- Should historical snapshot cadence default to daily for all tiers, or vary by entitlement level for storage/performance control?
- Which exact product/service canonical dimension should be primary for profitability grouping in tenants that lack explicit product catalogs?
- Should margin alerts share a unified inbox with other module alerts immediately, or start with module-scoped alert views and then converge?
