## Why

PaidSoon already has receivables (PaidSoon), spend visibility (SpendLeak), cost drift controls (Cost Guard), and an initial forecasting engine (CashPlan), but it still lacks one control-layer answer owners repeatedly need: how much cash is truly safe to spend after tax obligations are reserved.

Tax Buffer closes this gap by introducing a tenant-scoped, explainable reserve model for GST, BAS/PAYG obligations, and income/company tax planning estimates, while explicitly remaining a cash-planning feature rather than tax advice or lodgement software.

## What Changes

- Add a first-class Tax Buffer module that calculates and surfaces tax reserve requirements, reserved amount, reserve gap, and safe-to-spend cash.
- Add configurable tax reserve categories: GST, PAYG withholding, PAYG instalments, income/company tax, and custom reserves.
- Add an upcoming obligations view with due dates, estimated amounts, reserved amounts, and shortfall/covered status.
- Add recommendation outputs (weekly reserve target and immediate transfer suggestion) with explainability and data-quality confidence.
- Add manual overrides with reason, actor, timestamp, and effective-value audit trail.
- Integrate Tax Buffer with existing financial inputs (accounting providers, imported spend/invoice data, PaidSoon receivables signals, SpendLeak expense signals) using provider-agnostic adapters.
- Integrate Tax Buffer outputs into existing CashPlan and dashboard summary surfaces via shared obligation/reserve records rather than parallel ledgers.
- Add entitlement-aware Tax Buffer feature gating by extending the existing plan/feature model (no hard-coded tiers in components).
- Add Tax Buffer settings and setup flow (GST registration, accounting basis, reporting frequency, reserve account, category methods).
- Add notification hooks for under-reserved state changes, upcoming obligations, and material reserve deltas.
- Add tenant-scoped APIs, persistence, and RLS policies for Tax Buffer entities.
- Add tests, docs, and migration coverage aligned with current repo standards.

## Capabilities

### New Capabilities

- `tax-buffer-foundation`: Tax Buffer domain model, tenant isolation, reserve/obligation persistence, and source provenance.
- `tax-buffer-calculation`: deterministic reserve and safe-to-spend calculation engine with confidence/warning outputs.
- `tax-buffer-dashboard`: Tax Buffer summary page, health indicator, category breakdown, upcoming obligations, and recommendation panel.
- `tax-buffer-settings`: Tax Buffer configuration, accounting basis selection, reserve-account setup, and first-time setup workflow.

### Modified Capabilities

- `dashboard-overview`: add Tax Buffer card and safe-to-spend summary composition with existing financial-control cards.
- `accounting-integrations`: expose tax-relevant normalized fields (GST/tax treatment metadata where available) through provider-agnostic contracts.
- `spendleak-finops-foundation`: feed eligible expense-side GST credit signals into Tax Buffer confidence-based estimations.
- `subscription-plan-tiers`: introduce Tax Buffer feature entitlements and progressive capability availability by tier.

## Impact

- Affected backend areas: `app/api/**`, `lib/**` (new Tax Buffer domain/service/API handlers plus integration touchpoints).
- Affected schema areas: `prisma/schema.prisma`, migration files, and `prisma/rls-policies.sql` for new tenant-scoped Tax Buffer models.
- Affected frontend areas: dashboard navigation and new module/settings pages under `app/dashboard/**` and supporting components.
- Affected integrations: Xero and MYOB provider adapters remain isolated in provider layer and reused through shared contracts.
- Affected scheduling/notifications: existing cron/internal jobs and digest/notification patterns are reused for recalculation and alerting.
- Affected docs: `docs/DDD.md`, `docs/HLD.md`, runbook env matrix if configuration grows, and a dedicated Tax Buffer module doc.

Architectural assumptions (validated against current repository state):
- Tenant isolation is enforced through `withUserContext(...)` and RLS; Tax Buffer follows the same pattern.
- CashPlan currently has strong domain and schema foundations but limited dedicated UI surface; Tax Buffer integration must initially target shared data/summary paths and stage deeper UI coupling.
- Cost Guard and SpendLeak already demonstrate module-level dashboard and deterministic engine patterns that Tax Buffer should mirror.
- Accounting providers already expose invoices, contacts, spend bills, bank transactions, suppliers, and expense accounts; tax calculations must degrade gracefully when provider tax fields are unavailable.
- Notifications and audit should reuse existing event patterns; no separate framework is introduced.
- Tax Buffer outputs are planning estimates only and must include explicit non-advice disclaimer language.
