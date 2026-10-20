# CommitGuard task 9.3 — synthetic browser acceptance evidence

Date: 2026-10-20. Change: `fix-commitguard-cash-protection-workflows`.
**LOCAL / UNMERGED / NOT DEPLOYED — synthetic acceptance reviewed.**

## Verdict and evidence provenance

The recorded **main browser run passed all 349 assertions**, across eight ordered
phases. This report preserves the main-run results supplied in the continuation
handoff and checks their scenario meaning against the actual fixture source.
It is not a new browser execution, real Supabase-login acceptance, full Next.js
end-to-end certification, or rollout authorization. The acceptance review finds
task 9.3 met: its listed synthetic-tenant scenarios use cookie-bound synthetic
identity with real handlers/services, tenant RLS and PostgreSQL persistence.
Real Supabase sign-in and production Next routing remain outside this evidence;
they are not silently claimed by the word authenticated.

Main browser page: `56329de6`; server: loopback port **4193**. These identify the
recorded run, not a currently running service. Older component-only fixtures and
unsuccessful development attempts are not substituted for this main evidence.
This review accepts the recorded main run and confirmed cleanup, not a new run.

## Actual execution boundary

- [Integration server](../../scripts/verify-commitguard-authenticated-browser.ts)
  bundles the actual React dashboard/settings components and compiles the actual
  [global stylesheet](../../app/globals.css) through PostCSS/Tailwind. The
  [client entry point](../../tests/fixtures/commitguard-authenticated-client.tsx)
  uses real same-origin HTTP fetch and renders actual returned workspace DTOs.
- Browser tools execute the ordered
  [acceptance source](../../tests/fixtures/commitguard-authenticated-acceptance.mjs)
  served by the harness at `/fixture/acceptance-source`. There is **no browser
  fetch interception, fake persistence, or replacement financial-response map**.
  The Node server's external-fetch guard deliberately rejects external transports;
  this is distinct from intercepting browser-to-local-server requests.
- Actual CommitGuard route handlers, validation, financial services, effective
  access, tenant serialization and `withUserContext` operate on PostgreSQL, not
  mocked Prisma methods. Database binding alone points services at the disposable
  clone via the [browser DB helper](../../scripts/_commitGuardBrowserDatabase.ts)
  and [identity/baseline helper](../../scripts/_commitGuardVerificationClone.ts).
- The only database authority is a clone of local database `commitguard`, role
  `syspac`, PostgreSQL 17, Unix socket `/tmp/paidsoon-commitguard-pg.i62Iri`, port
  **55437**, with TCP listening disabled. Synthetic owner, other-tenant and
  allowance-race fixtures are seeded in the clone only. No customer data, shared
  target, provider request or real email is used.
- Authentication is **cookie-bound synthetic `getUser()`**, substituted in the
  test process with request-local identity. Each actual route still invokes its
  server auth path. The harness checks loopback Host/Origin and uses an HttpOnly,
  SameSite=Strict fixture cookie; its unrecognized-cookie and missing-cookie
  probes are not a Supabase JWT/session or production CSRF security audit.
- The actual targeted CommitGuard policies and canonical legacy column/table
  grants are installed in the clone. Legacy ownership policies and `auth.uid()`
  are test scaffolding, not deployed Supabase policies. This browser run is not
  the canonical legacy-policy execution performed separately in task 9.4, nor
  the raw-role CashPlan policy proof in task 9.2.
- Next navigation/link adapters are fixture stubs: refresh reloads actual DTOs
  into React, and links use real browser navigation. **No Next RSC server, proxy,
  production router refresh, real Supabase sign-in or recovery flow is exercised.**

## Main-run results

Assertions below are fixture assertions, not Node tests or additional suites.
Phases run in this order against the same fresh clone; later phases use state
committed by earlier phases. Dates derive from the harness UTC clock.

| Phase | Assertions | Source-backed scenario results — all passed |
| --- | ---: | --- |
| `cash` | 81 | Missing balance is null, not WATCH; explicit zero is complete; negative cash persists with shortfall text; day 7 remains fresh and day 8 becomes unavailable with an accessible update action. Clear preserves commitments. Stale expected revision returns 409; foreign edit returns 404; rejected writes preserve the full ledger fingerprint. |
| `recurrence` | 39 | AUD/USD totals remain separate and suppress false aggregate safety. A weekly anchor from 2000 skips historical occurrences; month-end projection matches an independent calendar oracle across all four horizons. Null schedule is incomplete. Legacy custom recurrence is visibly unsupported, can be repaired through the real editor, and new custom writes return 400. Supported repairs restore complete figures. |
| `candidates` | 50 | Name/category/amount/date/frequency/confidence corrections persist. Ignore changes pending count; deliberate editing reopens ignored state. UI double-click confirms corrected fields once. Four concurrent HTTP confirmations plus a sequential retry preserve one conversion identity/audit for that candidate; converted ignore returns 409. A manual-create/conversion last-slot race waits on two actual PostgreSQL sessions; exactly one succeeds and the other receives 403. |
| `pagination` | 13 | Keyboard navigation reaches three filtered commitment pages without duplicate IDs, preserves source/sort parameters, and filters before paging. Filter application resets page; large page integers clamp; no-match state is usable. Renewal pages expose 8/8/3 entries, all 19 distinct, with preserved navigation parameters. |
| `mutations` | 62 | Pause/resume/cancel persist and refresh hero/horizons/upcoming/renewals/review state. Renewal date/notice/auto-renew and essentiality/confidence edits persist, recompute urgent severity, and record changed-field audit. Editor focus opens/restores correctly. A deliberate one-shot workspace 503 after a committed save shows “Save succeeded”; retry is GET-only and preserves ledger content, audit and work. Cancelled resume returns 409. |
| `mobile` | 16 | At 375×812, no document horizontal overflow; the wide-table scroll region is keyboard reachable. Every rendered input/select/textarea is labeled; no positive tabindex. Cash keyboard order, Enter-to-open editor, editor width and restored trigger focus pass. Coherent financial surfaces remain visible. |
| `controls` | 68 | Actual manual-create form POST persists exactly one row. Saving a 60-day horizon updates protection without navigation. Dated same-currency weekly basis of 20000 cents × four weeks yields an 80000-cent buffer. Changing cash to USD retains the AUD basis and suppresses mismatched safety; restoration returns the saved policy coherently. |
| `readonly` | 20 | Actual workspace/cash/summary/timeline/commitments/settings GETs preserve complete row-content fingerprints, including events/work/evaluation/snapshots. Server synthetic `getUser()` calls occur. Foreign and missing mutations return indistinguishable 404 shapes and preserve data. Missing-cookie reads/writes and an unrecognized fixture cookie return 401; synthetic session can be restarted. |
| **Total** | **349** | **All passed** |

Coherence checks compare the rendered shared revision, four hero cards, cash and
free-cash formatting, each currency's four horizons, upcoming total, renewal total
and candidate count with the actual saved-service workspace DTO. They do not
prove completion of a production Next RSC refresh.

### Recorded database and authentication observations

| Observation | Main-run value |
| --- | ---: |
| Synthetic server `getUser()` calls | 367 |
| Clone commitments, all synthetic tenants | 190 |
| Clone commitment events | 33 |
| Clone durable work rows | 33 |
| Clone CashPlan snapshots | 0 |
| Main owner's calculation revision | 32 |
| Allowance-race tenant commitments | 150 |
| Observed PostgreSQL blocked sessions in the last-slot race | 2 |
| Linked conversions / conversion events | 2 / 2 |

These are final clone counts, not before/after production deltas. The two linked
conversions correspond to the two main-owner candidate scenarios; the final-slot
race independently proves one successful write and one allowance rejection.
Zero snapshots is consistent with the read-only/browser scope, not evidence that
scheduled CashPlan publication was exercised here.

### Recorded HTTP traffic

| Status | Recorded API responses |
| --- | ---: |
| 200 | 165 |
| 201 | 5 |
| 400 | 1 |
| 401 | 9 |
| 404 | 3 |
| 409 | 3 |
| 503 | 1 |
| **Total** | **187** |

This is the harness's `/api/` traffic ledger, not every fixture request or every
internal route invocation. In particular, `/fixture/race` invokes both actual
handlers directly under synthetic race identity; its losing **403** is asserted
in the race response, not an omitted top-level API traffic entry. The **503** is
the intentionally armed workspace-read failure, not an unexplained outage.

## Main-run shutdown and preservation

The recorded main server process **55330** was stopped with **SIGTERM**. Its
cleanup output was:

> PASS: template schema/ACLs/roles/data unchanged; probe clone removed

The recorded process exit was **0**. The baseline helper checks source catalogs,
relation/column ACLs and policies, roles/memberships, database inventory and all
public-table row counts/content hashes after dropping only the run-created probe
clone. This is preservation of the approved local template, not a shared-target
comparison. No source data, roles or runtime files were repaired by shutdown.

## Review limits and remaining gates

- This documentation-only continuation did not rerun the server/browser or
  query a shared target. Main execution totals and cleanup identity above are
  the supplied recorded evidence; scenario descriptions were inspected locally.
- Browser coverage is the specific scenarios above, not every OpenSpec scenario.
  Tax coverage editing, real provider ingestion, production routing/auth,
  warning-list draft behavior, every URL-filter combination, full assistive-
  technology auditing and CashPlan UI are not certified by these 349 assertions.
- [Task 9.1](commitguard-task-9-1-verification-2026-10-19.md) still records the
  unresolved offline **Geist / Geist Mono** build fetch failure and **48 baseline
  TypeScript diagnostics**. No fresh full-suite/build/typecheck pass is claimed.
- [Task 9.4](commitguard-task-9-4-verification-2026-10-20.md) records a confirmed
  **same-period digest regeneration P2002** caused by missing child DELETE
  policies. Browser success does not waive it. Separate reviewed approval and
  regression verification are required before rollout.
- [Task 9.5 rollout checklist](commitguard-task-9-5-rollout-checklist-2026-10-20.md)
  retains actual-target inventory, SQL application, one-owner scheduler activation
  and deployment sign-off as pending. Completing this synthetic acceptance task
  does not waive those gates or the open 9.1/9.4 blockers.
