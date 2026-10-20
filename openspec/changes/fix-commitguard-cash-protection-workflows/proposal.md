# Proposal

## Why

The CommitGuard audit found real ledger and calculation code but incomplete cash sourcing, unsafe mixed-currency totals, repeatable detection conversion, disconnected detection/alerts, and stale dashboard figures. These gaps prevent owners from relying on the module to distinguish committed cash from safely available cash.

## What Changes

- Add the agreed owner-entered gross cash balance, currency, and balance-as-of date. Do not connect accounting-provider balances or infer currency from legacy snapshots.
- Make shared summaries currency-aware and explicit about unavailable, stale, disabled, or incomplete inputs; apply the selected horizon and operating-expense buffer settings consistently.
- Correct recurrence boundaries, custom-recurrence handling, paused-event filtering, renewal windows, confidence labeling, and tax-overlap protection.
- Make detection opt-in effective, add a usable on-demand action and durable ingestion-completion handoffs, retain source evidence, and enforce candidate rejection memory.
- Make candidate conversion atomic, retry-safe, tenant-safe, and subject to the existing commitment allowance, including concurrent manual creation.
- Refresh every financial view after mutations; provide usable filters/pagination, candidate editing, complete renewal editing, and explicit relationship-based deep links.
- Turn stored alert events into a visible tenant-scoped notification history and include relevant events in the existing Owner's Digest channel when the tenant has enabled and is entitled to that channel. Do not introduce a separate email subscription or claim an immediate-email guarantee.
- Connect known commitment occurrences to the existing CashPlan forecast path with explicit overlap handling. Do not rebuild unrelated CashPlan source ingestion or treat an adapter endpoint as proof of consumption.
- Extend regression, concurrency, RLS, job, and browser verification; correct operational/user documentation only when the implementation is working.

## Capabilities

### New Capabilities

- `commitguard-cash-context`: Owner-attested, currency-tagged, dated cash inputs and explicit availability/freshness behavior, independent of Tax Buffer access.

### Modified Capabilities

- `commitguard-foundation`: Currency-preserving summaries and durable tenant-owned evidence/conversion identities.
- `commitguard-commitment-lifecycle`: Atomic allowance enforcement, idempotent candidate conversion, valid state transitions, and downstream refresh.
- `commitguard-forecast-and-free-cash`: Selected-horizon protection, bounded recurrence, currency/quality guards, tax-overlap handling, and consumed CashPlan inputs.
- `commitguard-detection-review`: Opt-in detection triggers, durable completion work, source lineage, outgoing-only evidence, review editing, and suppression.
- `commitguard-dashboard`: Real cash context, consistent refresh, confidence totals, filters/pagination, related-record navigation, and notification history.
- `commitguard-settings`: Effective module/horizon/detection controls and usable weeks-based and warning-window editing.
- `commitguard-renewal-guard`: Stable renewal-cycle warning bands, complete action context, and editable renewal terms.
- `commitguard-notifications`: Operational event evaluation, visible in-app delivery, existing digest-channel reuse, relevance checks, and durable dedupe.
- `settings-import-export`: Carry fixed-buffer currency with portable policy while excluding owner cash balances and financial attestations.

## Impact

- Application: `lib/commitguard/**`, CommitGuard APIs/dashboard/settings, overview and Owner's Digest consumers, CashPlan summary/input assembly, and SpendLeak/CostGuard links.
- Ingestion/jobs: accounting sync completion, spreadsheet spend-import completion, authenticated internal job handlers, and the existing Railway dispatcher/recovery pattern. No new provider, dependency, or Stripe/pricing change is planned.
- Database: additive cash-context fields, source/conversion identities, durable CommitGuard work/evaluation state, and event visibility metadata as defined in design. Generate migrations from Prisma on an isolated database; maintain canonical RLS and prove isolation. No SQL application or production rollout is authorized by this proposal.
- Compatibility: preserve routes and same-currency 30-day numerical behavior where inputs are complete. **BREAKING**: invalid consolidated/missing-input monetary values become nullable with explicit quality reasons; callers must use currency-grouped totals. Caller-provided cash query parameters will no longer override the saved owner balance or generate durable risk events.
- Explicit non-scope: automatic provider balances, FX, a platform-wide notification framework, a new standalone email channel, redesigning Owner's Digest delivery guarantees, a complete CashPlan rebuild, accounting write-back, historical payment reconciliation, and unrelated trial-access/billing changes.
- Main risks: legacy converted candidates lack a unique conversion link; historical snapshots have no currency; recurring bills and bank rows may duplicate evidence; tax liabilities may overlap commitments; active CashPlan/trial-access changes must remain isolated. Uncertain historical mappings are surfaced for review, never guessed or deleted.

All behavior described here is proposed, not deployed. The audit's 24 passing selected tests do not establish live RLS, scheduler, browser, or delivery correctness.