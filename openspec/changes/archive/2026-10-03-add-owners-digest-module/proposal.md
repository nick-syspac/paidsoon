# Add Owner's Digest Module

## Why

PaidSoon now has multiple FinOps modules that can surface receivables, spend, tax, margin, commitment, and runway signals, but it still lacks a single deterministic owner-level briefing that answers what matters right now without forcing users to inspect each module separately. Owner's Digest is needed as the executive aggregation layer so higher-plan customers can understand the few financially material changes, risks, opportunities, and actions that deserve attention each week.

## What Changes

- Add Owner's Digest as a first-class FinOps module with a dedicated dashboard route, current snapshot view, history view, and compact dashboard-overview summary entry point.
- Add a tenant-scoped digest domain model for digest settings, immutable digest snapshots, ranked digest items, key metrics, provider execution status, and regeneration/idempotency metadata.
- Add a reusable digest signal contract and provider registry so PaidSoon, SpendLeak, CostGuard, CashPlan, Tax Buffer, CommitGuard, MarginGuard, and RunwayGuard can contribute deterministic findings without coupling Owner's Digest to their UI implementations.
- Add deterministic materiality filtering, severity classification, priority scoring, overall business status calculation, correlation/deduplication, and templated summary generation that work even when AI narrative enhancement is disabled.
- Add Owner's Digest settings for enablement, email delivery, cadence, delivery timing, included sections, recipient scope, action-item limits, and minimum materiality using the existing settings architecture.
- Add scheduled digest generation and weekly email delivery through the existing worker/scheduler and email infrastructure, including retry-safe period idempotency, partial-provider failure isolation, audit/observability hooks, and stale-data signaling.
- Add entitlement-aware module inclusion so the digest only uses modules and features available to the tenant's subscription, while gracefully omitting unavailable modules.
- Add tests and documentation covering signal providers, scoring, status selection, snapshot immutability, tenant isolation, email behavior, idempotency, and degraded/empty states.

## Capabilities

### New Capabilities

- `owners-digest-foundation`: Tenant-scoped settings, immutable digest snapshot persistence, digest item/metric records, provider result tracking, and regeneration safeguards.
- `owners-digest-signals-and-scoring`: Shared digest signal contract, provider registry, materiality filtering, severity mapping, priority scoring, deduplication/correlation, and overall business status calculation.
- `owners-digest-dashboard`: Owner's Digest dashboard route, executive summary, attention/opportunity/positive sections, key numbers, history access, mobile-first presentation, and drill-down links to source modules.
- `owners-digest-email-delivery`: Scheduled digest generation, weekly email rendering and sending, recipient selection, deterministic fallback copy, and delivery audit/observability behavior.
- `owners-digest-settings`: Owner's Digest settings UI/API behavior for enablement, cadence, delivery schedule, section inclusion, materiality, and action-item limits.

### Modified Capabilities

- `dashboard-overview`: Add a compact Owner's Digest executive summary card linking into the full digest without duplicating the entire briefing.
- `subscription-plan-tiers`: Add Owner's Digest feature entitlements and progressive module-coverage rules through the canonical plan catalog.
- `implementation-gated-entitlements`: Define how Owner's Digest behaves when a tenant is entitled to the module but some contributing modules or scheduled delivery paths are not yet operational.

## Impact

- Affected product areas: dashboard navigation, dashboard overview, settings navigation/pages, email delivery surfaces, and any compact summary entry points.
- Affected backend areas: `app/api/**`, `lib/**` FinOps domain services, billing/entitlement checks, module integration boundaries, worker/scheduler paths, audit/diagnostic tracing, and notification composition points where already present.
- Affected schema areas: `prisma/schema.prisma`, new migration files, and `prisma/rls-policies.sql` for tenant-scoped Owner's Digest records.
- Affected integrations: existing FinOps modules must expose digest-compatible signals or adapter functions without duplicating their calculations or source-of-truth data.
- Security and tenancy: all digest reads/writes must follow existing authenticated-user derivation, `withUserContext(...)` RLS enforcement, safe response shaping, and secure email recipient selection.
- Testing and documentation: expanded unit, provider, integration, idempotency, and tenant-isolation coverage plus architecture and feature docs for the new aggregation layer.
