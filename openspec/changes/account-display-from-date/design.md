# Design

## Context

**Status: planned; no application implementation or database deployment is authorized by this document.** See the authoritative [proposal](openspec/changes/account-display-from-date/proposal.md) for motivation and scope. The capability deltas define the observable contract; this design and the task checklist define its implementation approach. There is no existing main `settings-account` capability to modify.

Verified implementation constraints:

- [Account page](app/settings/account/page.tsx) and [AccountSettingsClient](components/settings/AccountSettingsClient.tsx) currently expose display-name editing through [the profile API](app/api/settings/profile/route.ts), not an account cutoff.
- [The Prisma schema](prisma/schema.prisma) separates canonical invoice/payment facts from chasing state. Several modules persist snapshots, findings, baselines, alerts, and deliveries whose creation timestamps do not prove source eligibility.
- [withUserContext](lib/db/withUserContext.ts) establishes the authenticated PostgreSQL role and tenant claims. Billing mutations have separate column/permission protections; adding this setting must not widen those protections.
- [CashPlan inputLoader](lib/cashplan/inputLoader.ts) calls [CommitGuard cashContextLoader](lib/commitguard/cashContextLoader.ts); [CashPlan factLoader](lib/cashplan/factLoader.ts) also loads commitments, coverage, bills, overrides, and prior snapshots. Filtering only CashPlan snapshot anchors misses these shared inputs.
- [Python database claims](worker/paidsoon_worker/db.py), [dispatcher](worker/paidsoon_worker/dispatcher.py), and [tasks](worker/paidsoon_worker/tasks.py) operate alongside TypeScript cron/internal routes. Policy enforcement in the web UI alone cannot protect automation.

## Goals / Non-Goals

**Goals:**

- Define one immutable, resolved policy per calculation/request, with equivalent TypeScript, PostgreSQL, and Python decisions.
- Keep record visibility, period cash movement, and full-ledger settlement separate so filtering does not corrupt balances.
- Make settings changes atomic, concurrency-safe, and auditable even when an authenticated database client bypasses the route.
- Reject stale derived output and pre-cutoff operational actions without deleting source history or misreporting unavailable calculations.

**Non-Goals:**

- No changes to billing ACLs, subscription entitlements, chase allowances, team-role scaffolding, or integration ingestion ranges.
- No configurable account timezone, new actual-paid-date field, fabricated opening balance, provider-link revocation guarantee, or retrospective recall of delivered messages.
- No general staff audit framework or audit UI. The cutoff is an application eligibility rule; tenant RLS remains mandatory and does not become business-date RLS on source tables.

## Decisions

### 1. Separate tenant setting, not a UserProfile billing-column change

Add `AccountDisplaySetting`, mapped to `account_display_settings`, with `userId` as its unique primary key and FK to `UserProfile.userId`, `displayFromDate DateTime? @db.Date`, and `revision Int @default(0)`. Keep the row after clearing; do not delete/recreate it and reset the revision. Revisions are nonnegative, increase once per actual date transition, and never wrap. Overflow fails the transaction rather than resetting to zero.

An absent row resolves to `{ displayFromDate: null, revision: 0, timeZone: "Australia/Melbourne" }`. GET and calculation reads never create defaults. A first non-null save produces revision 1. Clearing an active date increments the revision and preserves the row. A null-to-null save, including an absent-row clear, makes no write, revision change, or audit entry.

Enable RLS. Authenticated owners may select their own row, insert their own `userId` and date, and update only the date. INSERT uses an ownership `WITH CHECK`; UPDATE has both ownership `USING` and `WITH CHECK`, with an own-row SELECT policy. No anonymous grants, tenant DELETE, ownership reassignment, or client revision writes. Use column grants, not a broad table UPDATE grant. Add database constraints for the supported date range and nonnegative revision. Preserve all existing `UserProfile` billing-column ACLs unchanged.

**Why / alternative:** A dedicated one-to-one setting avoids coupling a reporting preference to sensitive billing mutation grants. A profile column or assumed pre-existing shared account-settings table is rejected. Authenticated ownership is the existing tenant model; no new team permission system is inferred.

### 2. Atomic optimistic concurrency and database-generated audit

Add `AccountDisplaySettingAudit`, mapped to `account_display_setting_audits`, containing a DB-generated identifier, tenant FK, `oldDisplayFromDate`/`newDisplayFromDate` as nullable dates, `oldRevision`/`newRevision`, `actorUserId`, and a DB-generated timestamp. The actor comes from `auth.uid()`, never a request body. Each actual initial set, change, or clear has exactly one audit row in the same transaction. Owners may read their own audit rows; they cannot insert, update, delete, or truncate audit history. Settings rows cannot be deleted to erase revision history. Routine configuration writes do not cascade-delete audit rows.

Use a private, non-exposed `SECURITY DEFINER` trigger function solely for revision assignment and audit insertion, not as a generic admin mutation mechanism. The privilege elevation is justified only because authenticated callers must not receive audit INSERT or revision UPDATE privileges. Its implementation must:

- Validate `auth.uid()` is non-null and matches the setting owner; reject ownership/identity mutation. No generic service-role or staff override is added for preference changes.
- Use a fixed safe `search_path` (for example `pg_catalog`), fully qualified application/auth objects, no dynamic SQL, and a dedicated least-privilege owner. Revoke `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`; do not expose an RPC wrapper or reuse [staff auditing](prisma/schema.prisma).
- Assign revision in the BEFORE INSERT/UPDATE phase from the actual old row (or virtual null/revision 0), ignoring any caller attempt to manufacture a revision. Enforce immutable columns with both grants and trigger checks.
- Insert audit only in the AFTER INSERT/UPDATE phase for an actual date transition. The same narrow function may branch on trigger phase. **Never insert audit in a BEFORE INSERT trigger:** `INSERT ... ON CONFLICT DO NOTHING` can run BEFORE triggers for a losing insert, which must not create a spurious audit event.
- Leave same-value updates unchanged and unaudited. If audit insertion or any constraint fails, roll back setting and revision together. Normal clients cannot disable triggers; privileged DBA tampering is outside this application guarantee.

PATCH executes inside `withUserContext`:

1. Select the owner row `FOR UPDATE`; compare the stored revision to `expectedRevision` before testing for a no-op.
2. If present and stale, return 409 with no mutation. If equal and the date is unchanged, return the existing canonical policy without writing.
3. If missing, compare against virtual revision 0. A requested null is a no-op. For a non-null date, attempt INSERT with conflict-do-nothing on `userId`.
4. If that first INSERT loses a race, select/lock the now-existing row and compare `expectedRevision` again. Do not silently overwrite it or interpret a uniqueness error as success. Use a fresh statement snapshot at the normal read-committed isolation level; retry an aborted transaction only with the same expected revision.
5. Update only the date when allowed. Read the trigger-assigned revision and commit before replying. No route-level second audit write.

Two first saves with expected revision 0 therefore have one winner and one 409, even if they request the same date. An old expected revision is a conflict even when its submitted date happens to match the latest value.

**Why / alternative:** Row locking plus expected-revision checks prevents lost updates, including first-insert races. Route-only audit is rejected because direct authenticated database writes could bypass it. A generic privileged function or client-supplied actor/revision is rejected because it expands the security boundary.

### 3. Account API and independent settings draft

Introduce GET and PATCH at `/api/settings/account`. Both authenticate using server `supabase.auth.getUser()` and use `withUserContext` for tenant access. Do not accept `userId` or actor identity. Do not use `prismaAdmin` in this customer route. The existing display-name API remains unchanged.

Successful GET/PATCH responses contain **only** `{ displayFromDate: "YYYY-MM-DD" | null, revision: number, timeZone: "Australia/Melbourne" }`. No raw row, tenant ID, audit actor, or billing data is returned. These responses are private/non-cacheable. GET missing-row behavior is null/revision 0 with no write.

PATCH accepts a strict Zod object with exactly `displayFromDate` and `expectedRevision`. Both are required. The former is a canonical, real Gregorian `YYYY-MM-DD` string or explicit null; the latter is a nonnegative integer within the storage range. Reject unknown keys, missing fields, impossible dates, year zero, out-of-range years, non-padded strings, timestamps, whitespace-only strings, and empty strings. Validate calendar components rather than relying on JavaScript date rollover. API empty string is invalid; UI blank maps to null.

**Explicit minor assumption:** All real dates in years 0001–9999, including future dates, are allowed. The UI must not add a past-only maximum. Serialize low years without JavaScript's special 0–99 year coercion; use PostgreSQL DATE parameters and preserve four-digit years.

| Outcome | Response / behavior |
| --- | --- |
| Missing/invalid authenticated session | 401; no tenant read or write |
| Invalid JSON or strict validation failure | 400; no partial update |
| Stale `expectedRevision`, including an insert race | 409; no write; UI asks the owner to reload/review current settings |
| Same value at matching revision | 200 with canonical unchanged policy; no audit or revision increment |
| Actual set/change/clear | 200 only after setting, revision, and audit commit |
| Settings read, write, trigger, audit, or transaction failure | 500 with sanitized error; rollback and no success notification |

Extend [the account page](app/settings/account/page.tsx) and [AccountSettingsClient](components/settings/AccountSettingsClient.tsx) with a separate display-date section, accessible date input, its own Save/Clear/Reset, saving state, and inline success/error feedback. Clear sets the draft to blank; Save persists null. Reset restores the last successfully loaded/saved date and does not call PATCH. Disable redundant saves and duplicate submissions. Saving the profile must not save or discard the date draft, or vice versa. Combine both dirty states through [the existing unsaved-changes guard](components/settings/useUnsavedChangesGuard.ts). On failure/conflict preserve the user's draft; reload/review is explicit, never an automatic overwrite or forced retry with a newer revision.

Use `en-AU` presentation without converting date-only values through the browser timezone. Explain that earlier history is retained, changing/clearing restores eligibility, calculations and automation change, and PaidSoon customer payment/promise links for excluded records become unavailable. Warn that already delivered communications and external provider URLs cannot be recalled.

**Why / alternative:** A dedicated versioned API and independent draft avoid changing the profile contract or accidentally saving unrelated preferences. Loose optional validation and silent last-writer-wins saves are rejected.

### 4. One resolved policy and fixed temporal semantics

Introduce a server-side policy boundary with `resolveAccountDisplayPolicy(tx, userId)` and pure date/predicate helpers. It returns an immutable `{ displayFromDate, revision, timeZone, timestampBoundary }` context. Keep the date as a canonical string; `timestampBoundary` is the UTC instant corresponding to midnight at the cutoff in **Australia/Melbourne**. Null date means no cutoff. Existing per-module timezone settings do not override this rule.

- Date-only business values compare inclusively as calendar dates: `businessDate >= displayFromDate`. Fields that represent business dates retain their canonical calendar components even where the current schema uses `DateTime` rather than `@db.Date`; do not shift these dates into the previous day.
- Actual timestamps compare against Melbourne local midnight converted to UTC with historical/DST-aware timezone rules, not a constant UTC+10/+11 offset, browser timezone, server timezone, or UTC midnight. Treat timezone-less database timestamp values representing instants according to the existing UTC storage convention before timezone conversion.
- At an active cutoff, a missing/invalid governing date is ineligible; there is no fallback to `createdAt`, import time, classification time, or generation time. With no cutoff, preserve existing eligibility behavior and do not newly hide undated legacy records solely for this feature.
- Resolve once at the top of a coherent tenant read/calculation and pass the same context through all child loaders/providers. Do not re-read per row or let independent providers resolve different revisions. Fresh calculations read the database policy, not a process-global cache. Request-local reuse is allowed.
- A failed policy read is an error, never a successful absent-row/null result. Fail closed: no unfiltered response, calculation, action, or send.
- Multi-query financial reads use a coherent transaction snapshot (the existing repeatable-read option where applicable). Ordinary reads have request-start snapshot semantics; the next request must resolve the latest committed revision. External dispatch adds the fresh final check in decision 9.

In customer services, apply tenant scope and business-date predicates before pagination, totals, grouping, and ranking. Detail/mutation services enforce the same policy after tenant ownership lookup. An excluded owner-facing record behaves as not found (404), with no payload or action; a list omits it. The cutoff does not replace RLS and must not remove historical rows from reconciliation queries.

**Why / alternative:** A passed policy context is testable across services and prevents mixed revisions. Account-local/browser timezones, per-card filters, post-pagination filtering, and global memoization are rejected.

### 5. Exact business-date mapping and settlement exceptions

The following mappings are grounded in [the schema](prisma/schema.prisma); they are not interchangeable examples.

| Source / purpose | Eligibility date and required handling |
| --- | --- |
| `FinancialInvoice` and its `TrackedInvoice` workflow | `FinancialInvoice.issueDate` (nullable), falling back only when null to required `dueDate`. An old issue date with a future due date is still excluded. No `TrackedInvoice.createdAt` fallback. |
| Canonical period cash receipt | `FinancialPayment.paidAt`. A qualifying payment on a hidden old invoice may count in cash flow, but cannot expose that invoice's excluded detail or create a reminder. |
| Manual invoice period cash receipt | `InvoicePayment.recordedAt`. **Explicit assumption:** this existing timestamp is the best available proxy for manual cash receipt; no new actual-paid-date field is introduced. Do not count mirrored `import_reconciliation` ledger entries again when canonical provider payments already represent the same cash. |
| Invoice outstanding balance | First gate the parent invoice; then use its **complete** settlement ledger, including pre-cutoff payments, through [the existing balance logic](lib/invoices/payments.ts). The ledger exception is for settlement integrity, not permission to display pre-cutoff payment activity. |
| `ImportedBill` cost/accrual evidence | Nullable `dueDate`; if absent, exclude under an active cutoff. This model has **no `transactionDate`** and no canonical issue date. `dueDate` is the deliberate available bill-date proxy. |
| `ImportedBill` paid cash outflow | Nullable `paidDate`, independently of bill accrual eligibility. Missing payment date cannot establish a cash movement. Do not invent a payment timestamp from status or sync time. |
| `ImportedBankTransaction` | Required `transactionDate` for spend evidence and cash movement; preserve existing direction, currency, and source deduplication rules. |
| Spend/margin classifications and detected patterns | Inherit the linked bill/bank/invoice governing date. Classification `createdAt`/`updatedAt` never makes an old source eligible. A pattern needs eligible supporting evidence. |
| `DepositGuardJob` | Nullable `expectedStartDate`; include if its own start is eligible **or** any request/milestone is independently eligible. A null-start job with no eligible dated children is excluded under an active cutoff. |
| `DepositRequest` | Required `dueDate`, independently gated even when its job is visible. |
| `PaymentMilestone` | Nullable `targetDate`; an undated milestone is excluded under an active cutoff. Neither sequence nor parent visibility supplies a date. |
| `DepositPayment` period cash | Nullable `paidAt`, with existing settled/confirmed payment status rules. Undated/pending payments are not dated cash. An old request may still have an eligible later payment. |
| Eligible deposit parent outstanding / settlement | Use complete linked settlement/payment facts; do not inflate balances by dropping old payments. Cash-flow rows and activity payloads remain separately date-gated. |
| Recurring `Commitment` | Generate occurrences using existing recurrence rules, then retain occurrence dates on/after cutoff. Do **not** exclude a recurring commitment because `startDate` or setup time predates cutoff. A one-off needs an eligible occurrence as well. |
| `CommitmentCoverage` | Its `occurrenceDate @db.Date`; reconcile only the retained occurrence and eligible bill/tax target so hidden coverage cannot subtract an unrelated eligible obligation or double count it. |
| `TaxBufferObligation` | `dueDate` gates the obligation; `periodStart`/`periodEnd` describe calculation source coverage. A future due date alone does not validate an estimate derived from excluded historical inputs. |
| Current cash / balance context | An existing explicit as-of/current anchor, including `CommitGuardCashContext.balanceAsOf`. A valid dated current balance on/after cutoff is retained even if the setting/source was created earlier. A snapshot creation timestamp alone is not a balance anchor. |

When a DepositGuard job is included solely because of an eligible child, project only minimal safe parent context (identifier, name/reference, currency, and eligible-child linkage). Do not return old parent financial summaries, excluded children, unfiltered timelines, or aggregates that reveal them. Child visibility is always checked independently. Job-wide calculations requiring an eligible parent or complete eligible scope must report unavailable rather than infer an eligible job total from a visible child.

Cash flow is selected independently from parent invoice/request eligibility. A period receipt/outflow may be shown with its amount, date, and currency while omitting excluded parent names, invoice numbers, URLs, and embedded payload. Keep existing provider/source identity deduplication; do not sum canonical payments, mirrored invoice ledgers, paid bills, and corresponding bank movements as separate money. A later source import does not move a historical business event into the eligible range.

**Why / alternative:** Parent record eligibility answers a different question from period cash movement and settlement. Filtering all linked payments by the parent's date loses genuine period cash; filtering settlement ledgers by payment date inflates outstanding amounts. Both alternatives are rejected.

### 6. Financial completeness, shared cash inputs, and comparison periods

Use an explicit quality envelope on computed results: `status` (`complete`, `partial`, or `insufficient_data`), effective date range, policy metadata, and machine-readable reasons. Unavailable monetary/rate outputs are null/omitted, not zero; consumers, exports, recommendations, and emails must preserve that distinction. Where an existing persisted numeric column is non-null, do not write a placeholder result solely to satisfy the column: retain/reject the old result and return an insufficient-data DTO until a valid rebuild exists.

- A genuinely complete eligible dataset can produce a true zero. Missing dates, failed loaders, missing balance anchors, truncated baselines, or unavailable tax estimates cannot produce a reassuring zero or healthy/on-track state.
- An additive total may cover the retained intersection of a requested period and the cutoff. Label it `partial`, display the actual range, and never label it a complete calendar month/quarter/year. Do not extrapolate it into a full-period baseline.
- A baseline or comparison period crossing the cutoff is `insufficient_data` for that comparison. Do not compare a partial current period against a full old period, zero-fill missing history, or use pre-cutoff samples to satisfy existing minimum-sample rules. Fully eligible periods must still satisfy each engine's existing sample/coverage requirements.
- Current cash is a stock, not the sum of retained flows. Keep a valid existing current/as-of balance anchor; never manufacture opening cash by summing retained history, using zero, or treating a fresh snapshot timestamp as provenance. A missing, pre-cutoff, or invalid required anchor makes dependent cash/runway/free-cash output unavailable.
- Keep independently dated/manual future tax obligations and future recurring commitments even when configuration was set up earlier. Recompute integration/percentage-based tax estimates from eligible inputs. If the required source period is cut off or coverage cannot support the estimate, exclude the unavailable estimate from numeric totals **and mark the total/dependent safe-to-spend result incomplete**, rather than pretending the tax liability is zero.
- MarginGuard, RunwayGuard, and Owner's Digest consume eligible source inputs or current-revision derived providers. Recompute margins, burn, runway, risks, trends, and narrative; do not simply date-filter snapshot generation time or reuse old narrative with a new stamp. A provider with insufficient data must remain unavailable in the digest and cannot contribute a positive/healthy signal.

Pass the policy through [CashPlan inputLoader](lib/cashplan/inputLoader.ts), [the shared cashContextLoader](lib/commitguard/cashContextLoader.ts), [CashPlan factLoader](lib/cashplan/factLoader.ts), and their assemblers. Gate balance/expense anchors by their actual date and coverage, filter underlying source facts and generated occurrences, and validate snapshot provenance. `CashPlanSnapshot.anchorDate >= cutoff` is necessary only where that anchor is relevant; it is **not** sufficient to admit old canonical facts or baseline assumptions. Plan/module configuration remains available regardless of setup date. Preserve the existing loader boundary rather than inventing a new CashPlan-to-Tax-Buffer dependency.

**Why / alternative:** Existing numerical defaults cannot express loss of historical coverage safely. Quality-aware adapters are chosen over fake zeroes, fabricated opening balances, and generation-time-only filtering.

### 7. Coverage by surface and service boundary

All rows below include lists, direct details, linked navigation, mutations, feeds, counts/badges, charts, CSV/XLSX/report exports, alerts, recommendations, and scheduled content where present. Filtering is owned by shared backend loaders/services, not only pages. Existing auth, entitlements, currency handling, and idempotency remain prerequisites.

| Surface | Verified implementation anchors | Enforcement / error behavior |
| --- | --- | --- |
| Account settings | [page](app/settings/account/page.tsx), [client](components/settings/AccountSettingsClient.tsx), [profile route](app/api/settings/profile/route.ts) | Separate new account endpoint and draft; strict validation, optimistic concurrency, atomic audit; preserve profile contract. |
| Dashboard / invoice workflows | [invoice loader](lib/dashboard/loadDashboardInvoices.ts), [overview loader](lib/dashboard/loadDashboardOverview.ts), [metrics loader](lib/dashboard/loadDashboardMetrics.ts), [invoice export query](lib/invoices/exportQuery.ts), [payment route](app/api/invoices/[id]/payments/route.ts) | Gate canonical invoice parent for collections/actions. Cash metrics independently gate movements; balances use full ledger. Excluded direct access is 404. |
| SpendLeak / classifications | [dashboard loader](lib/dashboard/loadSpendLeakDashboard.ts), [engine](lib/spendleak/engine.ts), [persistence](lib/spendleak/persist.ts), [export query](lib/spendleak/exportQuery.ts), [spend classification](lib/spendClassification) | Filter source dates before evidence/ranking/detection. Do not surface an old finding because it was reclassified recently. Insufficient evidence is unavailable, not no leak. |
| CostGuard | [foundation](lib/costGuard/foundation.ts) | Rebuild baselines, alert evidence, forecasts, and summary consumers from eligible samples; truncated windows cannot produce variance/healthy assertions. |
| CashPlan / CommitGuard | [CashPlan service](lib/cashplan/service.ts), [factLoader](lib/cashplan/factLoader.ts), [cashContextLoader](lib/commitguard/cashContextLoader.ts), [CommitGuard library](lib/commitguard), [internal job](app/api/internal/jobs/commitguard/route.ts) | Validate current anchors and source coverage, filter occurrences/coverage, version all persisted evidence/evaluation output; no filtering by commitment setup date. |
| DepositGuard | [service](lib/depositGuard/service.ts), [job detail](lib/depositGuard/jobDetail.ts), [milestones](lib/depositGuard/milestones.ts), [requests](lib/depositGuard/requests.ts), [reminder delivery](lib/depositGuard/reminderDelivery.ts) | Apply independent job/child/payment mappings, safe parent projection, full settlement exceptions, and send-time checks; never leak excluded children. |
| Tax Buffer | [service](lib/taxBuffer/service.ts), [category inputs](lib/taxBuffer/categoryInputs.ts), [engine](lib/taxBuffer/engine.ts) | Gate obligations by due date and estimates by coverage. Incomplete reserve requirements make dependent safe-to-spend unavailable. |
| MarginGuard | [service](lib/marginguard/service.ts), [snapshot job](lib/marginguard/snapshotJob.ts), [alert job](lib/marginguard/alertJob.ts), [opportunity job](lib/marginguard/opportunityJob.ts), [export](lib/marginguard/export.ts) | Recompute revenue/cost/margins and comparisons; reject old snapshots, alerts, and opportunities irrespective of generation date. |
| RunwayGuard | [service](lib/runwayGuard/service.ts), [integrations](lib/runwayGuard/integrations.ts), [snapshot job](lib/runwayGuard/snapshotJob.ts) | Require current eligible balance and adequate eligible burn inputs. No default burn/cash substitution when cutoff removed required inputs. |
| Owner's Digest / debtor summaries | [service](lib/ownersDigest/service.ts), [providers](lib/ownersDigest/providers.ts), [digest internal route](app/api/internal/jobs/send-owners-digest/route.ts), [summary internal route](app/api/internal/jobs/send-weekly-debtor-summary/route.ts) | Pass one revision to providers; rebuild narrative/items/metrics and check delivery revision. Missing provider data is explicit, not a positive summary. |
| TypeScript automation | [send-emails cron](app/api/cron/send-emails/route.ts), [margin cron](app/api/cron/margin-guard-snapshots/route.ts), [runway cron](app/api/cron/runway-guard-snapshots/route.ts), [reminder internal route](app/api/internal/jobs/send-reminder/route.ts), [deposit internal route](app/api/internal/jobs/send-deposit-reminder/route.ts), [promise/arrangement sweep](app/api/internal/jobs/promise-arrangement-sweep/route.ts), [snooze sweep](app/api/internal/jobs/catchup-snooze-sweep/route.ts) | Re-resolve at execution and final send; suppress excluded actions without falsifying source status. Existing cron/internal authentication remains mandatory. |
| Python orchestration | [db](worker/paidsoon_worker/db.py), [dispatcher](worker/paidsoon_worker/dispatcher.py), [tasks](worker/paidsoon_worker/tasks.py), [CommitGuard orchestration](worker/paidsoon_worker/commitguard.py) | Filter claims and carry policy revision; task/internal execution must not trust claim-time eligibility. Policy errors stop/retry, never assume null. |
| Public PaidSoon links | [deposit page](app/pay/deposit/[token]/page.tsx), [public requests](lib/depositGuard/publicRequests.ts), [promise page](app/promise/[token]/page.tsx), [promise API](app/api/promise/[token]/route.ts), [payment-link route](app/api/deposit-guard/requests/[requestId]/payment-link/route.ts) | Resolve owner from validated stored token/record, not user input. Excluded records are generically unavailable; no payload, redirect, promise, or new payment intent/link. |
| Imports / sync / signed reconciliation | [sync internal route](app/api/internal/jobs/sync-connection/route.ts), [accounting sync cron](app/api/cron/sync-accounting/route.ts), [deposit webhook](app/api/webhooks/deposit-payments/route.ts), [provider reconciliation](lib/depositGuard/payments/webhooks.ts), [financial library](lib/financial), [invoice import library](lib/invoiceImport) | Continue ingesting/reconciling all history, retaining signatures, tenant mapping, deduplication, and full-ledger updates. Apply policy only when consuming facts for views/calculations/new actions. |

Billing/subscription administration, chase allowance counting (including an old hidden invoice's `firstChasedAt`), account/integration configuration, security logs, staff auditing, and platform operations are explicitly unchanged. Do not apply a generic cutoff filter to a database wrapper used by billing or ingestion.

**Why / alternative:** A service-boundary coverage matrix makes bypasses testable without replacing tenant RLS. A universal source-table RLS date filter is rejected because it would break settlement, provider reconciliation, retained history, and billing allowance accounting.

### 8. Persisted provenance and non-destructive rebuilding

Add a nullable `accountDisplayRevision` marker, nullable date-only `accountDisplayFromDate`, and nullable `accountDisplayTimeZone` metadata to persisted derived-output owners. Nullability supports additive rollout, not permanent uncertainty. Every new writer copies the resolved revision, cutoff (including null), and fixed timezone; it does not look up a fresh policy merely to stamp an older calculation.

Required owners include `SpendInsight`, `CashForecastSnapshot`, `CashPlanSnapshot`, `CashPlanAlert`, `CashPlanDataQualityIssue`, `CostGuardBaseline`, `CostGuardAlert`, `CostGuardForecast`, `MarginSnapshot`, `MarginAlert`, `MarginOpportunity`, `RunwayGuardSnapshot`, `RunwayGuardAlert`, `TaxBufferSnapshot`, derived `TaxBufferObligation` estimates, `CommitmentDetectionCandidate`, `CommitGuardEvaluationState`, `OwnersDigestSnapshot`, `OwnersDigestDelivery`, and `WeeklyDebtorSummaryDelivery`. Attach equivalent policy context to queued `ScheduledTaskClaim`/`CommitGuardWorkItem` payloads and pending reminder dispatch work. Child digest items/metrics/provider runs and alert-event evidence inherit their owner policy and may not be fetched without validating that owner. Independently readable derived evidence must either carry its own marker or require its marked owner join. Do not mark canonical source facts as derived or confuse source classification edits with proof of eligible evidence.

Reader rules are exact:

1. A marked result is usable only when its revision, cutoff, and timezone match the resolved policy, alongside all existing freshness/input-version checks.
2. A missing revision marker is accepted **only** for untouched revision 0 with null cutoff. After any actual change, including clearing back to null at revision greater than 0, unmarked output is rejected. A present revision with missing/inconsistent cutoff/timezone metadata is also rejected.
3. Snapshot `generatedAt`, `snapshotAt`, `anchorDate`, or an alert's detection date alone cannot establish provenance.
4. On mismatch, rebuild from retained eligible sources or return a rebuilding/insufficient-data state. Never return the old financial payload as a fallback and never just relabel it with the current revision.

Settings saves do not synchronously delete all snapshots, findings, alerts, or delivery history. Revision mismatch is logical invalidation; rebuild lazily on the normal read/recompute path or existing scheduled evaluation. Preserve workflow state and original sent-delivery evidence. For existing unique-per-period snapshot rows, atomically replace current calculated payload/children with current-revision results; retain delivery metadata describing what was actually sent. If already-sent content must remain immutable, retain that delivered payload in delivery metadata before replacing the current period representation. Do not mutate sent evidence to claim it used a newer revision.

Rebuild writes must remain coherent at their original resolved revision. If policy changes before publication, discard/retry; if a race still commits old-revision output, readers reject it by marker. Current-revision reads never fall back to a later-created but mismatched row. Existing engine/cash/commitment input revisions continue to apply; `accountDisplayRevision` supplements rather than replaces them. Revision participates in financial memoization/input hashes and pending-work deduplication, while delivery idempotency still prevents sending the same successful message twice.

**Why / alternative:** Non-destructive version rejection preserves auditability and recoverability on clear. Destructive invalidation, defaulting nullable markers to current revision, and treating null cutoff after clear as untouched legacy mode are rejected.

### 9. Claims, execution, dispatch boundary, and external reconciliation

Update both `claim_due_reminder_emails` and `claim_due_deposit_reminders` in [Python db](worker/paidsoon_worker/db.py). Claim SQL must join the tenant policy and canonical invoice or deposit request business date, use the same inclusive semantics, and return the resolved revision/cutoff/timezone. Missing setting row is null/revision 0; a query failure is not. Preserve `FOR UPDATE SKIP LOCKED` and unique-claim protection. Use the actual Prisma-mapped table/column names, not an assumed uniform casing. Filtering must happen before the claim limit so excluded rows do not starve eligible work.

[The dispatcher](worker/paidsoon_worker/dispatcher.py) and [tasks](worker/paidsoon_worker/tasks.py) propagate claim context to authenticated internal handlers. Tasks, retries, stale-claim recovery, manual triggers, and TypeScript cron paths cannot treat old queue payloads as authorization. Resolve one current policy before loading financial inputs; internal handlers derive the tenant from authenticated job context and validate record ownership. No new end-user admin bypass is introduced.

Immediately before handing an external message, payment intent, or hosted payment-link action to its provider, perform a **fresh policy read outside any earlier repeatable-read calculation snapshot** and compare it with the context used to build the payload. On a changed revision, discard the built payload and rebuild/retry under the new revision. On a read error, fail closed and retain retryable work. On an excluded target, skip dispatch without marking the invoice paid/cancelled/resolved or permanently cancelling its reminder sequence.

Record policy mismatch/exclusion as an operational skip/rebuild reason, not a successful send. Preserve completed provider-send idempotency. An unsent claim skipped for a prior policy must be reclaimable/retryable after another policy change: include revision in unsent-work claim identity or explicitly reopen that unsent claim under the new revision. Never reopen a successful send merely because the cutoff changed. A clear/move-back restores source eligibility without reimport, subject to existing snooze/status/entitlement/delivery rules.

**Irreversible boundary:** The final fresh successful policy check authorizes the immediate provider handoff. A change committed before that check must suppress/rebuild. A change racing after that check may still result in a provider-accepted side effect; there is no distributed transaction between settings and email/payment providers. Once handed off, a message/intent cannot be reliably recalled. Do not claim that a settings save can cancel already accepted work; continue normal signed webhook reconciliation and provider idempotency for it.

PaidSoon-hosted [deposit links](app/pay/deposit/[token]/page.tsx) and [promise links](app/promise/[token]/page.tsx), plus their submission/link-creation services, gate the underlying record **before** financial payload, visit-state mutation, redirect, promise creation, or new payment intent. Reuse a generic unavailable state; token APIs use a generic not-found/unavailable response without exposing the cutoff or record details. A policy-read failure returns an unavailable/error state, not the old record. An eligible deposit child may use only the safe job context defined above. An eligible child does not reopen a different excluded request.

Authenticated owner mutations on excluded records are likewise not found; signed provider callbacks are the explicit settlement exception. [Deposit payment webhooks](app/api/webhooks/deposit-payments/route.ts) and other existing signed provider reconciliation keep ingesting and settling excluded records, using the complete ledger. Source sync/import continues all history and does not advance watermarks based on cutoff. External provider URLs already distributed outside PaidSoon are outside PaidSoon's revocation control; document this limitation rather than promising cancellation.

**Why / alternative:** Claim-time filtering reduces unnecessary work but is not sufficient for delayed jobs or old links. Cancelling workflow state, trusting a queued revision, blocking provider callbacks, or promising provider-side revocation is rejected.

### 10. Verification and observability design

Use one shared JSON set of policy/date vectors consumed by TypeScript tests and Python worker tests, and use relevant vectors in PostgreSQL claim integration checks. Cover null/absent policy, date equality, day before/after, issue-date fallback, Melbourne UTC-midnight differences, summer/winter offsets, DST boundaries, low years, leap years, future cutoff, missing dates, and clear at revision greater than 0. Prefer existing runtime facilities (`Intl`, Python `datetime`/`zoneinfo`, PostgreSQL timezone operations) and existing test runners; do not add packages if the required range/semantics can be met without them. Never use a fixed offset to avoid a dependency.

Testing expectations:

- Unit/route tests: strict request parsing; response shape; owner identity; 401/400/409/500; GET/no-op no writes; draft Save/Clear/Reset independence, dirty guard, failed save, and conflict preservation. Stub database/provider boundaries in normal unit tests.
- **Genuine isolated PostgreSQL integration tests**, not mocked Prisma or SQL-string assertions, must prove two-tenant RLS, own-row SELECT/INSERT/UPDATE, cross-tenant denial, no anonymous access, immutable identity/revision columns, audit append-only grants, non-executable private function, direct authenticated-client writes producing audit, and audit failure rolling back the date/revision. Verify no broadening of profile billing grants.
- Use independent concurrent PostgreSQL connections to prove existing-row locking, first-insert races, stale no-op rejection, exact one audit/revision increment per transition, and no audit for a losing conflict-do-nothing INSERT. Validate under the actual authenticated role/claims, not the bypass role alone.
- Service tests cover every coverage-table row: filter before pagination/aggregation, direct-route and export bypasses, correct bill/payment dates, old invoice plus later receipt, eligible invoice full-ledger balance, safe deposit parent projection, recurring occurrences from old setup, coverage deduplication, and unchanged chase allowance counting.
- Calculation tests assert missing data is not zero/healthy, crossing comparisons are unavailable, additive partial totals have actual ranges, valid current anchors survive, no opening balance is invented, unavailable tax estimates taint dependent totals, and digest providers cannot mask unavailable inputs.
- Provenance tests include every writer/reader owner, unmarked revision-0 compatibility, rejection after set/change/clear, mismatched timezone/cutoff/revision, old-generation-time bypasses, stale in-flight rebuilds, and delivery-history preservation.
- Async/public tests cover both Python claim functions, dispatcher/task context, TypeScript cron/internal routes, retries/manual/recovery paths, policy changes between claim/build/send, policy-read failures, excluded link GET/POST/link creation, unchanged signed reconciliation, and no provider handoff on a failed final check. No real emails, payment intents, Stripe calls, or production data.

Log sanitized operation/outcome, revision, and reason codes for policy-read failure, stale output rejection, missing source date, incomplete coverage, revision conflict, and dispatch skip/retry. Do not log client emails, customer names, amounts, public tokens, or provider secrets. The append-only database audit is the durable setting-change record; generic application logs are not its substitute.

**Why / alternative:** Shared fixtures detect cross-runtime divergence, while real PostgreSQL tests prove grants/trigger/race properties that mocks cannot establish. Production or shared-database experiments are rejected.

## Risks / Trade-offs

- [A missed loader, writer, or privileged claim bypasses policy] → Gate rollout on the coverage matrix and cross-runtime integration checks; version all derived output and validate shared-service boundaries.
- [Private trigger privilege escalation] → Limit elevation to revision/audit work, authenticate the actor, freeze identity, harden namespace/ownership/EXECUTE grants, and verify with real PostgreSQL roles.
- [Cutoff makes a previously healthy metric unknowable] → Use explicit quality/null results and date ranges; never borrow old history or healthy zero defaults to preserve a dashboard's appearance.
- [Cold rebuilds and retained history increase cost] → Filter early, use existing tenant/date indexes, add reviewed indexes only where query plans justify them, and reuse one resolved context per operation. Do not discard audit/source history as a performance shortcut.
- [Rapid changes race with work or rendering] → Version provenance, reject stale output, and fresh-check irreversible dispatch. Request-start read snapshots and the provider-handoff race are explicit consistency limits.
- [Business-date proxies are imperfect] → Label bill `dueDate` and manual `recordedAt` assumptions; do not silently invent fields or reinterpret creation timestamps.
- [Existing links or delivered messages outlive the setting] → Block new PaidSoon actions at access/dispatch time, preserve signed settlement, and explain external-link/accepted-provider limitations.

## Migration Plan

1. During implementation, add the setting/audit models and nullable derived provenance to [the schema](prisma/schema.prisma). Generate a **new** migration with `prisma migrate dev` against an explicitly isolated local development database and isolated shadow database. Never edit existing migration history or run migrations against a shared database automatically.
2. Update [canonical RLS policies](prisma/rls-policies.sql) and add separate feature-specific supplemental SQL for grants, constraints, the private trigger function, and trigger installation. The supplemental SQL is a planned new artifact, not an existing file reference. Keep it narrowly scoped and version-reviewed; apply it as a separate reviewed deployment step after the generated schema migration. Do not rewrite old migrations to smuggle in grants/triggers, and do not depend on route code running first to establish security. Tables remain inaccessible to ordinary roles until policies/trigger/grants are installed and verified.
3. In the isolated PostgreSQL environment, test schema plus supplemental SQL together, then extend/run [RLS verification](scripts/verify-rls.ts) with explicit isolated credentials. Unit tests remain database-free. No production/shared deployment is part of this planning change.
4. Deploy the policy resolver, all TypeScript readers/writers, public-link enforcement, and Python claim/task changes while account cutoff editing remains disabled/unexposed. Existing missing settings and unmarked legacy results remain compatible only at untouched null/revision 0. Do not backfill markers as current without recomputing provenance.
5. Verify the complete coverage matrix, genuine role/race tests, shared temporal vectors, and application/worker mixed-version behavior. Drain/recheck old queued work through updated execution handlers. Enable account editing only when every active reader, writer, claim path, and external dispatch boundary enforces policy; a legacy active worker is a release blocker.
6. On first actual change, revision mismatch immediately hides old derived results; normal rebuild paths restore current results without destructive clearing. Verify set/change/clear, later cash movements, settlement continuity, public unavailability, and unchanged ingestion/billing accounting using isolated fixtures.

**Safe rollback:** Disable further cutoff edits server-side and in the UI first, but retain policy resolution, enforcement, provenance rejection, hardened grants, and audit while any tenant has an active date. Roll back only to a policy-aware release, or pause affected views/jobs; never return unfiltered financial output as an availability workaround. Keep additive columns/tables and audit history. Do not automatically null settings, reset revisions, delete audits, or downgrade to unfiltered code. Returning a tenant to unfiltered eligibility requires the authenticated owner's explicit clear with expected-revision checking and its normal audit event. Even after all active dates are explicitly cleared, revisions greater than 0 still require marked/rebuilt output; abandoning that protection requires a separately reviewed migration/compatibility plan. Provider-accepted side effects remain subject to normal reconciliation, not rollback.

There are no open product questions. Future-date acceptance, bill-date proxy, manual receipt proxy, request-snapshot consistency, and provider-handoff limitations are explicit decisions/assumptions above, not choices left to implementation.
