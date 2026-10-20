# CommitGuard

CommitGuard tracks recurring and one-off commitments, upcoming due dates, renewals, and safety-buffer estimates. The core commitment workspace is available on **Essentials** and above. Recurring-commitment detection requires **Business Control** or higher; advanced alert entitlement is available on **Small Business** and **Business Pro**.

**Cash-protection workflow changes: UNMERGED / NOT DEPLOYED.** The controls below
describe the current local working tree, not production availability. The task
ledger is unchanged and is not a deployment certification. Bounded CashPlan
consumption exists locally as described below; rollout acceptance remains pending. See the
[verification record](../release-notes/commitguard-documentation-verification-2026-10-19.md).

## Owner-entered cash inputs — UNMERGED / NOT DEPLOYED

Task 2.5 adds the **Owner-entered cash inputs** form to the existing
`/dashboard/commitguard` page. This is local working-tree functionality, not a
claim that the feature or required database changes have been deployed. It uses
the existing authenticated CommitGuard core access; Tax Buffer access is not
required to enter these inputs.

1. Enter **Gross cash balance amount**, **Cash balance currency**, and **Balance
	as of (UTC)** together. Enter gross cash including reserved cash, not free cash.
	Zero and negative balances are valid known values.
2. Optionally enter **Weekly operating expenses amount**, its own currency, and
	**Weekly expenses as of (UTC)** together. This basis must be nonnegative;
	zero is valid. It does not select the number of buffer weeks or change policy.
3. Optionally select **Tax-protection currency**. This attests currency only,
	not a tax amount, validated reserve, or reviewed tax/commitment overlap.
4. Select **Save cash inputs**. Amounts use major currency units with up to two
	decimals (for example `-0.29`); no commas or exponents. Supported currencies
	are AUD, USD, NZD, GBP, EUR, CAD, SGD and HKD. There is no FX conversion.

All inputs are **owner-entered, not bank-verified**. No bank/provider balances
are fetched. Dates are nonfuture UTC calendar dates. Cash and expense dates are
fresh through day seven and stale on day eight. Saved dates, currencies and
freshness stay visible. **Add missing cash balance**, **Update stale cash balance**,
and the expense-basis actions focus the relevant input; they never silently
change an amount or date. Re-enter the correct current date and explicitly save.

**Clear balance fields** and **Clear weekly expense fields** only change drafts;
save to persist the three-field clear. **Not attested** clears tax currency on
save. Clearing/changing cash never clears or relabels expenses, tax currency or
fixed-buffer policy. Cash inputs and attestations are not included in portable
settings JSON.

If another edit wins (409), drafts remain intact and saving is blocked. Select
**Reload saved inputs (keep drafts)**, compare the latest saved values, then
explicitly choose to keep your drafts with the loaded revision or discard them.
Keeping drafts does not save them; review and select **Save cash inputs** again.
An unconfirmed save also requires reloading/review before another attempt.

A confirmed save updates the form from the returned DTO and reloads cash inputs,
then requests a dashboard server refresh. If that reload fails, the form says
**Save succeeded**, keeps the confirmed inputs, and offers **Retry load (do not
save again)**. Retrying only reads; it never repeats the successful save.

The local dashboard, overview and Owner's Digest cash metrics now use the same
saved-input version-2 summary and currency/quality formatter. The workspace
refreshes its hero, horizons, upcoming list, renewals and review count together
after successful mutations. If saving succeeds but figures fail to reload, keep
the saved change and use **Retry workspace refresh (GET only)**; do not save
again. Displayed figures remain labeled as the previous revision until recovery.
This does not prove a live Next.js server refresh or CashPlan forecast consumption.

## How cash-protection estimates are calculated — UNMERGED / NOT DEPLOYED

This reference describes the local calculation engine and version-2 summary,
checked against existing regression fixtures. It is **not** a claim that these
changes are merged, deployed, or available end to end. Controls and notification
history are described below; the local evaluation scheduler is still gated OFF
and bounded CashPlan integration remains local/unmerged/not deployed. No automatic bank
balances, generic notification framework or standalone immediate email is promised.

### Dates, recurrence and confidence

Forecast dates use **UTC calendar dates**, not your browser's local time. The
window includes today but excludes the date exactly 7/30/60/90 days later. For
example, seven days from 2026-10-19 include October 19–25, not October 26.
Commitment start/end dates can be included only while inside that window.
Active, upcoming, ending and review commitments contribute; archived, paused,
cancelled and expired records do not.

Monthly and other calendar recurrences retain the original next-due-date anchor:
January 31, 2028 becomes February 29, then March 31, not March 29. An annual
February 29, 2028 becomes February 28 in 2029–2031, then February 29, 2032.
A schedule actually anchored on February 29 with monthly frequency instead
continues on March 29. A start date filters occurrences; it does not move the
anchor. Old weekly schedules still include current occurrences without truncating
their history into a false zero. Relevant legacy **custom** recurrence cannot be
calculated: review/change it to a supported frequency. It is not treated as
one-off and cannot produce complete free cash. Projection limits or invalid
amounts/dates likewise require review rather than silently dropping obligations.

Confidence labels do not discount protection:

| Label | Commitment confidence | Included in conservative protection |
| --- | --- | --- |
| Confirmed | Confirmed by the owner | Full amount |
| Probable | High or medium | Full amount |
| Potential | Low | Full amount |

All three classes are included in full and remain separately labeled in each
currency. A detection suggestion is not a commitment until converted.

### Selected horizon and safety buffer

The saved **Default horizon** controls how many days of commitments protect cash.
The separately labeled **Committed (Next 30 Days)** hero metric always stays at
30 days. The percentage buffer also always uses compatible **30-day** commitments,
not the selected horizon or a calendar month.

Example in integer cents: on 2026-10-19, with AUD cash 500000, an obligation of
1000 today and 4000 on day 45 (December 3), a 60-day horizon protects 5000 in
commitments. The 30-day metric/basis is still 1000. A 10% buffer is 100, so with
tax not applicable, total protection is 5100 and free cash is 494900. These are
calculation examples, not a claim that every screen already uses this contract.

**Fixed:** use the saved amount in its own currency. A positive legacy buffer
without a currency needs review; changing cash currency never relabels it.
Explicit zero fixed buffer is currency-neutral.

**Percentage:** multiply the compatible 30-day total by the saved percentage.

**Weeks:** multiply saved buffer weeks by a complete, dated weekly expense
basis in the cash currency. Four weeks × 20000 cents = 80000 cents (AUD 800.00
when the basis is AUD). Set **Buffer weeks** in settings and maintain the separate
dated expense basis under **Owner-entered cash inputs**.

Round the final percentage/weeks result to cents. Missing weeks or expense basis
is **not zero**, even when zero weeks are saved. Explicit zero expenses still
need their currency and a fresh date. Cash and weekly expense dates independently
remain usable through seven elapsed UTC dates; on 2026-10-19, October 12 is
fresh and October 11 stale. Stale values stay visible but do not support an
actionable free-cash estimate. Update and explicitly save the correct date;
the system does not silently redate it.

### Tax reserve and reviewed overlap

Enter **gross cash including reserved money**. Tax protection uses the full
required reserve, not the amount already set aside or only the reserve gap.
If required reserve is 12000 cents and 5000 is already reserved, the tax amount
is still 12000, not 5000 or the 7000 shortfall.

Only explicit, valid same-currency coverage links reconcile tax overlap. For
each enabled tax category, compare its required reserve with **all covered
commitment portions in the selected horizon combined**, protecting the larger:

| Required reserve (cents) | Fully covered commitments (cents) | Combined protection before safety buffer (cents) |
| --- | --- | --- |
| 12000 | 10000 | 12000, not 22000 |
| 12000 | Two occurrences of 6000 (total 12000) | 12000 once |
| 12000 | Two occurrences of 7500 (total 15000) | 15000, not 27000 |

Uncovered commitments and unrelated reserves remain protected in addition. Bill
and direct-tax links cover separate portions; bill-covered tax needs explicit
category attribution. Supplier names, similar amounts or nearby dates are never
enough to guess a match. A paid/missing/disabled/deleted/settled/stale target
requires review, not removal of the commitment. Tax-classified commitments
without reviewed links need overlap review while tax protection applies. Classify
tax commitments correctly: other categories are kept separate, not automatically
recognized as tax. Reviewed coverage editor controls are not delivered here.

No Tax Buffer entitlement or explicit disable makes that component not applicable
(zero). Missing configuration, source data or currency while tax protection
applies makes it unavailable, not zero. A currency attestation does not verify a
reserve amount or override contradictory source currencies.

### Currency exclusions and unavailable estimates

There is **no FX conversion**. Totals stay grouped in source currency. Supported
cash currencies are AUD, USD, NZD, GBP, EUR, CAD, SGD and HKD; unsupported stored
commitment currencies remain visible but cannot be converted into free cash.
With AUD cash and AUD/USD obligations inside the selected horizon, the compatible
AUD component can remain visible, but excluded USD obligations prevent a complete
consolidated free-cash estimate. The same applies to incompatible required tax,
positive fixed-buffer or weekly-expense inputs. For percentage buffers, the
30-day basis must also be compatible even if the selected horizon is shorter.

The summary preserves all reasons and review actions. Its primary state uses
this priority: **disabled, missing, stale, unsupported currency, incomplete,
complete**. A mismatch between two supported currencies can still appear as
unsupported currency. Missing/stale/incompatible/unsupported or unreviewed inputs
mean **Not available**: consolidated protected cash, free cash and safety status
are null. They are not zero, WATCH or evidence that money is safe to spend.
Saved balances/dates and valid component totals can remain visible for review.

Only complete inputs receive a safety status: negative free cash is **shortfall**;
nonnegative free cash up to 25% of the buffer is **at risk**; above 25% through
the full buffer is **watch**; above the buffer is **safe**. Zero free cash with
zero buffer is **at risk**. Explicit zero or negative saved gross cash is a known
balance, not a missing input.

Opening a summary or CashPlan adapter only reads: it creates no events, evaluation
state, work, defaults or snapshots, including no missing-cash risk event. Legacy
cash/tax/expense query overrides are rejected with 400; save owner inputs instead.
The adapter retains full occurrence amounts and coverage references; it is not
proof of CashPlan forecast consumption or bill deductions. Calculations and
[fixture-backed examples](../runbooks/commitguard.md#57-calculation-and-summary-v2-reference--unmerged--not-deployed)
are documented separately from later deployment, notification and UI acceptance.

## Configure CommitGuard

**Local controls — UNMERGED / NOT DEPLOYED.** Open **Settings → CommitGuard** at
`/dashboard/settings/commitguard`. Change the controls you need and select **Save settings**.

- **Module status:** disabling retains editable commitments, saved inputs and history but suppresses active protection, automated evaluation/detection and digest signals. The adapter and bounded local CashPlan assembler emit no commitment/linked-bill contribution; independent dated manual CashPlan items and gross cash remain.
- **Default horizon:** choose 7, 30, 60, or 90 days for commitment protection. The next-30-days metric and percentage buffer basis stay at 30 days.
- **Safety buffer:** choose a fixed amount with its own explicit currency, a percentage of 30-day commitments, or **Buffer weeks** (0–24). Weekly amount/currency/date are separate cash inputs; saving policy does not refresh their date. Unknown positive fixed-buffer currency requires confirmation, not an assumed AUD value.
- **Advanced detection rules:** enable or disable recurring detection and adjust minimum occurrences, amount-variance tolerance, interval tolerance, confidence threshold, and renewal warning days. Detection results are suggestions to review, not commitments automatically confirmed on your behalf.
- **Alerts:** select the due-soon, renewal, notice-period, amount-change, low-buffer, and shortfall alerts that are relevant to you. Some advanced alert behavior requires a higher plan.

**Renewal warning days** accepts 1–12 comma-separated whole-day entries, each
1–365. Commas and empty text remain drafts while typing. Save rejects empty or
invalid lists with an inline error; valid lists are deduplicated and sorted at
save. Use alert toggles, not an empty list, to disable a category. Settings imports
update untouched controls without erasing unsaved warning drafts.

## Add and maintain commitments

Open the CommitGuard dashboard at `/dashboard/commitguard`.

1. Use **Add commitment** to enter a name, category, amount in A$, frequency, and next due date.
2. Open **Advanced fields** if you want to add a description, supplier, renewal date, notice period, notes, or the auto-renew flag.
3. Select **Add commitment**. Review it in the upcoming commitments and horizon summaries.
4. Use **Edit**, **Pause**, **Resume**, or **Cancel** in the lifecycle actions list to maintain the record as circumstances change.

The dashboard summarizes commitments over several horizons and shows upcoming renewal and notice windows. Filter and sort the commitment list to find items that need review. Tracked commitment limits are plan-dependent: Essentials 25, Business Control 150, Small Business 500, and Business Pro 2,000.

### Classification, renewals and filters — UNMERGED / NOT DEPLOYED

**Edit commitment** exposes category, confidence, essentiality and source, plus
amount/currency, supported recurrence, UTC due/start/end dates, renewal date,
notice days, auto-renew, cancellability and descriptive fields. Changing currency
does not convert money. Editing cancelled/expired records does not reopen them;
only paused records can resume. Archived records are read-only. Legacy custom
recurrence can remain during unrelated edits or be repaired to a supported cadence.
Classify tax commitments correctly; classification alone does not create reviewed
coverage links, and no coverage editor is supplied by this documentation.

**Renewals and notice windows** shows eight entries per page, independently of
upcoming-list filters, with renewal/notice dates, notice duration, auto-renew,
remaining decision days or a missed-deadline label, and source-currency annualized
impact. Weekly/fortnightly/monthly/quarterly/six-monthly/annual amounts use
52/26/12/4/2/1 respectively. One-off/custom annualization is unavailable. This is
a run rate, not a forecast or mixed-currency total. **Edit renewal terms** reaches
the corresponding lifecycle row. Warning bands use the smallest threshold as
Urgent, the second as Action required, remaining warning bands as Watch, and
outside the largest as Info; a missed deadline is not another upcoming warning.

**Upcoming commitments** supports search (name/category/supplier/notes), category,
status, essentiality, frequency, source, currency, due period and explicit UTC
dates; sort by next due date, source amount, last update or name in either order.
The default includes active/upcoming/ending/review; choose a historical status or
All statuses for other rows. Due filters use the **saved next due date**, not the
next projected recurrence: **Due from** is inclusive and **Due before** exclusive.
Filtering precedes twelve-row pagination. Previous/next preserve filters and
sorting; applying filters resets the commitment page and oversized pages clamp.
Filters never alter financial totals, renewals, history or candidate counts.
SpendLeak links select `linkedSpendInsightId`, and Cost Guard links select
`costGuardAlertId`: persisted relationships, not summary-text matches. Renaming
a commitment does not break that relationship. Foreign/missing identities reveal
no other user's records. Share links only with authorized owners; links do not
grant access.

## Review detected candidates

If your plan includes recurring detection, review the **Detected commitments review** section on the dashboard. Check each candidate’s name, frequency, typical amount, source, and confidence. Choose **Confirm** only when it represents a real commitment; otherwise choose **Ignore** or **Not a commitment**. Confirming a candidate is a separate action from manually adding a commitment.

### On-demand detection and candidate corrections — UNMERGED / NOT DEPLOYED

Task 5.5 adds local controls, not a deployment claim. **Detect now** calls the
existing authenticated detection endpoint against persisted outgoing spend. It
does not sync your accounting provider, fetch bank balances or run a background
job. Both CommitGuard and recurring detection must be enabled, with current
subscription access. **Reload candidates and settings** reads current policy;
the server rechecks access/enablement after acquiring its tenant lock. A legacy
**confirmed** detection threshold requires review: choose low, medium or high in
settings. A detector cannot infer your confirmation.

The review section displays the pending count, created/updated/skipped results,
source warnings, evidence observation dates/IDs/amounts and source currency.
Persisted partial sources can be incomplete: inspect evidence rather than treating
Detect as a guarantee of complete spend coverage. Bills and outgoing bank streams
are assessed separately; separate accounting connections/currencies stay separate.

Use **Edit candidate** to correct name, category, amount in the source currency,
supported frequency, suggested UTC due date, confidence or source classification.
Amounts allow two decimal places and must fit nonnegative integer cents. Source
currency/supplier remain read-only evidence; candidate notes are not supported by
the existing contract. Choosing source classification does not rewrite evidence.
Confirmation creates the obligation with your saved corrections and owner-confirmed
confidence. An uncorrected due date follows the observed recurrence anchor, not
today plus a period. Legacy custom frequency must be repaired before conversion.

Corrections survive reanalysis. **Evidence changed since your correction** means
compare new source observations before confirming; new evidence does not silently
overwrite your correction. Ignored/rejected items remain available in the narrow
**Review queue view** selector. Editing one deliberately returns it to pending.
Otherwise it stays suppressed until two new distinct observations or an observed
amount change of at least the greater of 500 cents and 15% of its previous typical
amount. Duplicate evidence does not count; repeated ignore/reject does not append
another audit event. Converted candidates never reopen; conflict responses direct
you to the existing commitment, or request historical conversion review.

Successful actions reload the candidate list and pending count together and request
a server refresh. If saving succeeded but reloading failed, **Retry load (do not
repeat action)** only reads; it never repeats the mutation. An unconfirmed network
result also requires reloading before retrying. Errors/conflicts retain edit drafts.
The current shared workspace additionally refetches financial/renewal state and
pending count together; a failed refresh retains the prior snapshot and offers
GET-only recovery rather than automatically repeating the action.

Successful completed spend-ingestion paths locally persist deduplicated pending
detection requests; partial/failed runs do not automatically request detection.
That handoff is **pending work only** until execution. Local dispatch, leases,
repair and evaluators exist, but their Railway code release gate remains OFF.
No automatic execution or deployment is established by a pending request.

## Alerts, history and digest-only email — UNMERGED / NOT DEPLOYED

Open **Alerts and history** on the CommitGuard dashboard. Twelve entries per
page show severity, UTC event time, recorded currency-aware impact and related
action context. Labels distinguish **Active at last evaluation**, **Resolved**,
**Superseded**, **Suspended** and **Historical**. Last-evaluation/unavailable
wording is separate from the current cash summary. Historical impact is not
today's risk; no alerts does not mean SAFE or prove that a scheduler ran.

**Link to event** uses the stable `eventId` and selects that event's actual page.
**View commitment** can reach an owned paused/cancelled/archived record even when
it is outside the upcoming filters; detection links reach the candidate and risk
links reach cash inputs. Missing/foreign events or targets never expose another
user's data. Reading history creates no evaluation or mail.

Relevant local events feed only the existing **Owner's Digest** provider. Current
module/category preferences and advanced-alert access are rechecked; detection
also needs detection access/opt-in and a pending current-evidence candidate.
Elapsed due dates, changed renewal cycles and resolved/suspended risk are not
replayed as actionable. Amount/detection information uses the digest's reporting
period and original source date. A cash-risk event replaces, rather than
duplicates, the equivalent live risk signal in that digest.

Email additionally requires existing Owner's Digest enablement, email opt-in,
email entitlement and a due cadence. Its ranking/materiality rules can omit an
eligible event. Disabling that channel creates no new subscription or sender;
CommitGuard history remains accessible under core access. Existing digest
periods and sender due-hour checks use UTC despite a stored timezone. Event
creation, successful evaluation and history visibility are **not email receipts**.
No standalone immediate mail, CommitGuard weekly mail service, generic delivery
framework, immediate-delivery or exactly-once transport guarantee is provided.

## CashPlan boundary — LOCAL / UNMERGED / NOT DEPLOYED

The local summary/items/settings, read-only review page, overview and CashPlan
digest provider share an internal assembler; the external CommitGuard adapter
is not called as another HTTP endpoint. See [CashPlan](cashplan.md) for details.

Its 13-week preliminary estimate includes compatible eligible occurrences, only
explicitly covered in-window unpaid bills with supported saved remaining balances
(numeric Xero `AmountDue` or MYOB `BalanceDue`), validated reconstructable v2 source
facts, and valid overrides/explicitly dated manual items. This is **not full
provider coverage**: receivables are missing, payables partial, with no automatic
bank cash, FX or broad invoice/payment ingestion. Untimed legacy items require
timing review, not guessed dates. Ancillary CashPlan views are outside this update.

Opening cash is fresh saved **gross cash**, not free cash. A still-fresh older
balance is an unreconciled dated estimate; stale/missing/incompatible cash makes
amounts unavailable, not zero. Tax reserves and safety buffers do not become
additional movements. A 6000-cent included bill covering a 10000-cent occurrence
leaves 4000 cents of commitment outflow; paid, absent, excluded, incompatible or
out-of-window bills cannot erase that residual. Relevant commitment mutations
change the next read without generating snapshots on GET.

Only explicit summary POST refresh or the trusted fenced job appends snapshot v2;
the review page has no refresh control, and scheduler activation remains gated.
Legacy and superseded v2 snapshots are retained unchanged as history, not merged
with current movements. Disabling retains that history, source records and cash
while suppressing this module's contribution. Current subscription access still
applies. Offline fixtures are not live RLS, scheduler or delivery acceptance.

## Data and feature limits

CommitGuard’s totals and free-cash/safety-buffer indicators are estimates based on the commitments and available financial inputs in PaidSoon. Keep amounts, recurrence, next due dates, renewal dates, and notice periods current; verify important obligations against the original contract or provider record.

Team seats and invitations, approval mode, and weekly summary email are not currently implemented. Do not rely on those features for shared approvals or scheduled team reporting. CommitGuard’s JSON import/export under **Settings → InvoiceGuard → Import / Export** covers settings only, not the commitment records themselves; see [InvoiceGuard](invoiceguard.md).
