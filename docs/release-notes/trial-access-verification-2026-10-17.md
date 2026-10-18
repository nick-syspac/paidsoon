# Tenant trial access verification — 2026-10-17

## Shared-development rollout follow-up — 2026-10-18

The user explicitly authorized persistent application on shared development
`rtnjcvjqimnavghmrhlx`, waived the isolated-first gate for this rollout and
confirmed compatible writers deployed/old writers drained. That operational
confirmation was supplied by the user, not independently verified here.

Using the canonical session-mode adapter and credentials loaded from the local
environment file, a read-only history inventory found exactly two pending
migrations and no unfinished migration. Both were applied unchanged, with their
reviewed SHA-256 hashes verified before execution:

- `20261015060205_add_billing_webhook_processing_lease`
- `20261015095612_add_tenant_billing_mutation_journal`

One SQL transaction revoked unsafe creator defaults before journal creation,
applied both migrations, the separate supplemental CHECK SQL (outer wrapper
removed in memory), full trial/profile policies and customer journal policies.
Lock waits were bounded to five seconds and statements to sixty seconds.
All seven journal index definitions, both validated CHECK constraints and
deny-by-default journal table/column ACLs with enabled RLS were checked before
commit. The transaction committed successfully. No historical SQL was edited,
no customer history fabricated and no reservation or trial date reset.

The official `prisma migrate resolve --applied` command then recorded each
already-executed migration; migration history was not manually edited.
`prisma migrate status` reported **55 migrations; database schema up to date**.
`npm run check:db-grants` passed, including both journals/steps, creation defaults
and protected profile authority columns. No shared `migrate dev` was run.

Earlier **unapplied** labels below describe the historical offline verification,
not the current state of this shared-development target. This application and
catalog/grant audit are not isolated behavioral RLS/constraint tests or
authenticated browser E2E. Tasks 3.8/3.9/9.3/9.4/9.5 remain unchecked for their
outstanding evidence; deployment readiness is not asserted.

## Scope and acceptance

Change: **add-superuser-tenant-trial-access**. This is verification of the current
uncommitted working tree, not a release announcement or deployment approval.
Repository HEAD was `6b419c24cb3d4e02cf8df7a2f81f9ddb1e6df1d6`.
The checks include the latest onboarding/source-limit work, owner UI, operator
documentation and direct elevated-staff route-denial tests.

| Task | Finding from this verification |
| --- | --- |
| 9.1 | **Accepted for the requested offline Node/mock scope.** All 107 changed/new Node test files passed separately, followed by the complete configured Node suite. The scenario inventory below includes actual handlers/services with mocked infrastructure, pure unit tests and static contracts. It is not database isolation or production concurrency proof. |
| 9.2 | **All requested commands actually executed; baseline-qualified result.** Changed/full ESLint, Prisma validation/generation and the unchanged production build passed. Standalone TypeScript remains blocked by the same 47 baseline diagnostics, before and after the build. No additional diagnostic was found relative to the recorded prior snapshot; this is not a globally type-clean result. Verification execution is complete locally, but an all-green TypeScript acceptance remains blocked. |
| 9.3 | **Pending.** No SQL, migration, grant/policy application, database probe, scratch/shadow validation or live RLS verification was performed. |
| 9.4 | **Pending.** Prior component-fixture screenshots and mocked handler tests are not authenticated browser end-to-end coverage. No new authenticated browser run or Stripe test clock was performed here. |
| 9.5 | **Pending.** Source and documented deployment order were reviewed; actual deployed writers, target state, provider configuration, cutover/drain, rollback and environment settings were not verified. |

No OpenSpec task checkbox, proposal/design/spec, memory, existing application,
test, schema or SQL file was edited by this verification. Only this report was
added to the repository. Existing client/build generation was allowed to refresh
ignored output. Content hashes of all 420 initially changed/new files were
compared after the checks: **zero changes to those files**. No unrelated errors
were repaired or suppressed.

## Execution environment and safety

- Executed on macOS with Node **26.10.0**, npm **11.19.1**, Next **16.2.9**,
  TypeScript **5.9.3**, ESLint **9.39.4**, Prisma **7.10.0**, Stripe SDK **22.2.0**,
  React **19.2.4** and Node type declarations **20.19.41**. These are installed
  versions, not substitutions for manifest ranges. The declared Node engine is
  **24.x**; a supported-engine/CI run was **not** verified. No packages were
  installed or upgraded.
- Commands ran through a temporary external runner with an allowlisted process
  environment. Locally declared dotenv keys were shadowed with empty or dummy
  values; real dotenv values were not printed or passed through as credentials.
  Dummy Supabase compatibility outputs were derived using the existing canonical
  adapter, not a custom database URL override. No environment files were edited.
- A Node preload blocked database/provider networking through socket, DNS,
  HTTP(S) and fetch boundaries. Google Fonts hosts were permitted; loopback IPC
  and non-database local connections were permitted for build tooling. Database
  ports 5432/6543 were blocked. **Zero network-denial markers** appeared in the
  final test/lint/Prisma/build logs. This is a guardrail, not an OS packet capture
  or proof that every possible native transport is intercepted.
- `npm run test` still supplied its checked-in dummy Supabase ref/password.
  Provider, database and authentication boundaries in tests remained mocked or
  stubbed. No live DB/provider verification was attempted. Fonts were not mocked
  or replaced; no font-download failure occurred in this build.
- Prisma validation used `PRISMA_GENERATE_ONLY=true`. Both generation invocations
  used the existing generate-only script. No migration/status/diff/application,
  seed, grant, SQL executor or `verify-rls` command was run.

### Build-time data-access inspection

Before running the existing build, source inspection found:

| Surface | Inspection and safety consequence |
| --- | --- |
| [Root layout](../../app/layout.tsx) | Uses `next/font/google` for Geist and Geist Mono; network-sensitive font build step, not a billing/provider operation. |
| [Blog static parameters](../../app/%28marketing%29/blog/[slug]/page.tsx), [blog metadata reader](../../lib/blog/content.ts) | Reads local MDX/frontmatter/filesystem, not the database. |
| [Feature static parameters](../../app/%28marketing%29/features/[slug]/page.tsx), [integration static parameters](../../app/%28marketing%29/integrations/[integrationId]/page.tsx), [sitemap](../../app/sitemap.ts) | Checked-in catalogs/local content supply static paths and metadata. No provider mutation in these paths was found. |
| [Help page](../../app/%28marketing%29/help/[[...slug]]/page.tsx), [server Supabase client](../../lib/supabase/server.ts) | Help can read platform training data at request time. It reaches `cookies()` through `createClient()` before its database lookup; no static parameters are exported. It must not be assumed to be a database-free page. |
| [Dashboard layout](../../app/dashboard/layout.tsx) | Reads request headers/auth before user data; request-dependent, not an unconditional static DB read. |
| [Deposit token page](../../app/pay/deposit/[token]/page.tsx) | Explicitly force-dynamic; its view helper is not assumed to be read-only merely because the page is a GET. |
| [Promise token page](../../app/promise/[token]/page.tsx) | Contains a Prisma read and no static-parameter generator. Dummy configuration/network blocking remained in place rather than trusting build classification alone. |
| [Prisma configuration](../../prisma.config.ts), [Next configuration](../../next.config.ts), [admin client](../../lib/db/admin.ts) | Generate-only configuration uses a dummy datasource. Importing the lazy Prisma client is not itself a DB query. Next configuration materializes public environment only. |

The actual build generated **236/236 static pages**, listed authenticated/token
surfaces as dynamic, and reported `ƒ Proxy (Middleware)`. There was no build-time
database/provider denial or failure in its log. No production page request,
application server, cron, payment or email was exercised by the build.

## Commands and exact results

All commands below used installed dependencies, dummy/isolated environment and
the network guard described above. `--no-install` prevented npx from fetching a
package. It does not suppress diagnostics or change compiler/lint rules.

| Command | Exit | Result | Duration |
| --- | --- | --- | --- |
| `npx --no-install tsc --noEmit` before build | 2 | 47 diagnostics: 22 generated Next dev types, 25 existing test-type errors | 2.349 s |
| `node --experimental-test-module-mocks --import tsx --test <all 107 changed/new .test.ts paths>` | 0 | **2,283 tests passed**, 120 suites; 0 failed/cancelled/skipped/todo | 4.729 s |
| `npm run test` | 0 | **3,092 tests passed**, 296 suites; 0 failed/cancelled/skipped/todo | 10.454 s |
| `npx --no-install eslint <all 381 changed/new TypeScript paths>` | 0 | 0 errors, 0 warnings | 4.472 s |
| `npm run lint` (existing full `eslint` script) | 0 | 0 errors, 1 existing warning | 12.043 s |
| `PRISMA_GENERATE_ONLY=true npx --no-install prisma validate` | 0 | Current canonical schema valid | 0.888 s |
| `npm run prisma:generate` | 0 | Prisma Client 7.10.0 generated successfully | 1.106 s |
| `npm run build` | 0 | **Unmodified script:** `npm run prisma:generate && next build`; generation, optimized compilation, Next TypeScript phase and 236/236 static pages completed | 21.420 s |
| `npx --no-install tsc --noEmit` after build | 2 | Same 47 diagnostic multiset; no new generated-route or source diagnostic | 9.151 s |

The successful focused run started at **2026-10-17T02:56:18.417Z**, the successful
full run at **02:56:23.298Z**, the build at **02:57:05.595Z**, and the post-build
compiler check at **02:57:27.195Z**.

The configured full script discovers **241 .test.ts files**. It does **not** run
the three existing TSX tests: [email settings client](../../tests/email-settings-client.test.tsx),
[SpendLeak evidence details](../../tests/spendleak-evidence-details.test.tsx) and
[template AI guardrails](../../tests/templates-client-ai-guardrails.test.tsx).
The standalone compiler does include those sources. Python worker tests were
inspected where relevant but **not executed** in this Node-only verification.
No coverage instrumentation/percentage or exhaustive branch-coverage claim is
made. The focused selection included all 63 modified and 44 new .test.ts files,
not just files whose names contain “trial”.

### Initial harness-only failures, retained rather than concealed

The first isolated focused run was **2,282/2,283**; the first full run was
**3,089/3,092**. These were not repaired in product/test code:

1. Supplying an HTTPS dummy `NEXT_PUBLIC_APP_URL` introduced a legitimate
   promise-to-pay URL into a reminder body. The existing whitespace-payment-URL
   test asserts that the entire text contains no `https://`, so it failed.
   The temporary test environment was changed to an empty app URL; the build
   retained a valid dummy HTTPS app URL. Other tests still set their own URLs.
2. Empty-shadowed admin numeric settings parse as NaN rather than taking the
   tests' nullish defaults. The temporary runner supplied the documented test
   defaults `ADMIN_MAX_FAILED_ATTEMPTS=5` and
   `ADMIN_CHALLENGE_TTL_SECONDS=120`.

Both test scopes were rerun in full after this harness-only correction. Final
runs have zero failures and zero blocked network calls. The initial failures
remain in separate logs; they are not represented as fixed application bugs.

### Standalone TypeScript baseline, not a clean-type claim

Compared against the prior task-5.4 compiler log, SHA-256
`0f43da8254c5df2501e7fed0a79f1298f9205c7aacdd8bf82fadf212fd278281`:

| Existing diagnostic group | Count |
| --- | ---: |
| Stale .next/dev/types references for 11 former marketing pages, two TS2307 errors each | 22 |
| [Accounting trigger-sync test](../../tests/accounting-trigger-sync.test.ts): TS2322 and union property access | 5 |
| DepositGuard route/public-page/payment-webhook fixtures using `mock.module` `exports` unsupported by installed Node type declarations: TS2353 | 13 |
| Existing unused `@ts-expect-error` in [public requests](../../tests/deposit-guard-public-requests.test.ts) and [reminder delivery](../../tests/deposit-guard-reminder-delivery.test.ts) | 3 |
| [SpendLeak evidence details](../../tests/spendleak-evidence-details.test.tsx): union properties, unknown JSON and duplicate evidence | 4 |
| **Total** | **47** |

The 25 non-generated diagnostics are in tests, not application/lib source.
Several affected test files are themselves in the wider working-tree diff;
“baseline” means present in the recorded prior compiler snapshot, not that every
file is untouched by the whole feature.

Exact text differences from the prior log were two reminder-test locations moving
from 35/63 to 41/69 and ordering of the same string-union members in the
accounting diagnostic. Pre/post-build output differs only in that union ordering.
Comparing diagnostic multisets after normalizing locations and union-member order
found **no additions or removals** in either run. Raw logs remain intact. No stale
Next types were deleted, tsconfig exclusions changed, errors suppressed or tests
rewritten. Next's successful build TypeScript phase does not negate the failing
standalone project-wide check.

Full ESLint's single warning is the pre-existing unused `isVisible` argument in
[settings navigation](../../lib/settings/navigation.ts#L76), outside the changed
file set. Node's experimental/deprecated module-mocking warnings and the build's
`DEP0205` module-registration deprecation were non-fatal and were not suppressed.

## Scenario coverage matrix

All rows below describe **executed offline tests**, except the explicitly
identified worker source inspection. Real handlers/services are exercised where
stated, but their injected clients/transactions are not real Postgres, Supabase,
Stripe or Resend. These results cannot prove live RLS/ACLs, transaction isolation,
distributed exactly-once effects or provider configuration.

| Concern | Current evidence and important boundaries |
| --- | --- |
| Owner authorization and direct staff requests | [Admin route tests](../../tests/admin-trial-access-route.test.ts) invoke all six management endpoints plus the legacy adapter with the real guard/session/authority logic and mocked auth/cookie/role/device persistence. Cover unauthenticated/no-role/support/admin/disabled owner, missing/wrong/foreign/expired/revoked elevation, invalid/foreign/non-active device, both impersonation modes and pre-target-read denial. Explicit otherwise-valid requests cover both elevated staff roles on all seven endpoints, plus both legacy days-body attempts: **16 direct staff cases**, not UI hiding. |
| Management inputs and response scope | Same route suite checks strict paths/body/query/origin/fetch metadata, foreign tenant/actor/operation 404, safe projections and 400/401/403/404/409/502/503/202 results. [Customer operation routes](../../tests/billing-operations-route.test.ts) cover own-root scope, foreign/admin/internal-child absence, strict recovery body and safe redaction without entitlement gating. |
| Session-specific confirmation versus recovery | [Owner saga/recovery](../../tests/stripe-trial-extension.test.ts) and admin route tests cover original actor/session confirmation, same original actor under fresh elevation for status/recovery, immutable original journal session and appended current recovery audit; different-owner substitution is denied. Notification retry keeps original-session authorization. |
| Source precedence and exact expiry | [Effective access](../../tests/effective-access.test.ts), [loaders](../../tests/effective-access-loaders.test.ts), [presentation](../../tests/subscription-status-presentation.test.ts) and dashboard suites cover paid/Stripe/grant/onboarding/grace precedence, latest independent expiry provenance, no-profile/unknown/denied nullable tier, exact exclusive grant end, revocation continuity and no default-Essentials authorization fallback. |
| Duration, timezone and saved preview | [Input](../../tests/trial-access-input.test.ts), [preview](../../tests/trial-access-preview.test.ts) and [admin client](../../tests/admin-trial-access-client.test.ts) cover 7/14/30 elapsed days, explicit offsets/UTC, DST gaps/overlaps, normalization to seconds, public plan restrictions, required trimmed reason, non-shortening/horizon, immutable absolute target, 15-minute TTL, replay/identity/hash conflicts, state/version/fingerprint changes and reservation acquisition/release invalidation. |
| Eligibility and independent billing restrictions | [Eligibility](../../tests/trial-eligibility.test.ts), [signed risk events](../../tests/stripe-billing-risk-webhook.test.ts) and effective-access tests cover linked customer/subscription identity, paginated invoices/charges/disputes, paid/delinquent/incomplete restrictions, debt-free paused/canceled candidates, unknown/provider failures, lost/unresolved disputes and debtor/Connect exclusions. Only verified resolution of the specific risk restores a still-valid grant; unrelated paid/deleted events do not clear risk. |
| Local grant/revoke atomicity and quotas | [Local operations](../../tests/trial-access-operations.test.ts), [mandatory audit](../../tests/admin-trial-audit.test.ts) and [chase volume](../../tests/chase-volume-limits.test.ts) cover initial/result audit failure rollback, atomic grant/version/outbox/result, same-window start on extension/plan change, new window after lapse/revoke, preserved consumption, all public plan limits, single/batch parity and Melbourne fallback. Revocation does not cancel independent paid/Stripe/onboarding access. |
| Stripe-only owner extension | [Stripe extension suite](../../tests/stripe-trial-extension.test.ts) checks exact frozen `trial_end`, `proration_behavior: none`, stable request key and disabled automatic retries; committed reservation/attempt/audit before provider mutation; fresh verified periods; unsupported schedule/cancellation/pending-update/items/horizon blocked; no price change, incidental resumption or application-grant fallback. |
| Uncertain owner outcomes and recovery | Same suite covers timeout/cached 500/success followed by DB failure/lost responses, concurrent reclaim/stale fences/lease expiry, strict before/at/after 24-hour replay, evidence-only late recovery, exactly one durable successful audit/outbox in mocks and signed operation-attributable webhook finalization. Matching date/status/timestamp alone cannot release a reservation. |
| Durable customer journal and all existing billing actions | [Real coordinator/executors/actual route suite](../../tests/tenant-billing-mutation-coordinator.test.ts), plus Checkout/cancel route tests, exercise customer prerequisite/root handoff, Checkout creation, upgrade, local onboarding cancellation, cancellation/general portals, schedule create/phase update/release; frozen URLs/prices/trial/metadata, no dispatch before durable acceptance, exact per-step keys, write-once requests, partial failures retained, no direct subscription cancel/resume and no synthetic requested active/tier projection. |
| Own customer recovery, crashes and retained-key limits | Same coordinator suite covers one explicit attempt, known-ID retrieval, bounded unique correlation/discovery, portal lacking retrieve/list, strict per-step 24-hour boundary, cached 500, failures after provider success, late unknowable creates remaining reserved, schedule crash recovery, supersession only for proven outcomes and safe terminal replay. [Billing operations route tests](../../tests/billing-operations-route.test.ts) retain authentication/tenant scope and no arbitrary recovery intent. |
| Hosted creation versus lifecycle and reconciliation fencing | [Shared coordinator](../../tests/tenant-billing-coordinator.test.ts), [Checkout success](../../tests/billing-checkout-success-route.test.ts), [snapshot mapper](../../tests/stripe-subscription-snapshot.test.ts), [webhook](../../tests/stripe-billing-webhook-route.test.ts) and owner saga suites cover open session reservation release, completed paid/no-payment-required trials, same-session replay, verified legacy mapping, competing/newer bindings, delayed completion during either reservation, fresh current truth, unchanged grants/risk/sequences and operation-specific finalization proof. |
| Signed webhook receipt/claim/result atomicity | [Ledger](../../tests/stripe-billing-webhook-ledger.test.ts), webhook/risk/coordinator/owner suites cover invalid signatures before persistence, retry after receipt failure, interrupted/concurrent claims, lost/expired tokens and atomic projection/risk/result/terminal-ledger rollback. Older/equal delivered timestamps cannot undo fresh confirmed billing state. |
| Latest onboarding plan-intent change and source limits | [Actual onboarding route/page](../../tests/onboarding-intent-route-page.test.ts), [actual picker/Checkout client](../../tests/onboarding-checkout-client.test.ts), [source routes](../../tests/effective-source-routes.test.ts) cover all four public plans, rejected hidden/legacy/malformed/unauthenticated input, completion-only tenant-RLS write, no upsert/billing write/automatic Checkout, failed completion, completed/paid skips, explicit-button UUID/version/202 recovery and all **seven** source paths with caps **1/1/1/3**. Fresh expiry/tier checks retain reconnect/counting rules and do not resume canceled/paused subscriptions. |
| Subscription-controlled HTTP/service boundaries | [AST route inventory](../../tests/subscription-access-inventory.test.ts), [actual access-route tests](../../tests/subscription-access-routes.test.ts), feature/module tests cover **213 API files**: 127 directly wrapped files/160 exported wrapped methods, two guarded aliases, 84 explicit exclusions, plus an action-scoped deposit guard. Billing/auth/recovery/cleanup remain reachable. Cross-tenant invoice/resource tests are mocked application-boundary tests, not DB isolation proof. |
| Dashboard/settings/admin health and legacy UI removal | Dashboard/profile/page/subscription tests, [admin subscription](../../tests/admin-tenant-subscription.test.ts) and [legacy UI](../../tests/admin-trial-legacy-ui.test.ts) verify safe billing versus effective-access presentation, owner-only management mount/diagnostic link, staff health visibility, no stale generic days-action button and legacy adapter delegation only. [Admin client tests](../../tests/admin-trial-access-client.test.ts) cover lost responses, bounded GET-only polling, immutable confirm, stale-state refresh, reload/new elevation, safe failures, revocation continuity and delivery-only retry. |
| Reminder, sender and AI reauthorization | [Reminder execution](../../tests/reminder-execution-access.test.ts), [sender/AI](../../tests/effective-reminder-ai-access.test.ts), chase/dedup/email tests cover expiry/revocation after queue/template work and before sending, no success log/quota/sequence advancement on denied skips, effective sender features, monthly AI cadence, preserved usage on extension and continued started sequences at allowance capacity only while access remains allowed. |
| Summary and financial jobs | [Summary execution](../../tests/summary-execution-access.test.ts), financial access/dispatch/breach/shared-service suites cover grant eligibility, expiry/revocation/restriction skips before computation/notifications, actual cron/internal dispatch paths, preserved auth/input checks and feature/readiness gates. [Worker selector tests](../../worker/tests/test_claims.py) and [worker SQL](../../worker/paidsoon_worker/db.py) were **source-inspected only**: safe-superset claims replace raw-plan filters; execution authorization remains in Next.js. |
| Notification contact, content and independent delivery | [Contact](../../tests/trial-access-contact.test.ts), [notification sender/template](../../tests/trial-access-notification.test.ts), [delivery](../../tests/trial-access-delivery.test.ts) cover verified Stripe billing contact/labeled owner fallback, immutable recipient/payload/system sender/key, sanitized source-specific copy without internal reason, default off, missing contact, error-valued SDK failures, access success surviving send failure, concurrent claims/stale executor, unchanged retry, exact 24-hour unknown boundary and obsolete/expired/revoked/superseded suppression. No real email delivery or exactly-once provider guarantee. |
| Database artifact and probe lifecycle contracts | [Schema contracts](../../tests/tenant-billing-mutation-schema-contract.test.ts), [customer policy contracts](../../tests/tenant-billing-mutation-policy-contract.test.ts), [trial policy parity](../../tests/trial-access-policy-contract.test.ts) inspect local schema/SQL/source. [Probe lifecycle](../../tests/tenant-billing-mutation-probe-lifecycle.test.ts) mocks `pg` to verify rollback/close/order after failures. These tests execute **no real constraints, policies or grants**. |
| Profile-write security regression | [Profile authority](../../tests/profile-settings-trial-authority.test.ts), [user profile](../../tests/user-profile.test.ts) and onboarding tests check existing-profile name edits cannot reset trial/billing fields, only missing settings profiles invoke the existing bootstrap, onboarding never bootstraps and protected authority is not customer-supplied. Live profile-column ACL proof remains deferred. |

## High-impact source spot checks and writer inventory

The following were checked directly in current source, not inferred solely from
test names or earlier session summaries.

1. [Owner authority](../../lib/admin/trialAccessAuthority.ts) calls
   `requireAdminElevation({ minRole: "platform_owner" })`, validates current owner
   context, rejects both impersonation fields and checks matching active,
   unrevoked device before target reads. [Transport](../../lib/admin/trialAccessRoute.ts)
   invokes that authority before path/body/tenant reads, enforces same-origin on
   mutations and allows only strict server-journal-directed dispatch. Original
   session is required for confirm/retry; original actor with current elevation
   is sufficient for status/recovery. These are distinct authorization contracts.
2. [Effective resolver](../../lib/billing/effectiveAccess.ts) denies with null tier,
   preserves linked paid/grace precedence, distinguishes Stripe/onboarding/grant
   timing, applies `startsAt <= now < expiresAt`, suppresses grants on known or
   unknown risk and separates expiry provenance from the preferred current plan.
   [Customer loader](../../lib/billing/effectiveAccessLoader.ts) and
   [snapshot selects](../../lib/billing/effectiveAccessSnapshot.ts) use scoped
   `withUserContext` and safe grant/risk fields. This source review does not prove
   that target DB roles/policies implement the intended boundary.
3. [Saved preview](../../lib/billing/trialAccessPreview.ts) fingerprints both
   reservations/version/binding/grant/risk/effective source, binds actor/session,
   preserves frozen normalized intent and rejects stale confirmation. [Local
   operation](../../lib/billing/trialAccessOperations.ts) writes mandatory audit,
   grant/version/result/outbox in one transaction, retains a continuing window
   start and does not overwrite billing state. [Allowance](../../lib/billing.ts)
   uses the current effective grant's window rather than an unrelated later expiry.
4. [Customer coordinator](../../lib/billing/tenantBillingMutationCoordinator.ts)
   reserves and records first-attempt time inside a completed transaction before
   dispatch. [Fences](../../lib/billing/tenantBillingFence.ts) validate tenant,
   reservation kind, binding, lease/token and customer execution generation.
   Lease expiry is not reservation release. [Executors](../../lib/billing/customerBillingExecutors.ts)
   pass frozen parameters and stable per-step keys with zero automatic retries;
   customer/root handoff and multi-step proof remain coordinator-owned. The old
   post-freeze period-end mutation discussed in earlier research is **not present**
   in the current executor; no stale research verdict is carried forward.
5. [Owner extension](../../lib/billing/stripeTrialExtension.ts) and
   [recovery](../../lib/billing/stripeTrialRecovery.ts) update only frozen trial end
   plus no-proration options after committed reservation/audit, retain unknown
   outcomes, never silently create a grant and disallow blind late replay. Recovery
   preserves original journal session and appends current-session attribution.
6. [Billing webhook](../../app/api/webhooks/stripe-billing/route.ts) verifies raw
   signature before ledger persistence. [Ledger](../../lib/billing/webhookLedger.ts)
   makes failed/expired claims retryable; busy is not terminal success. [Shared
   reconciliation](../../lib/billing/tenantBillingCoordinator.ts) rechecks fences
   after provider reads and commits projection/risk and terminal ledger together.
   [Hosted lifecycle](../../lib/billing/hostedCheckoutLifecycle.ts) is read-only at
   Stripe; it verifies completed sessions/current subscriptions/unique binding and
   cannot release an owner or another customer's reservation from creation proof.
7. [Onboarding](../../app/api/onboarding/route.ts) writes only authenticated own
   `onboardingCompletedAt` through RLS; selected tier is validation/purchase intent.
   [Profile settings](../../app/api/settings/profile/route.ts) only updates display
   name and invokes the existing bootstrap if genuinely missing. Neither route is
   an alternate chosen-plan trial writer. [Signup bootstrap](../../lib/actions/auth.ts)
   remains the explicit original bounded onboarding initialization, not an owner
   grant path.
8. [Reminder send](../../lib/email/send.ts) reauthorizes on dedup recovery and
   resolves fresh sender/access immediately before send/suppressed-send logging.
   [Delivery engine](../../lib/email/trialAccessDelivery.ts) commits claims before
   send, checks obsolescence/retention, uses independent delivery status and does
   not roll back access on notification failure. Real race/commit behavior still
   requires the deferred infrastructure checks.

### Existing customer and legacy route paths

| Method/path | Current source delegation |
| --- | --- |
| POST `/api/billing/checkout` | [Checkout route](../../app/api/billing/checkout/route.ts) → `customerBillingMutationRoute(..., "checkout")`: journaled new Checkout/upgrade and customer prerequisite. |
| POST `/api/billing/cancel` | [Cancel route](../../app/api/billing/cancel/route.ts) → shared boundary `cancel`: journaled local onboarding cancel or cancellation portal, **not subscription cancellation**. |
| POST `/api/billing/portal` | [Portal route](../../app/api/billing/portal/route.ts) → shared boundary `portal`: keyed session/customer prerequisite. |
| POST/DELETE `/api/billing/downgrade` | [Downgrade route](../../app/api/billing/downgrade/route.ts) → shared boundary `downgrade`/`undo_downgrade`: keyed schedule workflow/release. |
| GET `/api/billing/operations/[operationId]`; POST its `/reconcile` | [Status](../../app/api/billing/operations/[operationId]/route.ts), [recovery](../../app/api/billing/operations/[operationId]/reconcile/route.ts) → authenticated own-root projection/one-attempt recovery, not a new intent API. |
| GET `/api/billing/checkout/success` | [Authenticated callback](../../app/api/billing/checkout/success/route.ts) → RLS ownership read and verified hosted lifecycle, no raw customer-role billing update. |
| POST `/api/admin/tenants/[id]/actions/extend-trial` | [Legacy adapter](../../app/api/admin/tenants/[id]/actions/extend-trial/route.ts) → the same owner transport, stored Stripe intent only. Old `{days}` cannot bypass preview/reason/UUID/version/audit. |
| Owner management GET; preview/confirm/status/reconcile/notification retry | All six new route files delegate to [the same owner transport](../../lib/admin/trialAccessRoute.ts); no diagnostic-specific mutation implementation remains. |
| POST `/api/webhooks/stripe-billing` | Signed lifecycle/risk processing and attributable owner finalization under shared coordination, not arbitrary provider mutation. |

Repository-wide subscription/customer/Checkout/portal/schedule mutation searches
found active runtime billing SDK writes in the keyed customer executor and the
owner extension/recovery services, not directly in API routes or the worker.
One **dormant unkeyed helper** remains:
`createSubscriptionCancellationPortalSession()` in
[subscription helpers](../../lib/billing/stripeSubscriptions.ts#L197-L202).
Both text search and TypeScript references found **only its definition**, with
no current caller. It was not removed as unrelated cleanup. Consequently the
precise conclusion is **no enabled legacy unjournaled route writer was found in
this source inventory**, not “there is no unkeyed call anywhere”, nor proof that
an old deployed instance/in-flight request cannot coexist with owner mutations.
Actual release/drain evidence is still required by 9.5.

## Changed-file accounting

Captured with `git diff HEAD --name-only -z`, `git ls-files --others
--exclude-standard -z`, `git diff --stat`, `git diff --cached --stat` and content
hashes. No staged changes were present. Generated/ignored output is not included.

| Area | Tracked modified | Untracked before this report | Total before report |
| --- | ---: | ---: | ---: |
| app | 156 | 8 | 164 |
| components | 11 | 3 | 14 |
| content | 1 | 0 | 1 |
| docs | 10 | 6 | 16 |
| lib | 43 | 45 | 88 |
| openspec | 0 | 10 | 10 |
| prisma | 2 | 7 | 9 |
| proxy | 1 | 0 | 1 |
| scripts | 2 | 2 | 4 |
| tests, including helpers | 63 | 47 | 110 |
| worker | 3 | 0 | 3 |
| **Total** | **292** | **128** | **420** |

Tracked diff: **5,889 insertions, 2,907 deletions across 292 files**. Ordinary
`git diff --stat` omits the 128 untracked files, including customer/owner services,
routes, tests, three SQL migrations, supplemental SQL, OpenSpec artifacts and
six synthetic UI screenshots. The 47 untracked test-area files comprise **44
.test.ts files and three helpers**. Changed-file lint covered **381 TypeScript
files**, including both tracked and untracked files.

Adding this report makes **129 untracked / 421 total changed-or-new files**,
with docs at 17. Those counts describe the current complete working tree, not a
claim that all pre-existing edits were authored in this session.

## Database review manifest — local files only

SHA-256 values below were computed directly from current files after validation,
generation and build. **Nothing in this manifest was applied in this session.**
Historical dev application below is a recorded runbook fact, not reverified DB
state; the unapplied lease/customer/CHECK/full-security artifacts remain deferred.

| Artifact | Bytes | SHA-256 | Status/boundary |
| --- | ---: | --- | --- |
| [Canonical schema](../../prisma/schema.prisma) | 151440 | `16b63e75987a89005841d923fea958a7e278a8e41b2f4afd9be70efc920378c7` | Validated/generated locally only. No live-schema parity claim. |
| [Initial owner trial migration](../../prisma/migrations/20261014093943_add_superuser_tenant_trial_access/migration.sql) | 8143 | `46665d9077823485d30d7fc442ff2fc8af2efa14be962b6b5624a67bd034d168` | Runbook records dev application on 2026-10-15; not rerun or checked here. Four trial/risk tables, owner reservation/version. |
| [Webhook processing lease migration](../../prisma/migrations/20261015060205_add_billing_webhook_processing_lease/migration.sql) | 152 | `f3b9cfeffe19b9a7c8ebac896ebfc38c1d72cf404ff527802bb354912fece0de` | **Unapplied** per review record; adds token/lease. Not hidden by the customer migration. |
| [Customer journal migration](../../prisma/migrations/20261015095612_add_tenant_billing_mutation_journal/migration.sql) | 4669 | `63cf618afde422d6d62d4825525af95640b99516f95666543e6fb466b33371b0` | **Unapplied** offline-generated additive SQL; no RLS/CHECK enforcement by itself. |
| [Separate customer CHECK SQL](../../prisma/tenant-billing-mutation-constraints.sql) | 884 | `186d0f8539a65c47d56c3954a0796ff04ea1cc8141a6acf76e3134eb9322e2d6` | **Unapplied** actor=tenant and mutual-reservation-exclusion constraints. Never inserted into generated/history SQL. |
| [Customer journal security SQL](../../prisma/tenant-billing-mutation-policies.sql) | 2327 | `8a41700b3146256e85bcbd537e403440d7133b26bf1752e9eceb86b3781f5098` | **Unapplied** default/table/column revocations, journal RLS and customer-reservation protection. |
| [Full trial/profile security SQL](../../prisma/tenant-trial-access-policies.sql) | 3035 | `4d06e51013a61aecc73f3c1abcc9e5907ff1ebedfb58544ebab3baac94e54363` | **Unapplied** full authority/profile restrictions and trial/audit ACLs. Safe profile updates only: name, onboarding completion and lifecycle timestamp. |
| [Four-table containment SQL](../../prisma/tenant-trial-tables-policies.sql) | 1476 | `65f10e6d1881f4b464ee0367bb0eb8c5d0d9ed75a77e58460ab5389399ccc184` | Runbook records separately approved dev application on 2026-10-15; no profile restriction or customer-journal deployment implied. |
| [Canonical RLS SQL](../../prisma/rls-policies.sql) | 125020 | `d93ce9dafee9286af8b0ba184a775c43915862fc155ca92cef62d6980d096ee2` | Local contract parity only; pending trial/customer blocks are not proof all target DB policies are installed. |

The customer SQL hash matches the recorded offline-generation output. Static
tests verify 16 additive statements: three enums, one nullable reservation column,
two tables (30/25 scalar columns), seven indexes and three profile/same-tenant
parent/step FKs. They also verify the two separate CHECK statements and canonical
security-block parity. No historical migration file was edited.

The original preserved before-schema path recorded in the design,
`/tmp/paidsoon-task3-8-before-20261015.prisma`, is **not present** now. Its documented
historical hash is `2272a24c94825a8230110e403c1b199f117fdc85dd9fc855d747fda3adb37f83`;
it could not be rehashed or used to independently repeat generation here. No
schema-to-schema diff was regenerated and no scratch/shadow target was inferred.

### Still-required isolated database/security evidence

Tasks 3.8/3.9/9.3 are not discharged by schema validity, generated client, mocks,
SQL regex/AST contracts or probe rollback lifecycle tests. Obtain separate review
and authorization for explicit isolated scratch/shadow targets through the
canonical adapter before any live work. Preview/shared dev is not isolation.

- Apply/stage the missing lease/customer artifacts and separately reviewed CHECKs
  with creator-default revocations **before table creation** and full RLS/ACLs in
  the reviewed security unit. Do not expose journals between creation and policy
  application. Shared application needs separate authorization after isolated proof.
- Prove actor mismatch rejection, same-tenant parent/step composite FK rejection,
  valid owner-only/customer-only/neither reservation states and rejection of both
  non-null reservations. Verify intended indexes/uniqueness and retained history.
- Prove own safe grant/risk reads and cross-tenant denial; both journals, steps,
  delivery and audit remain privileged. Test customer **and anonymous** reads and
  writes, table and historical column grants, creator defaults and denied
  billing/reservation/version updates. Safe profile name/onboarding/timestamp
  updates must still work without profile INSERT/DELETE or billing authority.
- Run the confirmation-gated isolated probes in the existing
   [Supabase database gate](../runbooks/supabase.md)
  and [verifier](../../scripts/verify-rls-trial-access.ts), retaining actual SQL
  results/target evidence. Those commands were **not run** here. No shared
  `migrate dev`, destructive reset, blind historical backfill or restore of
  billing privileges is authorized by this report.

## Deployment/configuration and browser limits

Source/runbook cross-checks found the required billing event names agree with
the webhook switch: `checkout.session.completed`,
`customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted`, `customer.subscription.trial_will_end`,
`subscription_schedule.released`, `invoice.payment_failed`, `invoice.paid`,
`invoice.payment_succeeded`, `invoice.updated`, `invoice.finalized`,
`invoice.marked_uncollectible`, `invoice.voided`, `charge.dispute.created`,
`charge.dispute.updated`, `charge.dispute.closed` — **16 events**. The API pin
remains **2026-05-27.dahlia**. This confirms source/document intent only, **not**
Stripe Dashboard subscriptions, correct signing secrets or delivery to a target.

The existing [deployment checklist](../runbooks/vercel.md),
[Stripe recovery contract](../runbooks/stripe.md),
[admin workflow](../runbooks/admin.md),
[Resend rules](../runbooks/resend.md) and
[environment matrix](../runbooks/README.md) require:

1. Record target/commit/artifact hashes, backup/recovery owner and compatible
   rollback build; obtain isolated evidence, then separate shared-target approval.
2. Drain incompatible old Next/worker/in-flight unjournaled writers before owner
   mutations. Source conversion is not deployment/drain proof. Verify delayed
   legacy hosted sessions through current tenant/customer/binding evidence;
   never fabricate historical operations or clear reservations from session age.
3. Deploy compatible customer/owner journals, recovery, signed lifecycle/risk
   reconciliation, resolver/API/job gates and UI together; enable owner mutations
   last. There is no new trial-safety flag/secret, and `LIVE` is not that switch.
4. Verify actual environment-scoped Stripe keys/four prices/signing secrets,
   event subscriptions, system email sender/Resend configuration and canonical app
   URL. None was read back or authenticated here. Dummy build success is **not**
   configuration verification; no real email, checkout or test clock was sent.
5. Retain both journals, steps, notifications, webhook evidence, both reservations,
   fences/versions, effective grants and scoped status/recovery on rollback. Never
   redeploy old unjournaled writers, restore tenant billing privileges, drop
   evidence, auto-shorten Stripe trials, forgive risk or blindly recreate late
   unknown provider objects. No rollback was executed here.

The six screenshots documented in the admin runbook are **synthetic component
fixtures**, using actual components with stubbed API/provider responses and
navigation. They do not run Next.js authentication, real role/session/device
resolution, persistence or email. This session reviewed their documented scope,
not a fresh authenticated browser flow. Task 9.4 still needs owner, elevated
support/admin and ordinary-tenant browser checks across active Stripe trial,
expired grant, paid and delinquent accounts, timezone/DST confirmation and
notification-failure behavior. Separate actual-HTTP/authenticated checks are
needed even though direct mocked handlers deny staff correctly.

## Log provenance

Sanitized verification logs and command/result metadata are local temporary
evidence, not committed repository artifacts. Directory:
`/tmp/paidsoon-verification-20261017/` (macOS also exposes it under `/private/tmp`).
The actual build log is **/tmp/paidsoon-verification-20261017/build.log**. No
credential values or environment dump are included. Paths are local, not durable
CI artifact URLs.

| Log in that directory | SHA-256 |
| --- | --- |
| focused.log | `57d661511188004a6a361cf2b9fcf1742b1ed4b2cd6d458a39c1d07834669b40` |
| test.log | `e5232364538a5c70078c30ddd1d266fc999f232ed9fbd641435f8a2684a24329` |
| tsc.log | `b3d973263c4dcf664293979769a02c6495997c13abb99a6a5c378e0e6f59153a` |
| tsc-after-build.log | `a061df989637280298cdc5daa1ac82c70cbab8a72e578a9eddaa246285f49607` |
| lint-changed.log | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| lint.log | `39a74db011191f8a44df2b7b3e09a050d2fc58a1997c35e880dad9f43c4abfcf` |
| validate.log | `e1344514cb0e93026a245afd134e0c874287a64f7c5798cbda02eff700d2aa22` |
| generate.log | `006fb9515737ee4df1f1095078388096ec074607105c8cbfcbb64a9337f796e7` |
| build.log | `2d488792af81c2da9dc18ca965afd7c765a5033e070c32ad441cd991ffd8d5ba` |

Matching JSON files retain actual argv, timestamps, durations and exit codes.
The focused JSON retains all 107 exact input paths; changed-lint JSON retains
all 381 paths. Initial attempts are retained as focused-initial.log/json and
test-initial.log/json. The initial content-hash snapshot and temporary runner/
network guard remain in the same directory. The sorted focused filename list
(newline-delimited, including trailing newline) hashes to
`daea00dfb73ebaf4cbf1152d17e69f7f47f46f2f6514256324600fed05b63ebd`.

## Complete focused Node input inventory

Every file below ran in both the focused selection and the configured full suite.
Infrastructure mocks, real implementation seams and static contracts differ;
inclusion is not evidence that every test is a full-stack integration test.

1. [tests/accounting-spend-sync.test.ts](../../tests/accounting-spend-sync.test.ts)
2. [tests/admin-diagnostics.test.ts](../../tests/admin-diagnostics.test.ts)
3. [tests/admin-tenant-subscription.test.ts](../../tests/admin-tenant-subscription.test.ts)
4. [tests/admin-trial-access-client.test.ts](../../tests/admin-trial-access-client.test.ts)
5. [tests/admin-trial-access-route.test.ts](../../tests/admin-trial-access-route.test.ts)
6. [tests/admin-trial-audit.test.ts](../../tests/admin-trial-audit.test.ts)
7. [tests/admin-trial-legacy-ui.test.ts](../../tests/admin-trial-legacy-ui.test.ts)
8. [tests/ai-rewrite-route.test.ts](../../tests/ai-rewrite-route.test.ts)
9. [tests/arrangement-routes.test.ts](../../tests/arrangement-routes.test.ts)
10. [tests/billing-cancel-route.test.ts](../../tests/billing-cancel-route.test.ts)
11. [tests/billing-checkout-page-recovery.test.ts](../../tests/billing-checkout-page-recovery.test.ts)
12. [tests/billing-checkout-route.test.ts](../../tests/billing-checkout-route.test.ts)
13. [tests/billing-checkout-success-route.test.ts](../../tests/billing-checkout-success-route.test.ts)
14. [tests/billing-client-operation.test.ts](../../tests/billing-client-operation.test.ts)
15. [tests/billing-client-session.test.ts](../../tests/billing-client-session.test.ts)
16. [tests/billing-operations-route.test.ts](../../tests/billing-operations-route.test.ts)
17. [tests/chase-volume-limits.test.ts](../../tests/chase-volume-limits.test.ts)
18. [tests/commitguard-routes.test.ts](../../tests/commitguard-routes.test.ts)
19. [tests/cost-guard-foundation.test.ts](../../tests/cost-guard-foundation.test.ts)
20. [tests/cost-guard-settings-route.test.ts](../../tests/cost-guard-settings-route.test.ts)
21. [tests/dashboard-layout-access.test.ts](../../tests/dashboard-layout-access.test.ts)
22. [tests/dashboard-overview-cards.test.ts](../../tests/dashboard-overview-cards.test.ts)
23. [tests/dashboard-page-effective-access.test.ts](../../tests/dashboard-page-effective-access.test.ts)
24. [tests/dashboard-profile-access.test.ts](../../tests/dashboard-profile-access.test.ts)
25. [tests/deposit-guard-jobs-route.test.ts](../../tests/deposit-guard-jobs-route.test.ts)
26. [tests/deposit-guard-milestones-route.test.ts](../../tests/deposit-guard-milestones-route.test.ts)
27. [tests/deposit-guard-payments-route.test.ts](../../tests/deposit-guard-payments-route.test.ts)
28. [tests/deposit-guard-reminder-delivery.test.ts](../../tests/deposit-guard-reminder-delivery.test.ts)
29. [tests/deposit-guard-requests-route.test.ts](../../tests/deposit-guard-requests-route.test.ts)
30. [tests/deposit-guard-settings-route.test.ts](../../tests/deposit-guard-settings-route.test.ts)
31. [tests/deposit-guard-workflow.test.ts](../../tests/deposit-guard-workflow.test.ts)
32. [tests/effective-access-loaders.test.ts](../../tests/effective-access-loaders.test.ts)
33. [tests/effective-access.test.ts](../../tests/effective-access.test.ts)
34. [tests/effective-reminder-ai-access.test.ts](../../tests/effective-reminder-ai-access.test.ts)
35. [tests/effective-source-routes.test.ts](../../tests/effective-source-routes.test.ts)
36. [tests/email-log-body.test.ts](../../tests/email-log-body.test.ts)
37. [tests/email-log-dedup-guard.test.ts](../../tests/email-log-dedup-guard.test.ts)
38. [tests/email-payment-url.test.ts](../../tests/email-payment-url.test.ts)
39. [tests/email-settings-route.test.ts](../../tests/email-settings-route.test.ts)
40. [tests/financial-breach-job-access.test.ts](../../tests/financial-breach-job-access.test.ts)
41. [tests/financial-dispatch-effective-access.test.ts](../../tests/financial-dispatch-effective-access.test.ts)
42. [tests/financial-job-effective-access.test.ts](../../tests/financial-job-effective-access.test.ts)
43. [tests/financial-shared-service-access.test.ts](../../tests/financial-shared-service-access.test.ts)
44. [tests/invoice-export-route.test.ts](../../tests/invoice-export-route.test.ts)
45. [tests/invoice-import-commit-route.test.ts](../../tests/invoice-import-commit-route.test.ts)
46. [tests/invoice-import-upload-route.test.ts](../../tests/invoice-import-upload-route.test.ts)
47. [tests/invoice-payment-routes.test.ts](../../tests/invoice-payment-routes.test.ts)
48. [tests/invoice-routes.test.ts](../../tests/invoice-routes.test.ts)
49. [tests/marginguard-export-route.test.ts](../../tests/marginguard-export-route.test.ts)
50. [tests/marginguard-routes-security.test.ts](../../tests/marginguard-routes-security.test.ts)
51. [tests/marginguard-settings-route.test.ts](../../tests/marginguard-settings-route.test.ts)
52. [tests/myob-callback-route.test.ts](../../tests/myob-callback-route.test.ts)
53. [tests/onboarding-checkout-client.test.ts](../../tests/onboarding-checkout-client.test.ts)
54. [tests/onboarding-intent-route-page.test.ts](../../tests/onboarding-intent-route-page.test.ts)
55. [tests/owners-digest-service-state.test.ts](../../tests/owners-digest-service-state.test.ts)
56. [tests/owners-digest-settings-route.test.ts](../../tests/owners-digest-settings-route.test.ts)
57. [tests/profile-settings-trial-authority.test.ts](../../tests/profile-settings-trial-authority.test.ts)
58. [tests/proxy-auth.test.ts](../../tests/proxy-auth.test.ts)
59. [tests/reminder-execution-access.test.ts](../../tests/reminder-execution-access.test.ts)
60. [tests/runway-guard-route.test.ts](../../tests/runway-guard-route.test.ts)
61. [tests/runway-guard-snapshot-history.test.ts](../../tests/runway-guard-snapshot-history.test.ts)
62. [tests/send-owners-digest.test.ts](../../tests/send-owners-digest.test.ts)
63. [tests/spend-categories.test.ts](../../tests/spend-categories.test.ts)
64. [tests/spend-classification-assignment.test.ts](../../tests/spend-classification-assignment.test.ts)
65. [tests/spend-classification-handoff.test.ts](../../tests/spend-classification-handoff.test.ts)
66. [tests/spend-classification-jev-request.test.ts](../../tests/spend-classification-jev-request.test.ts)
67. [tests/spend-classification-review-route.test.ts](../../tests/spend-classification-review-route.test.ts)
68. [tests/spend-classification-review.test.ts](../../tests/spend-classification-review.test.ts)
69. [tests/spend-classification-settings-routes.test.ts](../../tests/spend-classification-settings-routes.test.ts)
70. [tests/spend-classification-special-review.test.ts](../../tests/spend-classification-special-review.test.ts)
71. [tests/spend-classification-worker.test.ts](../../tests/spend-classification-worker.test.ts)
72. [tests/spend-import-commit-route.test.ts](../../tests/spend-import-commit-route.test.ts)
73. [tests/spend-import-validate-route.test.ts](../../tests/spend-import-validate-route.test.ts)
74. [tests/spend-insight-route.test.ts](../../tests/spend-insight-route.test.ts)
75. [tests/spendleak-export-route.test.ts](../../tests/spendleak-export-route.test.ts)
76. [tests/spendleak-page.test.ts](../../tests/spendleak-page.test.ts)
77. [tests/spendleak-settings-route.test.ts](../../tests/spendleak-settings-route.test.ts)
78. [tests/stripe-billing-risk-webhook.test.ts](../../tests/stripe-billing-risk-webhook.test.ts)
79. [tests/stripe-billing-webhook-ledger.test.ts](../../tests/stripe-billing-webhook-ledger.test.ts)
80. [tests/stripe-billing-webhook-route.test.ts](../../tests/stripe-billing-webhook-route.test.ts)
81. [tests/stripe-subscription-snapshot.test.ts](../../tests/stripe-subscription-snapshot.test.ts)
82. [tests/stripe-trial-extension.test.ts](../../tests/stripe-trial-extension.test.ts)
83. [tests/subscription-access-inventory.test.ts](../../tests/subscription-access-inventory.test.ts)
84. [tests/subscription-access-routes.test.ts](../../tests/subscription-access-routes.test.ts)
85. [tests/subscription-cancellation-page.test.ts](../../tests/subscription-cancellation-page.test.ts)
86. [tests/subscription-page.test.ts](../../tests/subscription-page.test.ts)
87. [tests/subscription-status-presentation.test.ts](../../tests/subscription-status-presentation.test.ts)
88. [tests/summary-execution-access.test.ts](../../tests/summary-execution-access.test.ts)
89. [tests/tax-buffer-overrides-route.test.ts](../../tests/tax-buffer-overrides-route.test.ts)
90. [tests/tax-buffer-settings-route.test.ts](../../tests/tax-buffer-settings-route.test.ts)
91. [tests/tax-buffer-spend-classification-isolation.test.ts](../../tests/tax-buffer-spend-classification-isolation.test.ts)
92. [tests/team-invite-route.test.ts](../../tests/team-invite-route.test.ts)
93. [tests/tenant-billing-coordinator.test.ts](../../tests/tenant-billing-coordinator.test.ts)
94. [tests/tenant-billing-mutation-coordinator.test.ts](../../tests/tenant-billing-mutation-coordinator.test.ts)
95. [tests/tenant-billing-mutation-policy-contract.test.ts](../../tests/tenant-billing-mutation-policy-contract.test.ts)
96. [tests/tenant-billing-mutation-probe-lifecycle.test.ts](../../tests/tenant-billing-mutation-probe-lifecycle.test.ts)
97. [tests/tenant-billing-mutation-schema-contract.test.ts](../../tests/tenant-billing-mutation-schema-contract.test.ts)
98. [tests/trial-access-contact.test.ts](../../tests/trial-access-contact.test.ts)
99. [tests/trial-access-delivery.test.ts](../../tests/trial-access-delivery.test.ts)
100. [tests/trial-access-input.test.ts](../../tests/trial-access-input.test.ts)
101. [tests/trial-access-notification.test.ts](../../tests/trial-access-notification.test.ts)
102. [tests/trial-access-operations.test.ts](../../tests/trial-access-operations.test.ts)
103. [tests/trial-access-policy-contract.test.ts](../../tests/trial-access-policy-contract.test.ts)
104. [tests/trial-access-preview.test.ts](../../tests/trial-access-preview.test.ts)
105. [tests/trial-eligibility.test.ts](../../tests/trial-eligibility.test.ts)
106. [tests/user-profile.test.ts](../../tests/user-profile.test.ts)
107. [tests/xero-callback-route.test.ts](../../tests/xero-callback-route.test.ts)

## Task 3.9/9.3 offline verifier follow-up — 2026-10-17

This narrowly scoped implementation follow-up supplements the earlier verification;
it does not repeat its build/full-suite run or claim live database acceptance.
Inspection confirmed two missing probe assertions within the existing acceptance:
the seven customer-journal index definitions and permitted onboarding completion.
No architecture, schema, ACL, historical SQL or OpenSpec checkbox was changed.

Changed files in this follow-up only:

- [scripts/verify-rls-billing-artifacts.ts](../../scripts/verify-rls-billing-artifacts.ts):
   adds a parameterized Postgres catalog query and assertions for all seven
   migration-defined indexes, including ordered key definitions, uniqueness,
   target table/schema, btree method, valid/ready state, attribute count and absent
   predicates/expressions. Same-named but incorrect definitions fail; unrelated
   additional indexes are not prohibited.
- [scripts/verify-rls-trial-access.ts](../../scripts/verify-rls-trial-access.ts):
   runs the index assertions inside the existing rollback transaction before
   fixtures, in staged and already-deployed customer-journal modes. Authenticated
   own-profile probes now update and verify onboarding completion plus the
   lifecycle timestamp alongside the existing name probe, and require another
   tenant's onboarding update to affect zero rows. Final profile checks retain
   the intended completion value; before/after authority snapshots exclude only
   the three permitted profile columns and still compare all other fields.
- [tests/tenant-billing-mutation-policy-contract.test.ts](../../tests/tenant-billing-mutation-policy-contract.test.ts):
   derives independent index fixtures from unchanged generated SQL; rejects
   every missing index and same-name definition/uniqueness drift; checks the
   catalog SQL, scoped profile SQL and exact authority-snapshot exclusions.
- [tests/tenant-billing-mutation-probe-lifecycle.test.ts](../../tests/tenant-billing-mutation-probe-lifecycle.test.ts):
   extends mocked `pg` coverage to index-query errors, incorrect catalog
   definitions, onboarding query errors, zero updated rows and incorrect returned
   completion values. Every failure rolls back the sole transaction and closes
   the client without committing. Existing policy/fixture failure checks remain.
- This verification report, with this appended follow-up section only.

Content hashes across all 421 initially modified/untracked paths confirmed that
exactly these five files changed; no unrelated file content or task checkbox
changed. The earlier 420-file accounting remains historical to that run.

### Follow-up commands and results

All commands used installed local executables with an allowlisted environment
(`env -i`, preserving only PATH, HOME and TMPDIR). No dotenv files or secrets
were read. The verifier was imported only with its canonical environment resolver
and `pg.Client` mocked; no integration entry point or real connection was run.

| Check | Exact result |
| --- | --- |
| `node --experimental-test-module-mocks --import tsx --test` with the six inputs below | Exit 0; **43 passed**, 1 suite, 0 failed/cancelled/skipped/todo. |
| Changed-file ESLint through installed `node node_modules/eslint/bin/eslint.js`, on the four TypeScript files listed above | Exit 0; **0 errors, 0 warnings**. |
| Installed `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, before and after implementation | Both exit 2; **47 baseline diagnostics remain; zero new diagnostics** after normalizing union-member order. Not a type-clean result. |
| Editor diagnostics for the four changed TypeScript files | No errors found. |
| `git diff --check` | Exit 0. |

Exact focused Node input files:

1. [tests/tenant-billing-mutation-schema-contract.test.ts](../../tests/tenant-billing-mutation-schema-contract.test.ts)
2. [tests/tenant-billing-mutation-policy-contract.test.ts](../../tests/tenant-billing-mutation-policy-contract.test.ts)
3. [tests/tenant-billing-mutation-probe-lifecycle.test.ts](../../tests/tenant-billing-mutation-probe-lifecycle.test.ts)
4. [tests/trial-access-policy-contract.test.ts](../../tests/trial-access-policy-contract.test.ts)
5. [tests/onboarding-intent-route-page.test.ts](../../tests/onboarding-intent-route-page.test.ts)
6. [tests/profile-settings-trial-authority.test.ts](../../tests/profile-settings-trial-authority.test.ts)

Temporary follow-up logs are separate from the earlier verification logs:
/tmp/paidsoon-rls-followup-tests.log, /tmp/paidsoon-rls-followup-tsc-before.log
and /tmp/paidsoon-rls-followup-tsc-after.log. Node's existing experimental and
deprecated module-mocking warnings remain non-fatal.

**Still unverified:** no SQL was executed against Postgres; catalog-query
execution/results, index enforcement, actual onboarding/name/timestamp column
privileges, tenant isolation, constraints, rollback behavior and connection
cleanup against a real database still require separately authorized isolated
execution. Mocks/static assertions do not prove those properties. No DB/provider
request, migration application/generation, installation, secret reading, full
build or full-suite rerun occurred in this follow-up. Tasks 3.8/3.9/9.3 remain
unchecked and no deployment/application authorization is inferred.

## Task 9.4 offline harness foundation — 2026-10-17

**Incomplete; not authenticated E2E evidence.** The user authorized a test-only
actual Next.js harness with real isolated Supabase Auth/database fixtures and
server-side Stripe/Resend stubs. No isolated project ref has been supplied. No
database/provider access, secret reading, provisioning, migration application or
server launch was performed. Task 9.4 and all other task checkboxes are unchanged.
The earlier verification and database-follow-up results above are historical;
this section does not claim they were rerun.

### Startup/provider assessment and stop boundary

- The actual [Next configuration](../../next.config.ts) materializes canonical
  Supabase public configuration and wraps MDX. Installed Next 16.2.9's
  `loadConfig()` calls `loadEnvConfig(dir, ...)` **before** its `customConfig`
  branch. Clearing the child environment or passing custom Next configuration
  alone therefore does not prevent local dotenv credentials being loaded.
- [Stripe construction](../../lib/billing/stripeClient.ts) supplies the pinned
  API version and no test transport. Installed Stripe's Node platform defaults
  to `NodeHttpClient`, not global fetch. The
  [notification sender](../../lib/email/sendTrialAccessNotification.ts) constructs
  Resend in the server, whose installed SDK uses fetch. Browser interception or
  a fetch-only server patch would miss Stripe. Unit-test module mocks are not
  proof of interception inside Next's bundled server modules/workers.
- A separate test-process startup/preload could be investigated without changing
  application authorization, but coverage of server modules, child processes,
  HTTP(S), fetch and unexpected egress has **not** been demonstrated. No preload,
  alias, instrumentation hook, provider stub or production test flag was added.
  Future implementation must fail closed before any real provider dispatch and
  prove interception with the actual Next process, not just direct SDK imports.
- [Owner authority](../../lib/admin/trialAccessAuthority.ts) requires real
  Supabase identity, active `platform_owner`, matching valid elevation and active
  nonrevoked device, and rejects impersonation. The existing
  [challenge](../../app/api/admin/challenges/route.ts) and
  [verification](../../app/api/admin/challenges/[id]/verify/route.ts) endpoints
  support authentic signed elevation. Do not seed an `AdminSession`, forge
  cookies, replace guards or set `ADMIN_REQUIRE_DEVICE_KEY=false` for this E2E
  harness. Ordinary tenant/support/admin denial must use these same real checks.
- The existing [owner bootstrap](../../scripts/seed-admin-owner.ts) imports the
  local dotenv loader and is not safe to invoke as a generic isolated-fixture
  command. It was only source-inspected, never executed. An explicit reviewed
  credential/provisioning interface and test-device enrollment remain necessary.
  Existing [SSH unit tests](../../tests/admin-ssh.test.ts) demonstrate ephemeral
  Ed25519 signing, not fixture enrollment or browser elevation proof.

### Available offline dry-run contract

Added [plan validator](../../tests/helpers/trialAccessE2EPlan.ts),
[dry-run entry point](../../scripts/e2e/trial-access-plan.ts) and
[offline tests](../../tests/trial-access-e2e-plan.test.ts). They import no
application services, Next, Prisma, Supabase, Stripe, Resend or dotenv loader.
No dependency, npm script, shared configuration or environment variable was
added; installed Zod, tsx and Node test APIs suffice. The helper lives under test
support and is not imported into production.

The entry point accepts **only** `--dry-run` plus one non-secret JSON object on
stdin (maximum 16 KiB). It reads no config/credential file or environment values.
It rejects missing/extra CLI options including launch, provisioning and dotenv
flags. No child/server process is started by this entry point. Exit 0 means only
that local shape/equality checks passed; the returned plan always contains
`launchAllowed: false`, `task94Complete: false` and six unresolved launch blockers.
Exit 2 reports a fixed safe error code, never the input or validation details.

| Required JSON field | Contract |
| --- | --- |
| `projectRef` | Explicit lowercase 20-letter target; no default. |
| `reviewedProjectRef` | Independently reviewed target repeated exactly. |
| `sharedProjectRefs.development`, `.production` | Explicit reviewed shared identities; neither may equal the target. Local/Preview share development per the existing runbook. No shared ref is hardcoded in generic config. |
| `disposable` | Boolean `true`, not a string or implicit environment classification. |
| `reviewId` | Non-secret review reference, 1–100 letters/digits/dot/underscore/hyphen, beginning with a letter/digit. |
| `runId` | UUID for future fixture/evidence ownership. No fixtures are created. |
| `port` | Integer 1024–65535; plan restricts future server binding to `127.0.0.1`. No socket is opened or port availability checked. |

Objects are strict, including the nested shared identities. Credentials, URLs,
dotenv paths, auth switches, arbitrary provider endpoints and loader flags are
not accepted fields. The runbook's dummy `abcdefghijklmnopqrst` target is denied.
The tests use synthetic refs only; they are not runnable remote-fixture targets.
Review metadata is an operator assertion, **not** evidence of project ownership,
credential binding, empty state, RLS correctness or isolation. Supplying the same
unknown live ref twice cannot grant launch permission. Keep this invariant when
eventually implementing an opt-in launcher.

### Requirements before implementing/enabling actual E2E

1. Obtain explicit non-secret isolated disposable project ref and independently
   reviewed shared dev/Preview/production refs. No inference from current shell,
   local env files or project-name substrings. Review ownership, disposal and
   target-specific authorization; do not request secrets through chat.
2. Agree an explicit secret-store/child-process input interface, binding real
   Auth keys and canonical DB inputs to that same approved project. Do not pass
   secrets in argv, manifests, artifacts or logs. Never inherit `NODE_OPTIONS`,
   provider keys or dotenv state. Launch from a separate disposable app copy
   excluding every dotenv file, generated Next output, deployment metadata and
   unrelated secrets; use a fresh build/output there. Working-directory changes
   alone are insufficient if Next still loads the original app directory.
   Continue using the canonical Supabase URL/pooler adapter, not URL overrides.
3. Under separate explicit authorization, verify migration/CHECK/RLS/ACL baseline
   and an empty disposable fixture namespace before any write. Tasks 3.8/3.9/9.3
   remain separate blockers. Define expected baseline evidence and abort on drift
   or unexpected existing users/data; never reset a shared database. Provisioning
   must require a separate explicit opt-in, approved exact ref and scoped cleanup
   ledger; no default seed/reset or migration application on launch.
4. Review real fixture provisioning: distinct Auth identities, actual existing
   `platform_owner`/`platform_support`/`platform_admin` roles and ordinary tenant
   without a platform role; actual active per-actor devices; ephemeral test-only
   signing keys; real sign-in and challenge/verify requests. Keep signature
   verification enabled. The ordinary tenant must receive no invented staff role.
   Review sign-in anti-bot requirements before automation; do not bypass them.
   Revoke sessions before scoped cleanup, since deleting an Auth user alone does
   not invalidate existing access JWTs. Never delete unrelated users/audits/data.
5. Implement and prove external test-only server provider interception in every
   Next process, plus fail-closed egress controls allowing only the approved Auth
   project, canonical pooler and required loopback traffic. No production auth
   bypass or provider-host environment backdoor. Real Stripe/Resend credentials
   must never be needed. Unexpected requests fail, not return generic success.
   Browser tests must not replace application endpoints or fabricate full pages.
6. Provider scenarios must preserve the real SDK/request contract: pinned Stripe
   version, current customer/subscription/invoice/charge/dispute identities and
   pagination, exact frozen absolute targets, original per-step idempotency keys,
   parameter-conflict rejection and cached failure/timeout/recovery outcomes.
   Preserve the actual `trial-access/<operationId>` Resend key and immutable
   payload across retries; model error-valued responses and unknown outcomes at
   the exact 24-hour boundary. Use real SDK webhook signature verification with
   synthetic signed events and current scenario objects; do not stub verification
   or use arbitrary matching timestamps/status as completion proof. Provider
   state belongs in the stub, access/audit/journals/roles in the real app/DB.
   Reserved recipients may be suppressed before Resend is reached; an email
   failure scenario must prove it actually hit the isolated stub without allowing
   external delivery, not mistake suppression for provider-failure coverage.
7. Only then run actual browser HTTP flows for owner, elevated support/admin and
   ordinary tenant across active Stripe trial, expired grant, paid and delinquent
   accounts. Verify direct staff endpoint denial, timezone/DST preview and frozen
   UTC confirmation, independent notification-failure/retry UI, and persisted
   audit/journal/access outcomes. Record actual launch args, installed Node
   (declared engine 24.x), target review, stub requests, screenshots and cleanup
   evidence without credentials/customer PII. Optional real Stripe test-clock
   checks need separate authorization and evidence, not conflation with stubs.

Supabase changelog/SSR docs were consulted during this assessment. No Supabase
API/client/auth implementation was changed; database test queries were explicitly
prohibited and not run. The config checks cannot substitute for those queries.

### Foundation-only commands and results

Commands ran with `env -i`, retaining only PATH, HOME and TMPDIR, using installed
executables. Child CLI tests use only synthetic poisoned ambient values to prove
no fallback/leakage; they do not use real credentials.

| Command | Result |
| --- | --- |
| `node --experimental-test-module-mocks --import tsx --test tests/trial-access-e2e-plan.test.ts` | Exit 0; **24 passed**, 0 failed/skipped/todo. Offline validation and CLI rejection tests only. |
| `node node_modules/eslint/bin/eslint.js scripts/e2e/trial-access-plan.ts tests/helpers/trialAccessE2EPlan.ts tests/trial-access-e2e-plan.test.ts` | Exit 0; 0 errors/warnings. |
| Editor diagnostics for those three TypeScript files | No errors found. |
| `git diff --check` | Exit 0. |

Content fingerprints of 2,246 pre-existing tracked/untracked non-dotenv files
found exactly one changed existing file: this report. The three new foundation
files are listed above. No unrelated existing content or OpenSpec checkbox was
changed.

No full-suite, build, actual Next start, DB/provider probe, fixture provisioning,
installation or migration was attempted. The previously recorded 47 standalone
compiler diagnostics were not reassessed by this focused run. **Task 9.4 remains
incomplete; this is a guarded planning foundation, not a runnable E2E harness.**

## Platform-owner internal-access follow-up — 2026-10-18

**Working-tree implementation and offline verification only; not a deployed or
released access claim.** Approved D3a was added to the proposal/design/access
delta spec and task 9.6 before implementation. This follow-up did not authorize
or perform database/provider access, database mutations, migrations, installs,
deployment or browser E2E. Earlier separately authorized rollout evidence above
is unchanged and is not evidence that this new code is deployed.

### Policy and touched surfaces

- The shared resolver adds `platform_owner` only as the last fallback for an
   existing exactly active, unlinked profile with a recognized catalog tier,
   fresh exactly active target-owner role and no blocking/unknown risk. Existing
   aliases remain recognized; missing/unknown tiers do not default-authorize.
- Existing Stripe/grant/onboarding precedence is retained. The fallback has
   null access/trial cutoff and expiry provenance; it is neither a paid
   subscription nor a trial/operation source. Canceled, paused, delinquent,
   incomplete, trialing, unknown, ordinary-customer and non-owner staff accounts
   cannot acquire this fallback.
- A new uncached, fail-closed role-fact helper performs the sole new privileged
   read: exact target user role/status, or one requested-ID userId/role/status
   batch query. Tenant RLS/profile/grant/risk/usage boundaries remain intact.
   No role rows/internal boolean are added to client/profile response shapes.
- Fresh facts are used by tenant/dashboard/effective-system single and batch
   loaders, chase single/account/batch loaders, and target-owner administrative
   health/management, preview, grant/revoke, Stripe finalization/recovery and
   notification readiness/audit projections. The operator's authority does not
   grant the target owner access. Preview source fingerprints remain binding.
- Exhaustive safe response/audit/client/notification source schemas and admin/
   customer labels accept “Platform owner internal access”, without adding it
   to trial expiry or operation source enums or inventing dates. Revocation copy
   accurately describes independent remaining internal access.
- Existing catalog/pricing/features, normal chase windows/consumption, monthly
   AI accounting, Stripe eligibility/controls, auth/elevation and policies are
   unchanged. Reminder execution rechecks role-dependent access before send.

### Verification results

Installed executables ran under a temporary synthetic-environment runner. Local
dotenv **key names only** were used to shadow ambient settings; no credential
values were printed or used. Dummy Supabase/Stripe/Resend settings and the
existing network-denial preload prevented database/provider egress. Each test,
compiler and lint run recorded **zero network-denial markers**; no live
database/provider verification was attempted. Temporary harness/logs are outside
the repository and are not a new application dependency.

| Check | Result |
| --- | --- |
| Explicit focused Node selection, module mocks enabled, `tsx` loader | **691 tests / 23 suites passed**, no failures/skips/todo; exit 0. |
| Full `npm run test` with synthetic environment and network guard | **3,137 tests / 296 suites passed**, no failures/skips/todo; exit 0. |
| Installed ESLint on all 28 TypeScript/TSX files changed by this follow-up | Exit 0; no errors/warnings. |
| Installed `tsc --noEmit --incremental false` | Exit 2; **48 diagnostics**, identical to the initial follow-up compiler snapshot; no new diagnostics from these changes. Not type-clean. |
| Editor diagnostics on those 28 changed TypeScript/TSX files | No errors found. |
| Strict OpenSpec validation | Pass for `add-superuser-tenant-trial-access`. |
| `git diff --check` | Pass. |

The historical **47** compiler diagnostics were explicitly compared: 22 stale
generated Next development marketing-route imports and 25 test diagnostics.
The current tree has those same diagnostics plus the already-present
`tests/trial-access-e2e-plan.test.ts` TS2769 at its `spawnSync` environment:
required `NODE_ENV` is absent from that fixture. That file was not modified by
this follow-up. Two existing SpendLeak diagnostic messages have reordered
inferred object fields after client generation; their files, locations, codes
and failures are unchanged. The initial/current follow-up logs both contain 48
identical diagnostic lines. This does **not** claim a return to 47 or repair
unrelated test types.

Coverage includes exact role/status predicates and minimal select scopes,
uncached revocation/failure behavior, requested-ID deduplication and constant
system batch queries, all public catalog quotas and aliases, dashboard/API/
system/chase parity, safe profile shapes, role loss between reminder preparation
and dispatch, monthly AI inheritance, actual target-vs-actor admin/revocation
projections/audit, client schema refresh and honest notification/date labels.

Task **9.6** is complete for this approved offline scope. Tasks **3.8, 3.9, 9.3,
9.4 and 9.5 remain unchecked**. No isolated RLS proof, authenticated browser E2E,
deployment/configuration acceptance, live owner-account check or new rollout
evidence is supplied here. The entire change is not complete or archive-ready.
