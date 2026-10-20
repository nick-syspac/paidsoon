# CashPlan bounded integration — task 8.5 verification

Date: 2026-10-19. **LOCAL / UNMERGED / NOT DEPLOYED.**

## Scope

Only task 8.5 of `fix-commitguard-cash-protection-workflows`: integration fixtures
and bounded CashPlan/CommitGuard operations, architecture and user documentation.
D9, the forecast/free-cash spec and actual 8.1–8.4 input/fact/override/snapshot
implementation and canonical consumers were read before editing. Runtime,
foundation, schema, migrations, SQL/ACLs, billing, worker and OpenSpec artifacts
are unchanged by this task. No checkbox was marked, no scheduler activated and
no external database/API/email used. Section 9 rollout acceptance remains separate.

## Exact fixture evidence

[Canonical consumer fixtures](../../tests/cashplan-canonical-consumers.test.ts)
now contain **30 tests**, including **17 task-8.5 regressions**. Persistence,
authentication and effective-access loading are mocked; route wrappers, canonical
service/input loader/fact loader/assembler/engine, settings page, overview formatter
and CashPlan digest provider run as real code. A read-only transaction proxy rejects
every mutation/raw query or unexpected source table during consumer checks.

| Regression | Asserted evidence |
| --- | --- |
| Commitment-only preliminary forecast | 100000 gross opening, 10000 outflow, 90000 lowest cash; 13 weeks, missing receivables/partial payables, commitments-only and unreconciled day-seven balance age across summary/items/settings, overview formatter, settings page and digest |
| Gross cash versus protected cash | Real pure tax adapter + CommitGuard summary: tax protection 20000 and safety buffer 15000 produce free cash 55000; CashPlan still opens at 100000 and closes at 90000 with exactly one 10000 movement, no reserve/tax/other-module reads |
| Validated source reuse | Explicit included Xero bill 6000 plus occurrence residual 4000; source/connection/currency/coverage preserved; valid v2 reused despite poisoned opaque saved weeks |
| Invalid bill cannot erase residual | Paid, absent, excluded, foreign currency, out-of-window and unsupported remaining-balance fixtures retain 10000 residual; coverage review, snapshot lineage rejection and unchanged history across consumers |
| V2 metadata/source rejection | Hash, anchor, cash revision, commitment revision and live source-reference mismatches reject reuse without importing opaque facts or rewriting history |
| Disabled module | No commitment/coverage/bill reads; dated independent manual outflow 2000 survives with gross cash; legacy/v2 snapshots and all source rows unchanged; re-enable restores source contribution |
| Current access | Essentials fallback preserves core contribution and subscription-only CashPlan admission; subsequent revoked subscription returns 403/throws before financial reads |
| No FX | Foreign USD 777777 cents remains unchanged and excluded with quality; AUD projection remains 90000, never an AUD+USD sum |

Existing cases in the same file retain create/pause propagation, missing/stale/no
plan null-money behavior, signed cash, day-seven/day-eight, explicit POST metadata,
trusted transaction refresh and actual 401/403/400/404 route checks. POST/job tests
prove only the helper/route boundary; they do not exercise a deployed scheduler.
The overview page's call into the service is checked **statically**; its formatter
is executed. No claim of authenticated Next.js/RSC/browser acceptance is made.

## Commands and results

All commands ran from the repository root. Logs are local temporary evidence, not
customer data or committed artifacts.

| Command | Result |
| --- | --- |
| `node --experimental-test-module-mocks --import tsx --test tests/cashplan-*.test.ts tests/commitguard-digest-provider.test.ts tests/dashboard-page-effective-access.test.ts tests/owners-digest-providers.test.ts tests/runway-guard-scenario-and-cashplan.test.ts` | Final rerun: **299 passed, 0 failed/skipped/cancelled**, exit 0; includes all 17 task-8.5 cases |
| `npm test` | **4093 passed, 319 suites, 0 failed/skipped/cancelled**, exit 0 |
| `npm run lint` | Exit 0; 0 errors, 1 pre-existing unused `isVisible` warning in settings navigation |
| `npx tsc --noEmit --pretty false` | Exit 2; **48 pre-existing diagnostics**; before/after output identical, no new diagnostic |
| `openspec validate fix-commitguard-cash-protection-workflows --type change --strict` | Valid, exit 0 |
| Scoped `git diff --check` | Passed |

Temporary logs: `/tmp/paidsoon-85-full-tests.log`, `/tmp/paidsoon-85-full-lint.log`,
`/tmp/paidsoon-85-tsc-before.log`, `/tmp/paidsoon-85-tsc-after.log` and
`/tmp/paidsoon-85-focused.log`. TypeScript baseline was captured before this task's
edits, not inferred from earlier sessions.

## Bounded documentation contract

- [CashPlan runbook](../runbooks/cashplan.md) and [user guide](../user/cashplan.md).
- [CommitGuard runbook](../runbooks/commitguard.md#16-bounded-cashplan-consumption--local--unmerged--not-deployed)
  and [user guide](../user/commitguard.md#cashplan-boundary--local--unmerged--not-deployed).
- [DDD architecture](../DDD.md#4113-bounded-cashplan-consumption--local--unmerged--not-deployed),
  snapshot storage and canonical API contracts.

Included sources are compatible eligible occurrences, explicitly covered unpaid
in-window bills with numeric persisted Xero `AmountDue`/MYOB `BalanceDue`, current
reconstructable v2 source facts and valid overrides/dated manual items. No broad
provider/receivable/payment ingestion, automatic bank cash, reserve movement or FX.
Every bounded forecast is preliminary. Snapshot v2 is append-only via explicit
summary POST/trusted fenced job; GET consumers never persist CashPlan snapshots,
and legacy/superseded snapshots remain unchanged history.

Ancillary calendar/explanation/data-quality/periods/export and unrelated scenarios
are explicitly outside the canonical consumer rollout. Existing Owner's Digest
or other-module orchestration outside the CashPlan provider may retain its own
writes; this evidence does not assert every application GET is globally write-free.
No production build, live RLS, migration, authenticated browser, provider or
scheduler/delivery acceptance was run or certified by this task.