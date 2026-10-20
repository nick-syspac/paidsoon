# CommitGuard task 7.5 review — 19 October 2026

**UNMERGED / NOT DEPLOYED.** Reviewed and finished the previous agent's existing
task 7.5 work only. No task checkbox was changed; task 7.6 and other outstanding
tasks were not implemented. OpenSpec progress remains 38/54 checked.

## Reviewed paths and corrections

- [Full editor](../../components/dashboard/commitguard/CommitGuardCommitmentEditor.tsx)
  and [draft validation](../../lib/commitguard/commitmentEditor.ts): classification,
  dates, recurrence, renewal, notice, auto-renew, source currency and descriptive
  fields; send changed fields only, retain legacy custom schedules on unrelated
  edits, retain drafts on validation/conflict, and never PATCH lifecycle status.
- [Workspace](../../components/dashboard/commitguard/CommitGuardWorkspace.tsx):
  editor focus on opening, focus back to the originating Edit button after React
  commits refreshed/enabled controls, and focusable renewal navigation targets.
- [Renewal presentation](../../lib/commitguard/renewalPresentation.ts) and
  [renderer](../../components/dashboard/commitguard/CommitGuardRenewals.tsx):
  independent eight-row pagination, stable notice-date/ID sorting, validated
  clamping and preserved URL parameters; source-currency annualization uses
  52/26/12/4/2/1 for weekly through annual schedules. One-off/custom context stays
  unavailable rather than guessing a run rate. Source charge/cadence remain
  visible even when annualization is unavailable. Fixed singular day wording.
- [PATCH route](../../app/api/commitguard/commitments/[id]/route.ts): reviewed
  existing strict ISO-date and field validation; no additional route edit in
  this review.
- [Renewal tests](../../tests/commitguard-renewal-editor.test.ts),
  [actual-route/service tests](../../tests/commitguard-lifecycle.test.ts), and
  [page tests](../../tests/commitguard-page.test.ts): retained prior integration
  coverage, corrected the obsolete page assertion that caused the previous
  full-suite failure, and asserted source charge/cadence for unavailable run rates.

The route/service tests execute real editor patch generation, PATCH validation,
mutation service, changed-field audit/revision handling, summary calculation and
renderers against mocked storage. They verify urgent-to-info renewal changes,
classification changes, one audit/evaluation request, no-op retry deduplication,
terminal-status editing and archived read-only behavior. These are not real
PostgreSQL audit, ACL, transaction or concurrency proofs.

## Final verification

| Check | Result |
| --- | --- |
| `npm run test` | **3,836 passed**, 311 suites; 0 failed/cancelled/skipped/todo; includes 17 tests explicitly named for 7.5 |
| `npm run lint` | Exit 0; **0 errors, 1 existing warning**, unused `isVisible` argument in [settings navigation](../../lib/settings/navigation.ts#L76) |
| `npx tsc --noEmit` | Exit 2; **48 diagnostics, byte-for-byte identical to prior agent's before log**; 22 generated Next dev route diagnostics and 26 existing accounting-trigger/DepositGuard/SpendLeak/trial-access test diagnostics |
| Editor diagnostics | None in the five edited source/test files |
| `git diff --check` | Passed |
| `openspec validate fix-commitguard-cash-protection-workflows --type change --strict` | Passed |

## Actual-component synthetic browser evidence

Used [the existing workspace fixture](../../tests/fixtures/commitguard-workspace-browser.mjs)
on local loopback with actual React components and compiled project Tailwind CSS.
All fetches were replaced by in-memory synthetic transport. No DB, authentication
provider, external API or email delivery was used.

- Nineteen synthetic records yielded 17 eligible renewals (cancelled/expired
  excluded), reachable across **8 / 8 / 1** pages. Next navigation included
  keyboard Enter; unrelated search/status/commitment-page/alert-page parameters
  persisted. Unit tests independently cover 19 eligible rows as **8 / 8 / 3**,
  unique reachability and unsafe/fractional page rejection.
- At **375px**, document scroll width remained **375px**, including all 18
  labeled editor fields and error states. Renewal anchor navigation focused the
  target row; opening focused the editor; successful save restored its Edit
  button after refreshed controls became enabled.
- Successful single-record edit: one PATCH, one workspace GET, one recorded
  router refresh; calculation revision **1 -> 2**, next-30-day commitments
  **10,000 -> 20,000 cents**, free cash **490,000 -> 480,000 cents**, renewal
  **Urgent -> Info**, auto-renew **Yes -> No**, notice **30 days**, annualized
  **AUD 2,400.00**, upcoming category/confidence updated and review count retained.
- Separate USD renewal edit changed category, confidence, essentiality, source,
  quarterly frequency, renewal date, notice and auto-renew with a single PATCH.
  Save-success/GET-failure retained revision 2 while synthetic storage reached
  revision 3; GET-only retry published revision 3 with writes still **2**,
  reads **2 -> 3**, and no repeated successful mutation.
- A 409 retained the custom-schedule notes draft; reload changed reads **3 -> 4**
  with writes still **3**. Notice 366 produced an accessible inline client error
  and no write. Synthetic 400 displayed linked date/notice errors and retained
  the draft. Subsequent successful unrelated save sent only `notes`, preserving
  `frequency: custom` and restoring Edit focus.

## Exact limits

Browser transport is synthetic and its mutation store is not the service audit
implementation. Router refresh is a recorded stub, **not proof of real Next.js
RSC refresh, authenticated navigation, live persistence or event processing**.
Audit persistence is covered only by mocked-storage actual-service tests here;
future event relevance relies on existing evaluator tests, not a live job run.
This is targeted keyboard/label/mobile verification, not a full assistive-tech or
automated accessibility audit. No production build, worker suite, database/RLS
probe, migration, SQL application, scheduler activation or deployment was run.
Verification used local Node **26.10.0**; the package declares Node **24.x**.
The synthetic server emits the existing Node module-register deprecation warning.
No dependencies, secrets, plan behavior or task checkboxes were changed.