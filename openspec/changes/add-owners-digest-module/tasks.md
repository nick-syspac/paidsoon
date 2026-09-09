# Add Owner's Digest Module Tasks

## 1. Discovery And Contract Mapping

- [x] 1.1 Audit the existing FinOps module routes, domain services, digest-style helpers, settings pages, entitlement keys, worker jobs, and email pathways to map exact Owner's Digest reuse points.
- [x] 1.2 Confirm the target Owner's Digest route, dashboard-navigation placement, settings-navigation placement, and historical snapshot access pattern against the current dashboard architecture.
- [x] 1.3 Produce a short implementation note mapping each new and modified capability spec to concrete `app/`, `lib/`, `prisma/`, `worker/`, `tests/`, and `docs/` targets before production code changes begin.

## 2. Schema And RLS Foundation

- [x] 2.1 Add Owner's Digest Prisma models and enums for tenant-scoped settings, digest snapshots, digest items, key metrics, provider execution metadata, and delivery state.
- [x] 2.2 Add uniqueness constraints and indexes for tenant plus period, tenant plus generated-at ordering, digest plus item ordering, and delivery idempotency query paths.
- [x] 2.3 Generate the Prisma migration for the new Owner's Digest schema without editing historical migration files manually.
- [x] 2.4 Update `prisma/rls-policies.sql` so every new Owner's Digest table is tenant-isolated and protected by the existing RLS approach.
- [x] 2.5 Validate the migration from a clean database state and run RLS verification to confirm cross-tenant digest isolation.

## 3. Owner's Digest Domain Types And Persistence

- [x] 3.1 Implement shared Owner's Digest domain types for status, severity, signal payloads, snapshot summaries, key metrics, provider results, and regeneration metadata.
- [x] 3.2 Implement repository and service helpers to create, read, list, and load canonical digest snapshots by tenant, frequency, and reporting period.
- [x] 3.3 Implement current-period regeneration behavior so explicit refreshes reuse the same canonical tenant-period digest identity while historical periods remain immutable.
- [x] 3.4 Implement persistence for data-as-of timestamps, provider completeness, and generation audit metadata so degraded digests are explainable.

## 4. Signal Provider Registry And Adapters

- [x] 4.1 Implement the shared digest signal provider interface and provider registry in a new `lib/ownersDigest` domain package.
- [x] 4.2 Add a PaidSoon provider that emits materially relevant receivables and promise-to-pay signals with source drill-down context.
- [x] 4.3 Add SpendLeak and CostGuard providers that emit savings, recurring-spend, duplicate-spend, and cost-anomaly signals using existing deterministic services.
- [x] 4.4 Add CashPlan, Tax Buffer, CommitGuard, MarginGuard, and RunwayGuard providers that translate their existing deterministic outputs into digest signals and freshness metadata.
- [x] 4.5 Add provider result normalization so modules with no material findings, stale inputs, or expected unavailability return explicit non-failure states without fabricated digest items.

## 5. Scoring, Materiality, Correlation, And Summary Engine

- [x] 5.1 Implement centralized severity weights, materiality thresholds, urgency rules, and actionability rules for Owner's Digest priority scoring.
- [x] 5.2 Implement deterministic ranking and section assignment for needs-attention, opportunities, positive changes, and informational context.
- [x] 5.3 Implement correlation and deduplication rules that merge overlapping liquidity or cost-pressure signals while preserving links back to contributing modules.
- [x] 5.4 Implement overall business-status calculation for Healthy, Watch, Action Required, and Critical with explainable status reasons.
- [x] 5.5 Implement deterministic summary-copy generation that works with AI disabled and uses only structured digest results.

## 6. Entitlements, Permissions, And Settings

- [x] 6.1 Add Owner's Digest feature flags and progressive coverage entitlements to the canonical subscription-plan and feature-checking logic.
- [x] 6.2 Enforce Owner's Digest view, configure, regenerate, and delivery actions through existing server-side entitlement and authorization checks.
- [x] 6.3 Add Owner's Digest to the dashboard and settings navigation models with entitlement-aware visibility.
- [x] 6.4 Implement tenant-scoped Owner's Digest settings defaults and validation for enablement, frequency, delivery day, delivery time, timezone, included sections, maximum action items, and minimum materiality.
- [x] 6.5 Implement recipient-scope rules so only authorised users or approved tenant-recipient roles can receive Owner's Digest emails.

## 7. Owner's Digest APIs And Internal Jobs

- [x] 7.1 Implement authenticated API or server-action read paths for the current Owner's Digest snapshot, digest history, and individual historical digest views using existing safe response patterns.
- [x] 7.2 Implement authenticated settings read and update paths with Zod validation and tenant-scoped persistence.
- [x] 7.3 Implement a guarded current-period regenerate action with cooldown or throttling behavior aligned to existing operational patterns.
- [x] 7.4 Add the internal jobs route for scheduled Owner's Digest generation and delivery using the existing `INTERNAL_JOBS_SECRET` pattern.
- [x] 7.5 Ensure scheduled retries and manual regeneration remain idempotent at the tenant-period level and do not duplicate digest records or sends.

## 8. Dashboard, History, And Overview UI

- [x] 8.1 Build the Owner's Digest dashboard page with executive summary, last-generated metadata, data-freshness status, and mobile-first layout.
- [x] 8.2 Build the needs-attention, opportunities, positive changes, and key-numbers sections with accessible severity/status semantics and deep links back to source modules.
- [x] 8.3 Build the digest history list and historical snapshot view so prior periods can be opened without recalculation.
- [x] 8.4 Add empty states for no data, insufficient history, and no significant issues, plus degraded-completeness messaging for stale or failed providers.
- [x] 8.5 Add the compact Owner's Digest summary card to the main dashboard overview without duplicating the full digest content inline.

## 9. Email Delivery, Scheduling, And Observability

- [x] 9.1 Implement Owner's Digest email composition using the existing email-delivery architecture and links back to the persisted digest snapshot.
- [x] 9.2 Implement configurable frequency handling for Off, Daily, Weekly, and Monthly delivery with Weekly as the default cadence.
- [x] 9.3 Integrate Owner's Digest scheduling into the existing worker-dispatch architecture and align its cadence/config with current internal-job patterns.
- [x] 9.4 Record generation started, provider execution, digest persisted, regeneration requested, email requested, email delivered, and email failed events through the existing structured logging or audit pathways.
- [x] 9.5 Prevent duplicate sends for the same tenant-period-recipient scope under retries, worker overlaps, or manual refreshes.

## 10. Testing And Verification

- [x] 10.1 Add unit tests for severity mapping, materiality thresholds, ranking, correlation, overall-status selection, summary generation, and digest-history immutability.
- [x] 10.2 Add provider-level tests for each enabled module adapter to confirm deterministic signal shape, freshness handling, and non-entitled-module omission.
- [x] 10.3 Add integration tests covering provider aggregation to snapshot persistence, current digest retrieval, history retrieval, manual regeneration, and email-delivery behavior.
- [x] 10.4 Add explicit tenant-isolation and authorization tests proving one tenant cannot read or receive another tenant's digest data.
- [x] 10.5 Add idempotency and degraded-state tests for duplicate scheduler dispatch, provider failure isolation, stale-source warnings, no-data state, and first-digest state.
- [x] 10.6 Run lint, typecheck, targeted tests, OpenSpec validation, and any required build verification for the implemented Owner's Digest slice.

## 11. Documentation And Rollout

- [x] 11.1 Update `docs/DDD.md` with Owner's Digest purpose, schema, routes, settings, history behavior, and module-provider integration contract once implemented.
- [x] 11.2 Update `docs/HLD.md` with Owner's Digest as the executive aggregation layer above the existing FinOps modules.
- [x] 11.3 Update runbooks and environment documentation for any new scheduling, delivery, or configuration variables introduced by Owner's Digest.
- [x] 11.4 Update OpenSpec baseline specs and any relevant feature-matrix or navigation docs after implementation is complete.
- [x] 11.5 Prepare rollout and rollback notes covering entitlement gating, migration order, scheduler activation, and post-deploy verification for digest generation and delivery.
