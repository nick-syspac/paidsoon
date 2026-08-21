## Context

See proposal.md - Why. `TrackedInvoice.clientEmail`/`clientName` are currently the only per-debtor identity signal, duplicated on every invoice row, with no home for per-customer preferences. Four ingestion paths create `TrackedInvoice` rows today: Stripe Connect sync, Xero sync, MYOB sync, and CSV/XLSX import commit (`app/api/invoice-imports/[batchId]/commit/route.ts`).

## Goals / Non-Goals

**Goals:**
- Every tenant has exactly one `Customer` row per distinct debtor email, for existing and new data.
- The reminder cron respects per-customer `neverAutoChase`/`unsubscribed`/`cadenceOverride` without changing its existing invoice-status filtering.
- Backfill runs once, safely, and is idempotent if re-run.

**Non-Goals:**
- Multiple contacts per customer (`CustomerContact`) and free-text notes (`CustomerNote`) - deliberately deferred to a follow-on change.
- Any UI for managing customer preferences is out of scope for this change's tasks; this change lands the data model and enforcement only. (A follow-on change wires the settings UI.)
- No identity resolution beyond exact case-insensitive email match (no fuzzy matching, no merging two different emails for the same real-world customer).

## Decisions

- **Find-or-create at ingestion, not a background job.** Each of the four ingestion paths performs `Customer.findFirst({ userId, primaryEmail (ci) }) ?? create` inside the same `withUserContext` transaction that creates/updates the `TrackedInvoice`. Alternative considered: a separate reconciliation job that periodically creates missing `Customer` rows - rejected because it would leave a window where new invoices have no `customerId`, breaking the cron's per-customer checks for freshly-synced invoices.
- **Case-insensitive uniqueness via a stored lowercased column.** Postgres unique constraints don't case-fold by default, so `Customer` stores `primaryEmail` as provided plus enforces uniqueness on `(userId, primaryEmailLower)`. All find-or-create lookups compare on the lowercased column.
- **Backfill runs via `prismaAdmin`, not `withUserContext`.** This is a documented exception per project convention (`prismaAdmin` is normally restricted to cron/webhooks/bootstrap): a one-time cross-tenant migration script has no single authenticated user session to run `withUserContext` under, since it processes every tenant's data in one pass. The script groups by `userId` explicitly in its own queries so no cross-tenant leakage occurs despite bypassing RLS.
- **`cadenceOverride` shape mirrors `Schedule`.** Stored as a `Json?` column with the same three day-offset fields as `Schedule` (`email1DaysAfterDue`, `email2DaysAfterDue`, `email3DaysAfterDue`) rather than a new relational table, since it's a narrow, non-relational override of an existing narrow model. Alternative considered: a `CustomerSchedule` table mirroring `Schedule` 1:1 - rejected as unnecessary relational overhead for three integers.
- **`Arrangement.customerId` added alongside, not instead of, `debtorEmail`.** `debtorEmail` remains the existing unique-constraint key so no existing code paths break; `customerId` is additive for the follow-on customer-preferences UI to join through.

## Risks / Trade-offs

- [Backfill creates duplicate `Customer` rows if two tenants' invoices share an email at different times during a partial rerun] → migration script is idempotent: it upserts on `(userId, primaryEmailLower)` rather than blind-inserting, safe to rerun.
- [A customer changing their email address going forward creates a second `Customer` row rather than being recognized as the same person] → accepted for v1 per Non-Goals; no fuzzy/manual-merge tooling in this change.
- [Adding a mandatory find-or-create step to four separate ingestion code paths increases the chance one path is missed or implemented inconsistently] → mitigated by a single shared helper (`findOrCreateCustomer(tx, userId, email)` in `lib/db/`) that all four call sites use, rather than four separate implementations.

## Migration Plan

1. Add `Customer` model + `customerId` nullable FK on `TrackedInvoice`/`Arrangement`; `npx prisma migrate dev --name add-customer-entity`.
2. Add matching RLS policies to `prisma/rls-policies.sql`; run `npm run verify-rls`.
3. Ship the shared `findOrCreateCustomer` helper and wire it into all four ingestion paths (new invoices only initially - `customerId` still nullable).
4. Run the backfill script against production data (documented `prismaAdmin` exception), attaching `customerId` to historical rows.
5. Add the reminder-cron filtering (`neverAutoChase`/`unsubscribed`/`cadenceOverride`) once backfill is confirmed complete for all tenants, so the cron never encounters a null `customerId` on an active invoice.
6. Rollback: `customerId` stays nullable throughout, so the FK columns can be dropped without touching `TrackedInvoice`/`Arrangement` core data if this needs to be reverted before step 5 ships.
