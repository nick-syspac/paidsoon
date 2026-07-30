## Context

The plan catalog exposes `chasedInvoicesPerMonth`, and `lib/billing.ts` exposes
`getInvoiceLimitForTier`, but neither the name nor the commercial intent matches what the
code does. Three facts about the current implementation:

**It is a concurrent cap, not a periodic allowance.** All enforcement sites run the same
block: count `TrackedInvoice` rows with `status IN ('pending','snoozed')` and refuse if the
count is at or above the limit. Nothing resets. An account that chases ten invoices and is
never paid is permanently at capacity; an account whose invoices are all paid can chase an
unlimited number over time.

**It discards rather than defers.** The check runs at ingest, before
`trackedInvoice.create`. An over-limit invoice is never persisted, so it is invisible: the
customer cannot see that it exists, cannot see why nothing happened, and the record is
recreated and re-discarded on every subsequent sync.

**It is applied inconsistently.** Only two of three ingest paths check:

| Ingest path | Limit applied |
|---|---|
| `app/api/webhooks/stripe-connect/route.ts` | yes |
| `lib/email/catchup.ts` | yes |
| `lib/providers/accounting/sync.ts` (MYOB, Xero) | **no** |

Accounting-connected accounts therefore have no volume limit at all today, on any tier.

**Constraints**

- Allowance values (10 / 50 / 200) and tier identifiers come from
  `restore-three-tier-pricing`; this change consumes them and does not define them.
- No overage charging.
- All ageing and period comparisons in this codebase must be whole calendar days in
  `Australia/Melbourne`; flooring elapsed milliseconds produces off-by-one day errors.
- The cron runs under `prismaAdmin`; dashboard reads run under `withUserContext`. Any shared
  usage helper must work in both contexts.
- Inside a `withUserContext`/`$transaction` callback, `tx.*` calls must be awaited
  sequentially — `Promise.all` on the same `tx` is unsafe with the pg adapter.

## Goals / Non-Goals

**Goals:**

- Count allowance the way the plans are sold: one unit per invoice, consumed once, when
  follow-up begins.
- Reset allowance at the subscription billing period boundary.
- Keep every synced invoice visible regardless of plan.
- Never interrupt a sequence that has already started.
- Warn at 80% and state capacity clearly at 100%.
- Apply one entitlement rule to all ingest sources, closing the accounting-sync hole.

**Non-Goals:**

- Overage charging, top-ups, or hard account suspension.
- Changing allowance values, seat limits, or invoice-source limits.
- Changing reminder timing, tone escalation, or template selection.

## Decisions

### 1. The gate moves from ingest to first send

```
            BEFORE                                      AFTER
  sync / webhook / catch-up                   sync / webhook / catch-up
            │                                             │
            ▼                                             ▼
     ┌─────────────┐                               ┌─────────────┐
     │ at cap?     │                               │   CREATE    │
     └──┬───────┬──┘                               │  always ✅  │
    no  │       │ yes                              └──────┬──────┘
        ▼       ▼                                         │ visible
    CREATE   DISCARD ❌                                    ▼
             (invisible,                          cron: due for send
              recreated                                   │
              every sync)                    ┌────────────┴────────────┐
                                             │  first chase?           │
                                             └──────┬───────────┬──────┘
                                             yes    │           │  no
                                                    ▼           ▼
                                          ┌──────────────┐  ┌──────────┐
                                          │ allowance    │  │  SEND    │
                                          │ remaining?   │  │ always   │
                                          └──┬────────┬──┘  │ (stage   │
                                        yes  │        │ no  │  2 & 3)  │
                                             ▼        ▼     └──────────┘
                                        SEND +      HOLD
                                        consume     (visible,
                                                     retried
                                                     next period)
```

"First chase" is unambiguous in the existing model: `TrackedInvoice.currentStage === 0` means
no reminder has been sent. The cron already derives `baseStage = currentStage + 1`, so the
gate is a single condition on an already-loaded field.

### 2. Consumption is recorded with `firstChasedAt`, not derived from `EmailLog`

Deriving usage from `EmailLog` — counting distinct `trackedInvoiceId` where `stage = 1`
within the period — looks attractive because it needs no schema change and cannot drift.
**It is wrong here.** `applyToneEscalationStage` in `lib/promiseEscalationPolicy.ts` promotes
`baseStage` 1 to 2 for high-risk debtors when tone escalation is enabled, so an invoice's
*first* email can be written to `EmailLog` with `stage = 2`. Counting stage-1 logs would
undercount precisely for the accounts chasing the most difficult debtors.

Alternatives considered:

| Option | Verdict |
|---|---|
| Distinct `EmailLog` rows with `stage = 1` in period | Rejected — tone escalation makes stage an unreliable proxy for "first". |
| Earliest `EmailLog` row per invoice, grouped and filtered by period | Rejected — correct, but a grouped scan of the whole log table on every dashboard render and every cron pass. |
| `TrackedInvoice.firstChasedAt` timestamp, set once | **Chosen.** One nullable indexed column, exact by construction, countable with a single indexed range query. |
| Stored counter on `UserProfile` | Rejected — drifts, needs reconciliation, and needs a reset job at every period boundary. |

`firstChasedAt` is set in the same update that advances `currentStage` after the first
successful send, so it cannot be set for an invoice that was never chased. Usage is then
`count(TrackedInvoice where userId = ? and firstChasedAt >= periodStart and firstChasedAt <
periodEnd)`, served by an index on `(userId, firstChasedAt)`.

Backfill: existing rows with `currentStage > 0` take their earliest `EmailLog.sentAt`;
rows with `currentStage = 0` stay null.

### 3. The period is anchored to billing, which requires a period start

`UserProfile` stores `subscriptionCurrentPeriodEnd` but no start, so the period start must
either be derived (end minus one month — wrong whenever Stripe's period is not exactly a
calendar month) or stored. It is stored: `subscriptionCurrentPeriodStart` is added and
populated from the same Stripe invoice that already yields `period_end` in
`resolveCheckoutCompletion` and the billing webhook.

Resolution order for an account's current period:

1. Active subscription → `[subscriptionCurrentPeriodStart, subscriptionCurrentPeriodEnd)`.
2. Trialing → account creation to `trialEndsAt`.
3. Neither available → the calendar month in `Australia/Melbourne`, as a safe fallback that
   never yields an unbounded window.

Period arithmetic uses whole calendar days in `Australia/Melbourne`, consistent with the rest
of the codebase.

### 4. Held invoices are derived, not a stored status

An invoice that is due for its first reminder but blocked by allowance could carry a new
`awaiting_allowance` status, or remain `pending` and simply be skipped by the cron.

A stored status requires a transition *back* to `pending` at every period boundary — a
scheduled mutation that can fail, run late, or run twice, leaving invoices permanently stuck
in a state no customer action can clear. The derived approach cannot get stuck: when the
period rolls over, the next cron pass finds allowance available and sends. Nothing needs to
be flipped.

Held is therefore a computed condition — `status = 'pending'` and `currentStage = 0` and
`nextEmailAt <= now` and the account is at capacity — surfaced to the dashboard by the
query layer rather than stored on the row.

Trade-off: the condition depends on account-level state, so it cannot be expressed as a
column filter in a single invoice query. Accepted, because the account's usage figure is
already loaded to render the usage indicator, and the number of invoices per account is
small.

### 5. One entitlement helper, three ingest sites deleted

The limit check is removed from all three ingest paths rather than moved, and appears once in
the cron. `lib/providers/accounting/sync.ts` gains no check at all — closing the
unlimited-plan hole by making that path behave like the others, not by adding a fourth copy
of a stale block.

`getInvoiceLimitForTier` is retained for the value lookup, joined by helpers that resolve the
current period, count usage within it, and report remaining allowance and the 80% threshold.
`lib/dashboardUpsell.ts` already has `isNearLimit` with a 0.8 default, which becomes the
single definition of the warning threshold.

## Risks / Trade-offs

- **Ingest no longer discards, so invoice volume in the database grows** for accounts far
  above their allowance → an account syncing thousands of overdue invoices on a $9 plan now
  stores them all. Mitigation: this is intended — the plans promise that all synced invoices
  remain visible. Watch row counts after launch; a per-account ingest ceiling can be added
  later if abuse appears, but it must not be confused with the chase allowance.

- **The gate is now inside the cron loop**, so a bug there blocks sending rather than
  blocking ingest → failure mode moves from "invoice invisible" to "invoice visible but never
  chased". Mitigation: the cron already reports counts; add held-invoice counts to its
  response so the condition is observable rather than silent.

- **`firstChasedAt` backfill is approximate** for any invoice whose earliest `EmailLog` row
  was pruned → those invoices would be counted as never chased and could consume allowance a
  second time. Mitigation: no log pruning exists today; assert during backfill that every
  invoice with `currentStage > 0` resolved a timestamp, and report any that did not.

- **Period boundaries shift when a subscription changes plan mid-period** → Stripe issues a
  new period, so allowance effectively resets on upgrade. Mitigation: accepted, and
  commercially favourable; it is stated in the spec so it is not mistaken for a defect.

- **An account with no subscription and no trial** falls back to calendar month → slightly
  more generous than billing-anchored. Mitigation: acceptable; such accounts should not exist
  outside seeding and support scenarios.

- **Usage counting adds a query per account per cron pass** → mitigated by computing usage
  once per account per pass rather than per invoice, using the `(userId, firstChasedAt)`
  index.

## Migration Plan

1. Add `TrackedInvoice.firstChasedAt` and `UserProfile.subscriptionCurrentPeriodStart` with a
   migration, plus the `(userId, firstChasedAt)` index and matching RLS coverage.
2. Backfill `firstChasedAt` from earliest `EmailLog.sentAt`; report any unresolved rows.
3. Backfill `subscriptionCurrentPeriodStart` where a subscription exists; leave null
   otherwise so the fallback applies.
4. Land the cron gate and the removal of the three ingest checks in one commit — shipping the
   removal first would leave the product briefly unlimited.
5. Ship the dashboard usage indicator and held-invoice presentation.

Rollback: revert the commit. The two added columns are additive and can remain in place; no
existing behaviour reads them.

## Open Questions

- Should the 80% warning also be emailed, or is the dashboard notice sufficient for launch?
- When an account is at capacity, should invoices be released in due-date order or by amount
  once the next period opens? Due-date order is assumed.
- Should `snoozed` invoices that have never been chased consume allowance when they wake, or
  at the moment they were snoozed? Consumption at first actual send is assumed.
- Does a manually resolved or paid invoice that was never chased need to be excluded from any
  reporting of allowance usage? It is excluded by construction, since `firstChasedAt` stays
  null.
