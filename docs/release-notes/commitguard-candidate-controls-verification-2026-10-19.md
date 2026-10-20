# CommitGuard task 5.5 verification — 2026-10-19

**UNMERGED / NOT DEPLOYED.** Local working-tree evidence only. No shared DB,
migration/policy application, external provider API, email, scheduler or worker
was used or activated. Existing workspace changes were retained. No task checkbox
was changed; 7.2 whole-workspace refresh and 7.3 broad filters remain pending.

## Scope and paths

- [Candidate controls](../../components/dashboard/commitguard/CommitGuardCandidateReview.tsx)
  are mounted by the existing
  [workspace](../../components/dashboard/commitguard/CommitGuardWorkspace.tsx).
  Detect uses the existing POST, publishes its results/list and pending count,
  explains disabled/unknown/legacy policy, and offers settings reload.
- [Server page](../../app/dashboard/commitguard/page.tsx) now forwards existing
  candidate currency/supplier/dates/source evidence/review flags. It does not
  pass tenant/connection IDs. Existing financial hero/filter behavior was not
  redesigned; requested router refresh does not prove task 7.2 completion.
- [Shared boundary](../../lib/commitguard/candidatePresentation.ts) validates
  existing approved edit fields only, formats cents in source currency, safely
  handles invalid/missing dates and allowlists evidence observations.
  Currency/supplier remain evidence; no candidate notes or new schema fields.
- [Review route](../../app/api/commitguard/detections/[id]/review/route.ts) and
  [actual service](../../lib/commitguard/detection.ts) share patch validation.
  The service preserves converted conflict precedence, unique conversion,
  ignore/reject no-op audit semantics, corrections and suppression baselines.
- [Settings form](../../components/settings/CommitGuardSettingsClient.tsx)
  explicitly flags a legacy confirmed threshold; its required placeholder has
  only low/medium/high choices, not a silent high default or confirmed option.
- [User guidance](../user/commitguard.md), [runbook](../runbooks/commitguard.md)
  and [API inventory](../DDD.md) describe manual triggers, suppression and
  pending-only automatic-ingestion handoff, not implemented automatic jobs.

## Automated validation

| Check | Command / evidence | Result |
| --- | --- | --- |
| Full Node suite | `npm run test` | **3672 tests, 311 suites, 3672 pass, 0 fail, 0 skipped** |
| Task 5.5 assertions in full suite | Tests prefixed `5.5` in the final full-suite log | **29 passed**, including table-driven cases |
| Full lint | `npm run lint` | Exit 0; **0 errors, 1 existing warning**: unused `isVisible` argument in unrelated settings navigation |
| Strict TypeScript | `npx tsc --noEmit -p tsconfig.json` | Exit 2; **48 unrelated diagnostics**, none in task 5.5 paths |
| Whitespace | `git diff --check` | Pass |
| Fixture cleanup | `lsof -nP -iTCP:4185 -sTCP:LISTEN` after SIGINT | No listener remains |

TypeScript blockers are generated Next dev marketing-page imports (22) and
existing unrelated test types (26): accounting trigger union types, DepositGuard
module mocks/unused expected-error directives, SpendLeak evidence fixture types
and trial-access child-process environment typing. No generated cache deletion,
unrelated source edits or configuration exclusions were used to hide them.
Production build and deployment acceptance were not part of task 5.5 validation.

The first full run caught validation precedence for a direct converted-candidate
edit retry; moved pending-edit validation after existing conversion conflict
checks, then reran the entire suite successfully. Route validation still rejects
missing/empty/invalid edit patches before calling the service.

Actual route/service tests live in
[candidate memory tests](../../tests/commitguard-candidate-memory.test.ts), with
real detector, review logic, entitlement resolver, recurrence and transaction
rollback behavior; only storage/access-loader/auth boundaries are mocked.
Coverage includes all seven existing correction fields and subsequent conversion,
Int bounds/negative/fractional cents, malformed dates, unsupported recurrence,
unknown/forged fields, safe DTOs, original conversion retries, edit/ignore/reject
409s, missing/foreign 404, unauthenticated 401, legacy/schedule conflicts,
suppression retry no-ops, deliberate reopening and atomic audit failure 500.
Existing detection-service tests additionally cover 403, disabled/settings 409,
invalid-policy 400, unexpected 500 and guard-before-evidence behavior.

[Renderer tests](../../tests/commitguard-candidate-renderer.test.ts) execute real
React static rendering, not source-string matching: source currency/cents,
pending count, dates, evidence-change message, disabled policy explanation,
empty state and required legacy-threshold review. Pure boundary tests verify
safe invalid dates, internal-field removal and rejection of invented patch fields.

## Synthetic actual React browser acceptance

Ran [the fixture](../../tests/fixtures/commitguard-candidates-browser.mjs) at
127.0.0.1:4185. It bundles the **actual workspace, candidate component and settings
form** with React DOM. Only browser transport/router are mocked; this is not a
real authenticated Next page, DB/RLS proof or full production styling acceptance.
No real API calls or customer data. The server handles SIGINT/SIGTERM cleanup.

Verified with browser assertions:

1. Initial pending count 1; source USD 123.45, supplier and UTC dates visible;
   changed-evidence warning explains corrections were retained.
2. Detect returns 0 created / 1 updated / 2 skipped and the source warning;
   list and count use that returned result.
3. Negative draft amount produces inline invalid state with no review write.
   Corrected all supported fields: name, category, USD 222.29 → 22229 cents,
   quarterly, 2026-12-31, low confidence, manual classification. Refetched row
   shows all corrections; changed-evidence warning clears.
4. Reloaded disabled module, opt-out and legacy confirmed policy each disable
   Detect with the appropriate explanation. 409/403/500 transport responses
   display safe errors and require reload before another action.
5. Edit/confirm/ignore/reject converted conflicts preserve the draft/queue and
   provide original-commitment navigation. Historical conversion-review conflict
   is explicit rather than creating a commitment.
6. Ignore-save success followed by GET failure says **Save succeeded**; retry
   performs no additional mutation (synthetic write log unchanged), then count
   becomes 0. Ignored view remains reachable. Deliberate edit reopens pending;
   reject moves to rejected view; another deliberate edit followed by confirm
   returns pending count to 0.
7. Legacy settings threshold renders blank required review choice, with no
   confirmed option; choosing low saves. Candidate confidence likewise offers
   low/medium/high, not human confirmation as a detector confidence choice.
8. At 375px, fixture document width equals viewport width (375px), and controls
   remain labeled/reachable. This is fixture layout evidence, not complete
   production mobile acceptance.

Stopped fixture with SIGINT and verified port 4185 has no listener. No browser
fixture server or worker was left running.

## Explicit outstanding boundaries

- Automatic ingestion currently persists **pending requests only**. Task 6
  dispatch, leases/fences, repair/retries and scheduler authorization are not
  implemented by this task and must not be claimed deployed.
- No whole-workspace DTO or 7.2 coherent financial/renewal refresh, broad URL
  filtering/pagination, schema/RLS change, worker, email channel or new candidate
  field was added.
- No task checkbox changed. Shared deployment, authenticated production browser
  checks, existing TypeScript cleanup and complete change acceptance remain pending.