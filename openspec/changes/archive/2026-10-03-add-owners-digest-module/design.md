# Add Owner's Digest Module Design

## Context

See proposal.md for motivation and scope.

PaidSoon already has first-class dashboard modules and settings groups for SpendLeak, Cost Guard, CashPlan, CommitGuard, MarginGuard, RunwayGuard, and Tax Buffer, plus a worker architecture that dispatches scheduled work into internal Next.js job routes. The codebase already uses deterministic digest-style summary builders inside some modules, central subscription and feature gating, and RLS-enforced tenant isolation via authenticated user context for user-facing reads and writes.

Owner's Digest needs to sit above those modules without duplicating their calculations or inventing parallel infrastructure. The design therefore has to reuse existing financial/domain services, settings navigation, internal job dispatch, and email delivery abstractions while introducing an aggregation layer that can persist immutable snapshots, rank cross-module findings, and tolerate partial provider failure.

## Goals / Non-Goals

**Goals:**

- Add Owner's Digest as a first-class module with current snapshot, history, overview summary, settings, and scheduled email delivery.
- Reuse existing module domain logic by having each participating module expose Owner's Digest signals through a shared provider contract.
- Keep all calculations deterministic, centrally testable, and independent of optional AI narrative enhancement.
- Persist canonical tenant-period digest snapshots with data-freshness and provider-completeness metadata.
- Route scheduled generation through the existing worker-to-internal-job architecture rather than creating a second business-logic runtime.
- Enforce existing RLS, entitlement, authentication, and safe email-recipient constraints across all digest behavior.

**Non-Goals:**

- Rebuilding the underlying PaidSoon, SpendLeak, Cost Guard, CashPlan, Tax Buffer, CommitGuard, MarginGuard, or RunwayGuard calculation engines.
- Introducing a new queue, scheduler, or mail subsystem outside the established Railway worker and existing email pipeline.
- Making AI responsible for financial calculations, rankings, or status selection.
- Pretending unavailable source modules exist by fabricating findings or placeholder metrics.

## Decisions

### 1. Use a snapshot-first aggregation model with one canonical digest identity per tenant-period

Decision:

- Add Owner's Digest persistence for tenant-scoped settings, digest snapshots, digest items, key metrics, provider execution results, and delivery metadata.
- Use a canonical identity keyed by tenant, frequency, and reporting period so retries do not create duplicate digests.
- Treat closed periods as immutable snapshots. For the current open period, allow explicit regeneration against the same canonical digest identity, with audit metadata explaining who refreshed it and when.

Rationale:

- The prompt requires reliable history and no silent recalculation of old digests.
- A canonical tenant-period identity is the simplest idempotency primitive for scheduler retries, manual refresh, and email-delivery suppression.

Alternatives considered:

- Alternative A: Compute digests entirely on demand. Rejected because it breaks historical stability, weakens observability, and makes cross-module ranking expensive on every request.
- Alternative B: Create a new digest row for every regeneration attempt. Rejected because it complicates history and makes duplicate email prevention harder.

### 2. Model source-module integration as a provider registry over existing domain services

Decision:

- Define a shared `DigestSignal` contract and a provider interface in a new Owner's Digest domain package.
- Register one provider per participating module. Each provider reads from that module's existing service/domain layer and emits normalized signals plus source freshness metadata.
- Keep providers loosely coupled to module services, not module UI components.

Rationale:

- The repo already has module-centric service boundaries in `lib/*` and dashboard routes under `app/dashboard/*`.
- A provider registry lets future modules join the digest without editing a large central switch statement.

Alternatives considered:

- Alternative A: Hard-code all module logic inside one digest service. Rejected because it couples the module too tightly to every other domain and makes future extension error-prone.
- Alternative B: Pull rendered dashboard summaries from each module UI. Rejected because Owner's Digest needs structured deterministic inputs, not presentational fragments.

### 3. Centralize ranking, materiality, deduplication, and status logic in the Owner's Digest domain layer

Decision:

- Add a central scoring/configuration layer that accepts normalized signals and produces section placement, ranking, overall business status, and summary inputs.
- Keep severity weights, materiality thresholds, urgency rules, and correlation rules in one configurable domain surface so UI pages and emails consume stored results instead of reproducing logic.

Rationale:

- The user explicitly asked for deterministic, explainable ranking and status selection.
- Centralization avoids drift between dashboard, email, tests, and future notifications.

Alternatives considered:

- Alternative A: Let each provider self-rank its own findings. Rejected because cross-module comparison becomes inconsistent.
- Alternative B: Compute section placement in React components. Rejected because it is difficult to test and easy to drift from email output.

### 4. Use the existing settings-navigation and entitlement patterns

Decision:

- Add Owner's Digest to dashboard navigation and `lib/settings/navigation.ts` as another module-grouped settings destination.
- Gate all routes, APIs, generation actions, and delivery behavior through the existing subscription feature model and server-side entitlement checks.
- Store Owner's Digest settings as tenant-scoped configuration because the digest is a cross-business briefing shared across the organisation's data.

Rationale:

- The repo already centralizes settings groups and plan checks, and the digest combines organisation-wide financial context rather than one user's personal alert preferences.

Alternatives considered:

- Alternative A: Store settings per user like some single-module alert preferences. Rejected because cadence, recipient scope, and materiality settings need to govern one tenant-level briefing.
- Alternative B: Gate only in UI. Rejected because secure digest access requires server-side enforcement.

### 5. Keep scheduled generation in TypeScript business logic and trigger it via internal jobs

Decision:

- Implement digest generation, persistence, and email composition in the Next.js/TypeScript codebase.
- Add an internal jobs route for scheduled Owner's Digest generation so the Railway worker can dispatch it on cadence using the same `INTERNAL_JOBS_SECRET` pattern as other background work.
- If manual refresh is allowed, route it through the same domain service and cooldown checks as the scheduled path.

Rationale:

- The worker README states that scheduled work should call internal app routes instead of duplicating business rules in Python.
- Reusing the internal jobs pattern keeps all financial logic in one language and one testable domain layer.

Alternatives considered:

- Alternative A: Reimplement digest generation inside the Python worker. Rejected because it duplicates financial logic and weakens parity between manual and scheduled generation.
- Alternative B: Use only Vercel cron. Rejected because the repo is already moving scheduled work into Railway dispatchers and Owner's Digest is a natural fit for that path.

### 6. Make partial provider failure visible but non-fatal

Decision:

- Run provider collection so one provider failure does not necessarily abort the whole digest.
- Persist provider-result metadata alongside the digest and surface partial completeness warnings in the dashboard and delivery/audit logs.
- Only fail the entire generation when the remaining successful providers cannot produce a minimally coherent digest.

Rationale:

- The prompt requires source-module failure isolation and stale-data warnings.
- A partial digest is more valuable than no digest when the missing provider is explicit and no fake data is introduced.

Alternatives considered:

- Alternative A: Fail the whole digest on any provider error. Rejected because one module outage would suppress useful cross-business visibility.
- Alternative B: Hide provider failures completely. Rejected because it undermines trust and data-freshness transparency.

### 7. Use deterministic summary templating first, then optional AI enhancement over structured data

Decision:

- Generate the executive summary and email summary from structured digest results using deterministic templates.
- If the repo's approved AI abstraction is used later, feed it only structured digest data and treat its output as optional narrative refinement with deterministic fallback.

Rationale:

- The prompt explicitly forbids using AI as the calculation engine and requires the module to work with AI summarisation disabled.

Alternatives considered:

- Alternative A: AI-only summary generation. Rejected for reliability and auditability reasons.

## Risks / Trade-offs

- [Cross-module semantic mismatch could produce inconsistent signals] -> Mitigation: define a strict shared signal contract, add provider-level tests, and keep module-specific calculations in their owning domain services.
- [Tenant-level settings may need role decisions not yet fully standardized across all modules] -> Mitigation: align Owner's Digest settings authorization with the existing tenant-admin or authorised-user patterns already used in settings routes.
- [Current-period regeneration can blur the line between live preview and immutable history] -> Mitigation: keep closed periods immutable, reuse one canonical current-period digest identity, and audit every explicit refresh.
- [Partial provider failure could reduce trust if messaging is vague] -> Mitigation: persist provider completeness data and show precise freshness or failure warnings instead of generic errors.
- [Digest generation may become expensive as modules grow] -> Mitigation: provider-level aggregation, stored snapshots, central materiality filtering, and background generation through the existing worker path.

## Migration Plan

1. Schema and contract phase

- Add Owner's Digest tables or equivalent settings/snapshot models in `prisma/schema.prisma`.
- Update `prisma/rls-policies.sql` for tenant-scoped digest records and generate a migration.
- Add shared TypeScript domain types for digest settings, signals, metrics, provider results, and canonical digest status.

1. Domain phase

- Implement `lib/ownersDigest/*` with provider registry, signal normalization, scoring, deduplication, status selection, deterministic summary generation, and persistence helpers.
- Add adapters/providers for the modules that already expose usable summary data first, then extend to additional modules.

1. Read/write surface phase

- Add current-digest, history, historical-digest, settings, and manual-regeneration handlers using the existing auth, Zod, entitlement, and `withUserContext(...)` patterns.
- Add the internal jobs route for scheduled generation and email delivery.

1. UI phase

- Add dashboard navigation entry, Owner's Digest module route, history view, compact overview card, settings page, empty states, degraded-state messaging, and mobile-first cards.

1. Delivery and operations phase

- Hook scheduled generation into the existing worker cadence model.
- Record generation, regeneration, email-requested, email-delivered, email-failed, and provider-failure events through the repo's existing audit or structured-logging conventions.

1. Verification and rollout phase

- Add unit, provider, integration, tenant-isolation, idempotency, and degraded-state tests.
- Update DDD, HLD, runbooks, feature-matrix docs, and OpenSpec baseline specs once implemented.

Rollback strategy:

- Keep Owner's Digest behind entitlement and module-enable controls while the feature is incomplete.
- If generation or delivery misbehaves, disable scheduled generation and delivery while leaving existing module data untouched.
- Because the schema is additive, rollback in production should prefer forward-fixes and feature disablement over destructive reversal.

## Open Questions

- Which exact existing authorised-user model should govern tenant-scoped Owner's Digest settings and recipient selection where a tenant has more than one user?
- Which participating modules already have sufficiently stable service outputs for a first implementation pass, and which need small adapter layers before they can emit signals cleanly?
- Should current-period manual refresh be available to all authorised users immediately, or only to tenant admins/owners in the first release?
