## 1. Discovery and architecture alignment

- [x] 1.1 Audit existing navigation, settings modules, entitlement keys, notification events, audit logging, and financial calculation services to identify exact reuse points for CommitGuard
- [x] 1.2 Confirm module naming, route placement, and file layout for CommitGuard across app, lib, prisma, tests, and docs
- [x] 1.3 Produce a short implementation note mapping each new/modified capability spec to target code locations before writing production code

## 2. Data model and tenancy foundation

- [x] 2.1 Add CommitGuard domain entities and enums to prisma/schema.prisma for commitments, detection candidates, and module settings with tenant ownership and lifecycle metadata
- [x] 2.2 Add indexes and constraints for tenant plus due date, tenant plus status, tenant plus renewal date, and tenant plus source query patterns
- [x] 2.3 Generate and review Prisma migration for CommitGuard schema additions without editing historical migration files manually
- [x] 2.4 Update prisma/rls-policies.sql for all new CommitGuard tables and verify tenant isolation behavior is enforced

## 3. Domain services and calculation engine

- [x] 3.1 Implement commitment lifecycle service contracts in lib with create/update/pause/resume/cancel/confirm semantics and audit payload outputs
- [x] 3.2 Implement recurrence projection engine supporting one-off, weekly, fortnightly, monthly, quarterly, six-monthly, annual, and custom schedules
- [x] 3.3 Implement commitment horizon aggregation service for 7/30/60/90 day totals with status-aware filtering and confidence partitions
- [x] 3.4 Implement canonical free-cash service that composes cash available, commitment protection, tax protection, safety buffer, protected cash, free cash, and safety status
- [x] 3.5 Implement renewal and notice-period service that derives INFO/WATCH/ACTION_REQUIRED/URGENT severities from configurable warning windows

## 4. Detection and review workflow

- [x] 4.1 Implement deterministic detection rules with configurable thresholds for recurrence count, interval tolerance, and amount variance
- [x] 4.2 Implement detected commitment review queue actions for confirm, ignore, edit, and not-a-commitment
- [x] 4.3 Implement rejection memory and material-evidence threshold checks to prevent repetitive re-suggestions of rejected items
- [x] 4.4 Expose confidence and source explainability fields in detection outputs and downstream commitment records

## 5. Entitlements, auditing, and notifications

- [x] 5.1 Add CommitGuard feature keys and limits to the canonical subscription feature model in lib/subscriptionPlans.ts and related entitlement helpers
- [x] 5.2 Enforce CommitGuard feature gates and limits through shared requireFeature and hasPlanFeature paths in APIs and server-rendered module surfaces
- [x] 5.3 Add CommitGuard lifecycle and material-change events to the shared audit logging flow
- [x] 5.4 Add COMMITMENT_DUE_SOON, COMMITMENT_AMOUNT_CHANGED, COMMITMENT_RENEWAL_APPROACHING, COMMITMENT_NOTICE_PERIOD_APPROACHING, COMMITMENT_DETECTED, COMMITMENT_SHORTFALL, and COMMITMENT_BUFFER_LOW events to the shared notification framework with dedupe rules

## 6. CommitGuard APIs

- [x] 6.1 Implement app/api/commitguard summary and listing routes with auth, withUserContext tenancy, zod validation, and consistent error responses
- [x] 6.2 Implement app/api/commitguard/commitments create and read/update routes with lifecycle-safe mutation behavior and audit recording
- [x] 6.3 Implement action endpoints for confirm, pause, cancel, and detected-item review operations using server-derived tenant context
- [x] 6.4 Implement timeline and renewals API outputs with horizon and severity metadata ready for dashboard presentation
- [x] 6.5 Add integration-safe API contracts for CashPlan consumption of committed outflow totals and free-cash state

## 7. Dashboard and module UI

- [x] 7.1 Add CommitGuard navigation entry in the existing dashboard navigation architecture without unrelated navigation restructuring
- [x] 7.2 Implement CommitGuard dashboard page with hero metrics for available cash, committed next 30 days, protected cash, and free cash
- [x] 7.3 Implement commitment horizon summary blocks for 7/30/60/90 day totals
- [x] 7.4 Implement upcoming commitments table with search, sorting, filtering, and pagination behavior consistent with existing table patterns
- [x] 7.5 Implement responsive timeline and renewals views with accessible non-color-only risk/status communication
- [x] 7.6 Implement meaningful empty, loading, and error states that only show actions available in product

## 8. Commitment forms and settings UI

- [x] 8.1 Implement add and edit commitment flows with progressive disclosure for advanced fields and full validation feedback
- [x] 8.2 Implement commitment lifecycle controls for pause, resume, cancel, and confirm detected commitment actions
- [x] 8.3 Add CommitGuard settings section within modular settings navigation for horizon defaults, safety buffer strategy, detection thresholds, and alert preferences
- [x] 8.4 Integrate CommitGuard settings into existing settings persistence and import/export behavior

## 9. Cross-module integrations

- [x] 9.1 Integrate CommitGuard committed outflow outputs into CashPlan forecast inputs without duplicating commitment calculations in CashPlan
- [x] 9.2 Integrate Tax Buffer protected cash into canonical free-cash composition with overlap prevention to avoid double counting
- [x] 9.3 Add SpendLeak linkage metadata so waste findings can indicate related active commitments without duplicating SpendLeak analysis
- [x] 9.4 Add CostGuard linkage metadata so cost increase alerts can deep-link to commitment impact context
- [x] 9.5 Add CommitGuard summary card/metrics into dashboard overview using existing overview semantics and plan gating patterns

## 10. Testing and validation

- [x] 10.1 Add unit tests for recurrence edge cases, horizon totals, free-cash math, safety statuses, renewal windows, and confidence classification
- [x] 10.2 Add integration tests for create/update/cancel/pause/confirm flows, tenant isolation enforcement, and entitlement enforcement behavior
- [x] 10.3 Add UI tests for dashboard view, add/edit commitment flows, detected-commitment confirmation, upcoming commitments, and renewal alerts
- [x] 10.4 Run npm run lint, typecheck, test suites, and build; fix regressions and capture validation evidence in the change

## 11. Documentation and rollout

- [x] 11.1 Update docs/DDD.md with CommitGuard module purpose, schema, API routes, settings, and integration contracts
- [x] 11.2 Update docs/HLD.md with CommitGuard architecture role between CostGuard and CashPlan in the FinOps progression
- [x] 11.3 Update docs/runbooks/README.md for any new environment variables or operational settings introduced by CommitGuard
- [x] 11.4 Add concise README/product copy describing CommitGuard free-cash protection behavior and module relationships
- [x] 11.5 Prepare rollout and rollback notes covering feature gating, migration application order, and post-deploy verification steps
