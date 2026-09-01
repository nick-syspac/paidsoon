# Design: Canonical Financial Data Model

## Context

PaidSoon is becoming a financial-operations platform: invoice chasing (shipped), SpendLeak
(foundation schema shipped, implementation pending), cash forecasting and Owner Digest (roadmap).
The `add-initial-spendleak-implementation` design (D1) already established that provider adapters
normalize into a stable input model — but only for the *spend* side. Receivables still flow
directly into `TrackedInvoice`, which conflates two different things:

- **Invoice data**: external ID, amount, currency, due date, payment URL, customer identity —
  facts about the world, owned by the source system
- **Chasing workflow state**: status, currentStage, nextEmailAt, snoozedUntil, firstChasedAt,
  dispute fields, p2pToken — decisions owned by PaidSoon

This change creates the canonical layer for receivables and unifies the vocabulary with the
spend-side foundation tables, so the whole platform reads from one normalized financial model.

## Goals / Non-Goals

**Goals**

- One canonical receivables model written by every ingestion path (Xero, MYOB, Stripe, CSV/XLSX)
- Chasing workflow state separated from invoice facts
- Provenance on every canonical record: `sourceSystem`, `sourceId`, `sourceUpdatedAt`, `syncedAt`,
  `rawSourceData`
- Provider variability isolated in adapters; features never see raw provider payloads
- Chasing behavior externally identical after the refactor (same reminders, same dashboard numbers)

**Non-Goals**

- Building the SpendLeak detectors or dashboards (separate change)
- Domain events, financial-opportunity aggregation (explicitly deferred)
- Any change to what gets chased, when, or how often

## Decisions

### D1 — Direct refactor, not strangler migration

Pre-launch with zero customers, there is no production data to preserve. The change is a single
destructive migration: new canonical tables created, data columns dropped from
`tracked_invoices`, mapping tables dropped. Preview/dev environments are re-seeded rather than
backfilled.

Rationale: strangler patterns (dual-write, phased read cutover) exist to protect live behavior
under real traffic. Paying that complexity cost now would leave permanent scaffolding (dual-write
code paths, compatibility shims) in a codebase that has never needed it. The risk being insured
against does not exist yet.

**This decision is time-sensitive.** It stops being safe the moment the first real customer's
data exists. If implementation slips past first-customer onboarding, this decision must be
revisited before merging.

### D2 — `TrackedInvoice` narrows to workflow state; 1:1 with `FinancialInvoice`

The split:

```
FinancialInvoice (facts, source-owned)        TrackedInvoice (workflow, PaidSoon-owned)
─────────────────────────────────────         ─────────────────────────────────────────
id                                            id
userId                                        userId
sourceSystem   ('xero'|'myob'|'stripe'|'csv') financialInvoiceId  → FinancialInvoice
sourceId       (provider's invoice id)        status / currentStage / nextEmailAt
sourceUpdatedAt / syncedAt                    snoozedUntil / firstChasedAt
externalNumber                                disputeNote / disputeRaisedAt / disputeResolvedAt
amountDueCents / currency / dueDate           p2pToken
paymentUrl                                    providerMetadata (chasing-scoped remnants)
issueDate?                                    emailLogs / payments / promises / arrangements
contactId        → FinancialContact
rawSourceData  Json
```

Every chased invoice has exactly one canonical record; a canonical invoice may exist without
being chased (future: full receivables visibility without enrolling everything in reminders).
The chasing workflow's unique key moves from `(externalId, provider, userId)` on
`TrackedInvoice` to `(userId, sourceSystem, sourceId)` on `FinancialInvoice`, with chasing
uniqueness enforced by the 1:1 reference.

`InvoicePayment`, `PromiseToPay`, `ArrangementInvoiceCoverage`, and `EmailLog` stay attached to
`TrackedInvoice` — they are workflow artifacts, not financial facts. Payment *facts* from the
provider (a payment recorded in Xero) land in `FinancialPayment`; the append-only
`InvoicePayment` ledger continues to serve chase-math (`computeOutstanding`) and is reconciled
from canonical payments during sync.

### D3 — Provenance vocabulary is shared across receivables and spend

The SpendLeak foundation tables shipped with their own provenance naming
(`providerBillId`, `providerTransactionId`, `providerSupplierId`). This change renames them to
the canonical convention (`sourceSystem` via the connection, `sourceId`, `sourceUpdatedAt`,
`syncedAt`) so every normalized financial record — invoice, bill, transaction, contact,
supplier, payment — answers "where did this come from and how fresh is it?" the same way.

The `currency` defaults on the spend tables (`"usd"`) are corrected to have **no default**:
currency must always come from the source system. A wrong default is silent data corruption;
a missing value is a loud sync error. (AUD-denominated product; Xero/MYOB always send currency.)

### D4 — `Customer` becomes a view-level concern over `FinancialContact`

Today `Customer` duplicates debtor identity (email, display name) and also carries chasing
preferences. After this change, debtor *identity* lives in `FinancialContact` (canonical,
per-source, with provenance); `Customer` retains only chasing preferences
(`neverAutoChase`, `unsubscribed`, `cadenceOverride`) linked to the canonical contact. The
directory UI composes identity from `FinancialContact` and preferences from `Customer`.

Open refinement: whether `Customer` rows are keyed 1:1 to `FinancialContact` or survive as a
tenant-merged preference record when the same debtor appears from two sources (e.g. CSV import
plus Xero). Default to 1:1 with `FinancialContact`; revisit if cross-source debtor merging
becomes a real need.

### D5 — QuickBooks implements against the new interface

`quickbooks-integration` is re-scoped: its adapter is written against the canonical ingestion
contract, after this change lands. QuickBooks thus becomes the first external validation that
the canonical model is genuinely provider-neutral — its documented API shapes (Invoice,
Customer, Payment, Bill, Purchase, Vendor) were already used as a design input for the
canonical fields.

Intuit developer/app/credential setup proceeds in parallel during this change (it is external
lead time, not code) so the adapter work is unblocked when this change ships.

### D6 — Stripe (invoice source) is treated as a source system, not a special case

`TrackedInvoice.provider` today defaults to `"stripe"` because the original product chased only
Stripe invoices. Stripe-sourced invoices get `sourceSystem: 'stripe'` and the same provenance
fields as accounting-provider invoices. No canonical record may exist without a provenance
triple.

### D7 — All feature reads go through the canonical layer, enforced by convention and review

The rule: user-facing reads of invoice/contact/payment *facts* join through
`TrackedInvoice.financialInvoice` (or query canonical tables directly with `withUserContext`).
Chasing code never reads `rawSourceData` — provider quirks stop at the adapter boundary. This
is a code-review convention (like the existing `prismaAdmin` rules), not a runtime mechanism.

## Data Model Direction

New tables (exact Prisma shape refined at implementation):

- `financial_invoices` — canonical AR invoice facts + provenance
- `financial_contacts` — canonical debtor/customer identity + provenance
- `financial_payments` — canonical payment facts (provider-recorded) + provenance

Modified:

- `tracked_invoices` — drops `externalId`, `provider`, `clientEmail`, `clientName`,
  `amountDue`, `currency`, `dueDate`, `paymentUrl`; gains `financialInvoiceId` (unique, FK)
- `customers` — drops identity duplication, links to `financial_contacts`
- `provider_invoice_mappings`, `provider_contact_mappings` — dropped (absorbed into provenance)
- `imported_bills`, `imported_bank_transactions`, `supplier_profiles` — provenance column
  renames per D3; currency defaults removed

## Rollout

Single change, landed as one migration (pre-launch luxury). Verification = existing test suite
+ extended `verify-rls` + re-seeded preview environment exercising connect → sync → chase →
promise → payment end to end.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| This touches every part of the chasing path — the one shipped, working feature | Behavior-identical mandate; full existing test suite must pass unmodified in behavior terms; preview re-seed proves the loop end to end |
| `subscription-plan-switching` (in-flight) collides on merge | Sequence merges; whoever lands second rebases. Overlap is small (billing does not own ingestion) |
| Scope creep into SpendLeak detectors or events | Explicit non-goals; those are separate changes by design |
| Decision D1 silently outlives its premise | D1 carries an explicit expiry condition (first real customer) written into this design |
| Canonical model over-fits to today's two providers | QuickBooks documented API shapes used as a third design input before implementation (D5) |

## Validation Strategy

- Existing unit tests pass with fixtures re-pointed at the canonical shape (behavior unchanged)
- New unit tests for canonical ingestion mapping per source system
- `npm run verify-rls` extended: canonical tables included in cross-tenant isolation proof
- Re-seeded preview: connect → sync → chase → promise → payment works end to end
- `openspec validate canonical-financial-data-model --strict` clean
