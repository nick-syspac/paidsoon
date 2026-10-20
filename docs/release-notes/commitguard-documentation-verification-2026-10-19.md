# CommitGuard documentation — task 7.8 verification

Date: 2026-10-19. **UNMERGED / NOT DEPLOYED.** Documentation evidence only.

## Scope and status

Only task 7.8 of `fix-commitguard-cash-protection-workflows` is addressed here.
The task ledger remains **41/54 complete, 13 remaining**; no checkbox is changed.
Local 7.6/7.7 code was inspected, not implemented or certified by this pass.
Section 8's bounded CashPlan v2 assembler and section 9 rollout acceptance remain
pending. No schema/SQL application, scheduler activation, new sender/subscription,
provider sync, production deployment or external database/API/email call is made.

Updated documentation:

- [User guide](../user/commitguard.md): explicit owner cash/expense/tax-currency
  inputs, UTC freshness, no FX, selected horizon, actual settings/classification/
  renewal/candidate/filter controls, refresh recovery, history and digest-only mail.
- [DDD](../DDD.md#4112-current-consumers-controls-and-digest-boundary--unmerged--not-deployed):
  safe workspace envelope versus summary v2, tenant read boundary, source identity
  links, controls, event adapter and pending CashPlan source boundary.
- [HLD](../HLD.md#finops-progression-cost-guard---commitguard---tax-buffer---cashplan---runwayguard---owners-digest):
  correction of the unsupported active CashPlan-consumption claim; high-level
  local/unmerged/not-deployed controls and delivery boundary.
- [Runbook](../runbooks/commitguard.md#14-current-workspace-controls--unmerged--not-deployed):
  current controls, coherent read/retry contracts, quality/history interpretation,
  existing digest cadence/access/dedup and privacy-safe diagnosis. Existing
  ordered SQL review and single-owner scheduler gate remain unchanged.

The only non-documentation edit removes one extra newline byte at EOF in
[events](../../lib/commitguard/events.ts). After editor edits left it unchanged,
the owner explicitly authorized a terminal-only whitespace trim. An equality
guard verified all non-whitespace content unchanged; the existing
delivery-ownership comment and prior code edits are preserved.

## Source-backed checks

| Topic | Actual source / existing executable regression evidence |
| --- | --- |
| Owner input source, currencies, zero/negative, independent dates and 409 recovery | [Cash contract](../../lib/commitguard/cashContext.ts), [form](../../components/dashboard/commitguard/CommitGuardCashContextForm.tsx), [contract tests](../../tests/commitguard-cash-context.test.ts), [client tests](../../tests/commitguard-cash-context-client.test.ts) |
| Quality, confidence, UTC recurrence, selected horizon, reserve coverage | [Summary](../../lib/commitguard/summary.ts), [v2 tests](../../tests/commitguard-summary-v2.test.ts), [composition tests](../../tests/commitguard-protection-composition.test.ts), [coverage tests](../../tests/commitguard-coverage.test.ts), [engine tests](../../tests/commitguard-engine.test.ts) |
| Effective horizon/weeks/disable, warning drafts, policy-only transfer | [Settings controls](../../components/settings/CommitGuardSettingsClient.tsx), [control tests](../../tests/commitguard-settings-controls.test.ts), [policy tests](../../tests/commitguard-settings-policy.test.ts) |
| One-snapshot workspace, no mixed revisions, GET-only retry | [Loader](../../lib/commitguard/workspaceLoader.ts), [store](../../lib/commitguard/workspaceClient.ts), [workspace tests](../../tests/commitguard-workspace.test.ts), [client tests](../../tests/commitguard-workspace-client.test.ts) |
| Filters before twelve-row pages, foreign/missing relationships, renamed records | [Filter tests](../../tests/commitguard-workspace-filters.test.ts), [relationship tests](../../tests/commitguard-relationship-links.test.ts) |
| Classification/renewal editing, eight-row renewal pages, source-currency annualization | [Editor](../../components/dashboard/commitguard/CommitGuardCommitmentEditor.tsx), [renewal tests](../../tests/commitguard-renewal-editor.test.ts), [lifecycle tests](../../tests/commitguard-lifecycle.test.ts) |
| Tenant history, event page selection, safe inactive/foreign targets and relevance | [History reader](../../lib/commitguard/alertHistory.ts), [history tests](../../tests/commitguard-alert-history.test.ts) |
| Stable event/source dates, current preferences, no risk/live duplication, email opt-out/access and existing UTC cadence | [Event adapter](../../lib/commitguard/digestSignals.ts), [existing mailer](../../lib/email/sendOwnersDigest.ts), [real provider/generation/mocked-mailer tests](../../tests/commitguard-digest-provider.test.ts), [provider tests](../../tests/owners-digest-providers.test.ts) |
| No active v2 CashPlan assembler claim | [Current summary route](../../app/api/cashplan/summary/route.ts) reads snapshot weeks or builds an empty-input zero-opening forecast; [section 8 tasks](../../openspec/changes/fix-commitguard-cash-protection-workflows/tasks.md) remain unchecked |

### Examples matched to actual assertions

- On 2026-10-19, a balance/basis dated October 12 is fresh; October 11 is stale:
  [composition tests](../../tests/commitguard-protection-composition.test.ts).
- Four weeks × 20000 cents = 80000 cents:
  [composition tests](../../tests/commitguard-protection-composition.test.ts).
- With 500000 AUD cents, 1000 due today, 4000 due December 3 (day 45), selected
  60 days and 10% of the 30-day basis, buffer = 100, protected = 5100, free cash
  = 494900: [v2 summary regression](../../tests/commitguard-summary-v2.test.ts).
- Required reserve 12000 versus covered commitments 10000/12000/15000 protects
  12000/12000/15000, not their sums:
  [coverage regressions](../../tests/commitguard-coverage.test.ts).
- Nineteen tied renewals are reachable exactly once on independent eight-row
  pages: [renewal regression](../../tests/commitguard-renewal-editor.test.ts).
- A recorded shortfall event replaces its equivalent live signal; opted-out,
  disabled, off-cadence or revoked email access sends nothing through the mocked
  existing transport: [digest integration regression](../../tests/commitguard-digest-provider.test.ts).

## Commands and results

- `node --experimental-test-module-mocks --import tsx --test tests/commitguard-*.test.ts tests/owners-digest-providers.test.ts`:
  **739 passed, 0 failed, 0 skipped**, 21 suites. Existing pure/route/renderer/
  mocked-service and mocked-mailer tests; no real storage/provider/mail transport.
- `npx eslint lib/commitguard/events.ts`: passed, no diagnostics.
- `openspec validate fix-commitguard-cash-protection-workflows --type change --strict`:
  passed.
- Read-only Node Markdown path/heading-fragment audit across all five documents:
  **195 local link occurrences**. It found two pre-existing HLD links to a moved
  Railway design; both now target its actual archived path. Final rerun:
  **195 checked, 0 broken** (user 3, runbook 81, DDD 66, HLD 5, this record 40).
  This is a local path/fragment check, not external HTTP checking.
- `git diff --check`: passed after the authorized one-byte EOF trim.
- Editor diagnostics: user guide, HLD, this record and events have no reported
  diagnostics. DDD retains existing Markdown table-style/duplicate-heading
  diagnostics; the runbook reports existing hard-tab indentation diagnostics.
  No repo-wide Markdown cleanup is attempted.

## Acceptance limits

This is not a full-suite/build/typecheck run or a section-9 acceptance claim.
Static-render/client regressions are not authenticated browser/Next RSC evidence.
No new browser session, live RLS/concurrency check or real delivery is claimed.
The existing Railway CommitGuard release gate remains OFF; unrelated running
jobs do not prove this extension is active. Existing digest sequential delivery
dedup does not guarantee concurrent/crash exactly-once transport. Stored timezone
does not alter current UTC period/due-hour behavior. Financial context belongs
only to its authorized tenant; diagnostics must omit balances, suppliers,
recipients, source payloads and raw database errors.