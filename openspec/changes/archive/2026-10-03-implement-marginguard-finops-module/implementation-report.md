# MarginGuard FinOps Module — Implementation Report

Date: 2026-09-09
Change: implement-marginguard-finops-module

## Scope Delivered

MarginGuard is implemented as a first-class FinOps module with:
- Deterministic margin analytics and confidence scoring.
- Target and threshold configuration with scoped overrides.
- Cost classification rules and manual classification precedence.
- Alerting lifecycle with event history.
- Opportunity generation with cross-module signal inputs.
- Dashboard and settings UX with entitlement-gated access.
- Export datasets (CSV/XLSX) for summary, customers, alerts, opportunities.
- Scheduled snapshot/alert/opportunity processing via secure cron endpoint.

## Modified Components

Core domain and services:
- lib/marginguard/engine.ts
- lib/marginguard/classification.ts
- lib/marginguard/service.ts
- lib/marginguard/alertJob.ts
- lib/marginguard/opportunityJob.ts
- lib/marginguard/snapshotJob.ts
- lib/marginguard/export.ts
- lib/marginguard/entitlements.ts

API routes:
- app/api/margin-guard/summary/route.ts
- app/api/margin-guard/trends/route.ts
- app/api/margin-guard/breakdowns/route.ts
- app/api/margin-guard/customers/route.ts
- app/api/margin-guard/settings/route.ts
- app/api/margin-guard/targets/route.ts
- app/api/margin-guard/classifications/route.ts
- app/api/margin-guard/classifications/[id]/route.ts
- app/api/margin-guard/rules/route.ts
- app/api/margin-guard/alerts/route.ts
- app/api/margin-guard/alerts/[id]/route.ts
- app/api/margin-guard/alerts/[id]/events/route.ts
- app/api/margin-guard/scenarios/route.ts
- app/api/margin-guard/export/route.ts
- app/api/settings/margin-guard/route.ts
- app/api/cron/margin-guard-snapshots/route.ts

UI and navigation:
- app/dashboard/margin-guard/page.tsx
- app/dashboard/settings/margin-guard/page.tsx
- app/dashboard/page.tsx
- app/dashboard/settings/import-export/page.tsx
- components/settings/MarginGuardSettingsClient.tsx
- components/settings/MarginGuardExportClient.tsx
- components/settings/ImportExportSettingsView.tsx
- components/dashboard/DashboardMain.tsx
- components/dashboard/DashboardNavRail.tsx
- lib/settings/navigation.ts
- lib/settings/importExportRoutes.ts
- lib/dashboard/marginguardAccess.ts

## Migrations And Data Policy

Schema/RLS updates:
- prisma/schema.prisma
- prisma/rls-policies.sql
- prisma/migrations/20260908214346_add_marginguard_foundation/migration.sql
- prisma/migrations/20261008113000_marginguard_alert_digest_mode/migration.sql

Migration status at verification time:
- `npx prisma migrate status` reports one unapplied migration in the connected environment:
  - 20261008113000_marginguard_alert_digest_mode

## Background Jobs And Scheduler

Implemented jobs:
- Snapshot generation and upsert logic (idempotent by tenant/period).
- Alert evaluation and lifecycle update logic.
- Opportunity sweep with cross-module signals.

Scheduler wiring:
- vercel.json includes `/api/cron/margin-guard-snapshots` at `0 4 * * *`.
- Cron endpoint protected by `Authorization: Bearer CRON_SECRET`.

## Permissions And Entitlements

Feature gating integrated through existing entitlement architecture:
- `marginguard_core` for module access and settings.
- `marginguard_alerts` for alerts inbox/lifecycle.
- `marginguard_scenarios` for scenario modeling.
- `marginguard_customer_analysis` for customer profitability view.
- `csv_export` + `marginguard_core` for MarginGuard export route.

## Cross-Module Integration

MarginGuard opportunity and context logic now consumes explicit signals from:
- SpendLeak (open finding count and estimated monthly removable spend).
- Cost Guard (latest forecast variance).
- CommitGuard (commitments due in next 30 days).
- CashPlan (latest buffer gap via plan-scoped snapshot relation).

Tax Buffer separation is preserved as an explicit assumption in summary/opportunity evidence.

## Test Coverage Added/Updated

New/updated tests include:
- tests/marginguard-engine.test.ts
- tests/marginguard-classification.test.ts
- tests/marginguard-snapshot-job.test.ts
- tests/marginguard-alert-job.test.ts
- tests/marginguard-opportunity-job.test.ts
- tests/marginguard-settings-route.test.ts
- tests/marginguard-export-route.test.ts
- tests/marginguard-page.test.ts
- tests/marginguard-settings-page.test.ts
- tests/marginguard-routes-security.test.ts
- tests/settings-import-export-page.test.ts

Coverage intent by task:
- 12.1: formulas, completeness/confidence, thresholds, edge cases, classification precedence, scenario math paths.
- 12.2: authn/authz validation, entitlement denials, request validation errors, and alert lifecycle transitions.
- 12.3: key journeys validated across page + route integration tests (summary/customer views, target updates, classification apply validation, alert acknowledge/resolve paths, scenario execution).

## Verification Results

Completed checks:
- `npm run lint` (0 errors; existing unrelated warning remains in tests/cost-guard-foundation.test.ts)
- `npx tsc --noEmit` (pass)
- `npm run build` (pass)
- `npm run test` (pass: 979 tests, 0 failures)
- `npm run verify-rls` (pass)
- Regression scan for TODO/FIXME/placeholder performed on MarginGuard-touched scope.

Migration-from-clean verification note:
- Non-destructive clean-baseline schema materialization was executed via:
  - `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`
- Full migrations-directory diff from empty (`--to-migrations`) is blocked in this repo configuration without a `datasource.shadowDatabaseUrl` in prisma.config.ts.

## Documentation Updated

- docs/DDD.md
- docs/HLD.md
- docs/preview-seed-data.md
- docs/runbooks/README.md
- docs/runbooks/vercel.md

Updates include:
- MarginGuard module inventory and architecture status.
- Export API documentation (`GET /api/margin-guard/export`).
- Seed scenario coverage for healthy/watch/critical and deterioration.
- Cron and environment references for MarginGuard snapshot scheduling.

## Limitations

- The connected database environment still has one unapplied migration according to `prisma migrate status`; deployment pipelines must run migrate deploy for hosted environments.
- Migrations-directory-from-empty diff requires shadow DB configuration if strict migration-chain SQL generation is required in CI.
- Existing non-MarginGuard placeholder references remain in historical docs and unrelated features; no new placeholder debt was introduced in MarginGuard implementation scope.

## Next Improvements

1. Add CI gating for `lint`, `tsc --noEmit`, `build`, and `test` on pull requests.
2. Add CI-safe migration-chain verification with configured shadow database.
3. Add targeted integration tests for `/api/margin-guard/alerts/[id]/events` and `/api/margin-guard/classifications/[id]` update flows.
4. Add deeper UI interaction tests for settings client state transitions (rule preview/apply result rendering and threshold validation messages).
