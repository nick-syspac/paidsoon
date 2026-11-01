# Proposal

## Why

PaidSoon has no implemented account-wide business-date cutoff. Owners cannot start reporting and automation from a meaningful date without historical records continuing to influence results. The existing proposal leaves storage, date mappings, audit guarantees, and cross-runtime enforcement ambiguous; this revision makes that planned feature implementable without deleting history or inventing accounting behavior during implementation.

## What Changes

- Add an optional Display from date under Settings → Account, with independent Save, Clear, reset, unsaved-change protection, and explicit notice that the setting also affects automation and existing customer links.
- Store the tenant-owned date, a monotonic revision, and an append-only change audit. Null preserves existing behavior; changing or clearing the value restores eligibility without reimport.
- Use inclusive date-only semantics and Australia/Melbourne boundaries for actual timestamps. Invoice eligibility uses canonical issue date, falling back to due date, as confirmed during planning.
- Apply one policy across lists, direct reads and mutations, exports, calculations, recommendations, summaries, reminders, and both TypeScript and Python job paths.
- Distinguish record eligibility from cash-movement reporting and settlement integrity: an older invoice remains hidden, but a later payment can contribute to period cash flow. An eligible invoice's outstanding balance always uses its complete payment ledger.
- Preserve current dated balance anchors and future recurring occurrences; show explicit insufficient-data states when a truncated period cannot support a calculation. Never replace unavailable financial results with healthy zeroes.
- Reject new actions through PaidSoon-hosted payment/promise links for excluded records while continuing authenticated provider webhook reconciliation and source ingestion.
- Version persisted derived results and recheck policy before dispatch so old snapshots and queued work cannot reintroduce excluded data.

**Non-scope:** Data deletion, suppressing ingestion, provider-side link revocation, billing/allowance changes, team roles, configurable account timezones, a general audit UI, and retrospective deletion of already delivered messages. No application implementation or database deployment is authorized by this proposal workflow.

## Capabilities

### New Capabilities

- `account-display-cutoff`: Tenant-owned cutoff configuration, audit, business-date eligibility, retained-history integrity, cross-module enforcement, and execution-time consistency. This capability owns the new account-setting behavior; there is no baseline `settings-account` capability to modify.

### Modified Capabilities

- `dashboard-overview`: Add cutoff-aware business summaries and filtered navigation while preserving billing allowance accounting and existing entitlement rules.

## Impact

- **Observed state:** Account settings currently edit only display name through `/api/settings/profile`; no cutoff field, resolver, or enforcement exists. All implementation tasks remain unchecked.
- **Storage/security:** Add tenant settings and audit models to the Prisma schema with matching RLS and narrowly scoped grants. Use `withUserContext` in customer flows; do not broaden profile billing-column ACLs or reuse staff-only admin auditing. The cutoff is an application eligibility rule, not a replacement for RLS tenant isolation.
- **Interfaces:** New `/api/settings/account` GET/PATCH contract; extend the account page and `AccountSettingsClient` without changing the existing profile API contract.
- **Modules:** Dashboard invoice/overview loaders, invoice queries/actions/exports, SpendLeak, CostGuard, CashPlan, Tax Buffer, CommitGuard, MarginGuard, RunwayGuard, DepositGuard, and Owner’s Digest services and derived output readers/writers.
- **Async/integrations:** Cron routes, internal job routes, Python dispatcher SQL and task execution, public payment/promise handlers, signed webhooks, and source imports. Sync continues to retain all history; only consumers apply eligibility.
- **Compatibility/migration:** Additive nullable settings, absent-row null compatibility, and nullable derived-output revision markers. Existing unmarked results are usable only at untouched revision zero. Isolated migration/RLS verification precedes separately reviewed deployment; never run migrations against a shared environment as part of planning.
- **Risks:** Mixed policy revisions, missing business dates, truncated comparisons, duplicate cash accounting, and old operational links. The design defines explicit rules and tests for each; rollout must cover every active writer before enabling cutoff edits.
