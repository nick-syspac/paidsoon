# Tax Buffer Module

## Overview

Tax Buffer is a FinOps control layer that answers: "How much cash is actually safe to spend?"

It combines:
- Available cash input
- Required tax reserves across enabled categories
- Near-term committed outflows

The resulting summary is used in the dashboard and Tax Buffer page to show:
- Required reserve
- Current reserved amount
- Reserve gap
- Safe-to-spend estimate
- Health state and recommended transfer action

## Implemented Scope

### Domain and Persistence

Implemented tables:
- `TaxBufferConfiguration`
- `TaxReserveCategory`
- `TaxBufferObligation`
- `TaxBufferSnapshot`
- `TaxBufferOverride`
- `TaxBufferEvent`

All tables are tenant-scoped by `userId` and covered by RLS policies in `prisma/rls-policies.sql`.

### Calculation Engine

Implemented in `lib/taxBuffer/engine.ts`:
- Category-level reserve calculation methods:
  - `integration`
  - `fixed_amount`
  - `percentage_profit`
  - `percentage_revenue`
  - `manual`
- GST behavior across accounting basis modes (`cash` vs `accrual`)
- Health classification (`healthy`, `watch`, `underfunded`, `critical`, `unknown`)
- Safe-to-spend composition and transfer recommendation output
- Explainability and confidence outputs per category

### Service and API

Implemented in `lib/taxBuffer/service.ts` and `app/api/tax-buffer/**`:
- Summary loading and snapshot persistence
- Obligations listing with filters and sorting
- Settings load/save with first-time suggested defaults
- Override creation and audit metadata
- Event emission and dedupe keys for non-spam notifications

Routes:
- `GET /api/tax-buffer/summary`
- `GET /api/tax-buffer/obligations`
- `GET /api/tax-buffer/settings`
- `PUT /api/tax-buffer/settings`
- `GET /api/tax-buffer/overrides`
- `POST /api/tax-buffer/overrides`
- `GET /api/settings/tax-buffer` (alias)
- `PUT /api/settings/tax-buffer` (alias)

### Dashboard and Settings UI

Implemented pages:
- `/dashboard/tax-buffer`
- `/dashboard/settings/tax-buffer`

Implemented UI behavior:
- Entitlement-aware route access (`tax_buffer_basic`)
- Summary cards and health badge
- Category breakdown and obligations table
- Settings form for global controls and per-category methods
- First-time suggested defaults when source signals are reliable
- Estimate disclaimer on Tax Buffer surfaces

## Events and Auditability

`TaxBufferEvent` records are emitted for:
- Reserve below target
- Reserve recovered
- Obligation due soon
- Material reserve gap delta
- Settings updates
- Manual overrides

Deduplication is keyed by `dedupeKey` to avoid notification spam from repeated evaluations.

## Security and Isolation

- User identity is derived from `supabase.auth.getUser()` at route boundaries.
- User-scoped DB access uses `withUserContext(userId, ...)`.
- Tax Buffer APIs are feature-gated with `requireFeature("tax_buffer_basic")`.
- Validation uses Zod schemas and strict payload validation for settings and overrides.

## Deferred Items

These are intentionally deferred and not yet implemented:
- Export-ready Tax Buffer reporting formats beyond current dashboard and API outputs.
- Advanced adviser workflows (multi-tenant accountant partner views and cross-client controls).
- Deep historical analytics UX for long-horizon reserve trend decomposition.
- Full digest-email integration of Tax Buffer events beyond in-app summary visibility.

## Rollout Guardrails

- Keep Tax Buffer presented as an estimate, not tax or accounting advice.
- Do not bypass RLS for user-facing Tax Buffer routes.
- Keep dedupe keys stable and deterministic before expanding notification channels.
- Validate summary consistency across Overview, Tax Buffer page, and any future CashPlan composition views before enabling broader notifications.
- Re-run `npm run verify-rls` after every schema or policy change touching Tax Buffer tables.
