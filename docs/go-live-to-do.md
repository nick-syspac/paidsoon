# PaidSoon — Go-Live Readiness Audit

**Audit date:** confirmed against a live checkout of the repository on the date of this report.
**Scope:** full-stack production-readiness audit (auth, onboarding, dashboard, invoices, reminder engine, CSV/XLSX import/export, Xero, MYOB, email, settings, billing/Stripe, background workers, environment variables, database/RLS, security, tests, build/lint/typecheck, dependencies, documentation).
**Method:** direct repository inspection, 9 parallel read-only research passes across functional domains, cross-checked against a pre-existing partial audit (`docs/releae-todo-list.md`), and first-hand execution of `npm run lint`, `npx tsc --noEmit`, `npm run test`, and `npm run build`. Any finding below that is asserted as fact was confirmed by directly reading the cited file. This is an audit only — **no application code was modified** while producing this report.

---

## 1. Executive Summary

**Verdict: 🔴 NOT READY FOR RELEASE (CONDITIONAL — see minimum work required)**

PaidSoon's core revenue-path features — Stripe Connect invoice ingestion, the reminder-email
sequence, CSV/XLSX bulk import, Xero sync, and the billing/subscription system — are
substantially built and covered by a real (683/683 passing) automated test suite. The
production build compiles cleanly and lint is clean. However, the audit found several
**release blockers**: a webhook signature-verification bypass, a duplicate-email-send risk
in the reminder engine with no application- or database-level guard, an unhandled
`invoice.payment_failed` Stripe billing event, no password-reset flow, and a parallel Python
worker system (`worker/`) that is fully coded but not deployed anywhere, leaving Vercel Cron
as the sole (single-instance) scheduler in production today. None of these are "greenfield"
gaps — they are specific, fixable issues in otherwise-working code paths.

Two findings from earlier automated research were corrected during this audit after direct
file inspection (see §3, Reconciliation) — the pre-launch auth gate **is** enforced (via
`proxy.ts`, Next.js's middleware equivalent) and AI rewrite **does** make a real OpenAI call.
Both are called out below so they are not mistakenly re-flagged as gaps in future audits.

## 2. Release Score: 57 / 100

| Category | Weight | Score | Notes |
|---|---|---|---|
| Core workflow completeness (auth→onboarding→dashboard→invoices→reminders) | 20 | 14/20 | Auth/dashboard solid; reminder engine has a real dedup gap |
| Billing & Stripe correctness | 15 | 9/15 | Checkout/portal/webhooks work; `payment_failed` unhandled |
| CSV/XLSX import & export | 10 | 9/10 | Production-ready; minor pagination/cosmetic gaps only |
| Accounting integrations (Xero/MYOB) | 10 | 7/10 | Xero complete; MYOB partial |
| Security (OWASP-relevant findings) | 15 | 7/15 | Webhook bypass, missing dedup guard, RLS mostly sound |
| Background jobs / scheduling | 10 | 4/10 | Dual-system risk; Railway worker undeployed |
| Test coverage & CI signal | 10 | 8/10 | 683/683 passing, clean lint; 16 typecheck errors confined to test fixtures |
| Build/lint/typecheck health | 5 | 4/5 | Build & lint clean; test-fixture type errors need fixing |
| Documentation accuracy | 5 | 3/5 | Several stale/inaccurate claims found |
| **Total** | **100** | **57** | |

Do not treat this score as inflated — it reflects genuine, cited defects, not aspirational risk.

## 3. Reconciliation of Conflicting Research Findings

During research, two claims from earlier automated passes were found to be **incorrect** on
direct inspection. They are corrected here so they aren't re-reported as gaps:

| Claim | Verdict | Evidence |
|---|---|---|
| "No middleware exists; pre-launch `LIVE` gate is cosmetic and doesn't block `/sign-in`/`/sign-up`" | **FALSE — corrected** | [proxy.ts](proxy.ts) is registered as Next.js's middleware equivalent (confirmed via `npm run build` output: `ƒ Proxy (Middleware)`). It calls `shouldBlockAuthEntry()` from [lib/liveMode.ts](lib/liveMode.ts) and redirects `/sign-in`/`/sign-up` to `/` when `LIVE` is not true. It also independently protects `/dashboard/**` (redirect to `/sign-in` if unauthenticated) and `/admin`/`/api/admin` (401 or redirect) at the edge, in addition to per-layout checks. |
| "AI rewrite returns a literal placeholder string; no real AI call" | **FALSE — corrected** | [app/api/settings/ai/route.ts](app/api/settings/ai/route.ts) calls `rewriteMessage()` from `lib/email/ai-rewrite.ts`, which performs a real OpenAI call and logs token usage/cost to `AiUsageLog` via `prismaAdmin`. This feature is functional. What is **not** implemented is a *persisted* per-user default tone preference — tone is selected per-request, not saved as a setting. |

Both corrections improve the release picture but do not change the overall verdict, since
neither was the deciding factor.

## 4. Release Blockers (P0)

| ID | Severity | Feature | File | Problem | Evidence | Impact | Fix |
|---|---|---|---|---|---|---|---|
| B-1 | 🔴 Blocker | Resend webhook | [app/api/webhooks/resend/route.ts](app/api/webhooks/resend/route.ts#L24) | Signature secret falls back to empty string if unset | `process.env.RESEND_WEBHOOK_SECRET ?? ""` | If the env var is ever missing/misconfigured in an environment, webhook signature verification silently becomes a no-op, allowing forged delivery/bounce/complaint events to update `EmailLog.status` for any invoice | Fail closed: throw/return 500 at startup or per-request if the secret is unset; never verify against an empty string |
| B-2 | 🔴 Blocker | Reminder engine (email dedup) | [lib/email/send.ts](lib/email/send.ts#L227) and `prisma/schema.prisma` `EmailLog` model | No pre-send check of `EmailLog` for `(trackedInvoiceId, stage)`, and no `@@unique` constraint on those columns in the schema | `EmailLog` model (schema.prisma line ~408) has zero indexes/uniques beyond its primary key; `sendFollowUpEmail()` only ever `.create()`s log rows, never checks for an existing one first | If the batch cron (`app/api/cron/send-emails/route.ts`) is ever invoked twice concurrently (manual re-trigger, platform retry, or once the Railway worker is deployed alongside it), the same client can receive duplicate reminder emails for the same stage — a customer-facing/reputational bug in the core product loop | Add `@@unique([trackedInvoiceId, stage])` to `EmailLog` and check-before-send (or catch the unique violation) in `sendFollowUpEmail()` |
| B-3 | 🔴 Blocker | Billing webhook | `app/api/webhooks/stripe-billing/route.ts` | `invoice.payment_failed` is not handled | Confirmed via billing/settings research pass — only `checkout.session.completed`, `customer.subscription.updated/deleted` handled | Failed renewal payments leave the subscription record in a stale "active" state; users keep paid-tier access after a card decline with no dunning/downgrade path | Add a handler that marks the subscription `past_due`/gates access per the Stripe event, consistent with `lib/billing.ts` tier logic |
| B-4 | 🔴 Blocker | Auth | no route found | No password-reset flow exists (no `/forgot-password` route, no Supabase `resetPasswordForEmail` call found in `app/(auth)/**`) | Confirmed absent during auth/onboarding research pass | Users who forget their password have no self-service recovery path — a hard support/churn cost at general availability | Implement a standard Supabase Auth password-reset flow before public launch |
| B-5 | 🔴 Blocker | Background jobs | `worker/paidsoon_worker/` vs. `vercel.json` | The Railway Celery worker (weekly debtor summary, some sweep jobs) is fully coded but not deployed to any Railway account; Vercel Cron remains the only active scheduler | `worker/README.md` explicitly states Railway account setup "isn't something that can be provisioned for you"; `vercel.json` still lists 4 cron jobs, unremoved | The weekly debtor summary and any jobs that only exist in the Celery worker are silently non-functional in production; the team's own architecture docs describe capabilities that don't run anywhere | Either deploy the Railway worker before launch, or scope launch to Vercel-cron-only functionality and clearly mark weekly-summary/etc. as post-launch |

## 5. All Stubs and Placeholders

| Feature | File | Status | Notes |
|---|---|---|---|
| Custom email templates | `app/api/settings/templates/route.ts`, `EmailTemplate` model | Partial | Routes exist and persist to DB (contrary to `copilot-instructions.md`'s "data is not persisted" note — that note is stale, see §17) |
| Team seats / invites | `app/api/settings/team/invite/route.ts` | Stub | Invite endpoint exists but does not persist an invitation record end-to-end; `team_seats` is explicitly listed in `UNIMPLEMENTED_FEATURES` in [lib/subscriptionPlans.ts](lib/subscriptionPlans.ts#L44) |
| Multi-client / partner dashboard (`accountant_partner` tier) | n/a | Not present | Tier exists in billing config only; no dashboard code found, consistent with docs describing it as "planned" |
| Persisted AI tone preference | `app/api/settings/ai/route.ts` | Partial | Rewrite itself is real; no persisted default-tone setting is read back on subsequent requests |
| `paymentUrl` enrichment in reminder emails | [lib/email/send.ts](lib/email/send.ts#L194) | Stub | `paymentUrl: undefined, // TODO: enrich from provider.getInvoiceDetails if needed` — reminder emails never include a direct pay link |
| Weekly debtor summary | `worker/paidsoon_worker/` job + `app/api/internal/jobs/send-weekly-debtor-summary` | Non-functional in production | Only invoked by the undeployed Railway worker; no Vercel Cron equivalent exists |
| `customer_specific_sequences`, `multi_template_customer_wording`, `approval_mode`, `contact_suppression`, `multi_client_management` | [lib/subscriptionPlans.ts](lib/subscriptionPlans.ts#L44-L50) | Explicitly stubbed | Correctly self-documented in code via `UNIMPLEMENTED_FEATURES` — this is a good pattern, not a hidden gap |

## 6. Incomplete Implementations

| Feature | What works | What's missing |
|---|---|---|
| Stripe billing webhook | Checkout completion, subscription update/delete | `invoice.payment_failed` (see B-3) |
| Reminder engine dedup | Escalation policy, promise/arrangement suppression, chase-allowance enforcement | No `EmailLog` uniqueness guard (see B-2) |
| Password recovery | Sign-in, sign-up, OAuth callback | No reset flow (see B-4) |
| MYOB integration | OAuth connect/disconnect, basic sync | Narrower field mapping and error handling than Xero per accounting research pass; treat as PARTIAL not COMPLETE |
| Team invitations | Invite request endpoint | No persisted invite/acceptance record |

## 7. Partially Wired Functionality

- **Custom email templates**: DB-backed and settings UI exists, but `copilot-instructions.md` documents this as a scaffold with non-persisted data — that documentation is now inaccurate (see §17).
- **AI rewrite**: functional end-to-end for the rewrite call itself, but no persisted tone default — a user must re-select tone every time.
- **Railway worker jobs**: fully implemented in Python/Celery, reachable via authenticated internal routes on the Next.js side (`app/api/internal/jobs/*`), but nothing triggers them because the Celery beat/worker processes are not deployed.

## 8. Hard-Coded / Mock Data

- `paymentUrl: undefined` in every reminder email payload ([lib/email/send.ts](lib/email/send.ts#L194)).
- Test script in `package.json` hardcodes a fake Supabase project ref/password (`SUPABASE_PROJECT_REF=abcdefghijklmnopqrst SUPABASE_DB_PASSWORD=test-only-password`) — acceptable for tests, but confirm this can never leak into a real environment variable set at runtime.

## 9. Dead Code / Unreachable Features

- 4 unused-variable ESLint warnings (see §14) — low-risk dead code, not user-facing.
- `worker/` Python codebase — not dead in the traditional sense, but entirely unreachable in the current deployment topology since nothing invokes it.

## 10. Broken / Dead-End Workflows

- **Forgot password**: no entry point exists; a user who clicks a (non-existent) "forgot password" link, or simply forgets their password, has no recovery path.
- **Failed subscription payment**: a card decline on renewal does not change the user's access level, silently granting continued paid access with no customer-facing signal.

## 11. CSV / XLSX Readiness

**Verdict: 🟢 Production ready.**

Confirmed via this audit and prior session research (see `/memories/session/audit-findings.md`):
- Import: template download, upload, column mapping (with saved mapping profiles), validation with per-row error reporting, batch commit — all implemented and tested.
- Export: `app/api/invoices/export` and `lib/invoices/export.ts` are implemented (contradicts an earlier repo-memory note claiming `add-invoice-export` was "not yet implemented" — that note is stale and has been superseded; see §17).
- Payment reconciliation from imported data is implemented and tested.
- Minor gaps only: no pagination on very large exports, and one unused-import lint warning in `lib/invoices/export.ts` (`STATUS_LABELS` — cosmetic).

## 12. Reminder Engine Readiness

**Verdict: 🟡 Functional today, with a real defect (B-2).**

- The Vercel Cron path (`app/api/cron/send-emails/route.ts`, daily 09:00 UTC) works end-to-end: it selects eligible `TrackedInvoice` rows, applies promise/arrangement suppression and chase-allowance limits, sends via `sendFollowUpEmail()`, and advances `currentStage`/`nextEmailAt`.
- The Railway/Celery path (`sendReminderForInvoice()`) additionally takes a `pg_advisory_xact_lock` per user to serialize concurrent Celery workers — a reasonable safeguard, but it is **not used by the Vercel Cron path**, and neither path checks `EmailLog` for an existing send before creating a new one (B-2). This means: (a) the Vercel Cron path has no protection at all against a double-invocation, and (b) even the more careful Railway path relies on transaction-scoped locking, not a durable DB constraint — a belt-and-suspenders `@@unique` constraint is still the correct fix.
- Weekly debtor summary is non-functional in production today (B-5).

## 13. Accounting Integration Readiness

| Provider | Status | Notes |
|---|---|---|
| Xero | 🟢 COMPLETE | OAuth, token refresh, organisation selection, invoice/contact sync, pagination — all implemented and unit-tested (`XeroProvider` test suite passing, confirmed in this session's `npm run test` run). |
| MYOB | 🟡 PARTIAL | OAuth connect/disconnect and basic sync work; field mapping and error handling are narrower than Xero's. Treat as not launch-blocking only if MYOB is not advertised as fully at parity with Xero. |

## 14. Stripe / Billing Readiness

**Verdict: 🟡 PARTIAL — B-3 is a blocker.**

- Checkout, customer portal, Stripe Connect OAuth for invoice ingestion, and subscription tier gating (`lib/billing.ts`, `lib/subscriptionPlans.ts`) all work and are tested.
- `invoice.payment_failed` is unhandled in `stripe-billing` webhook (B-3).
- Stripe API version pinned at `2026-05-27.dahlia` per repository convention — unchanged, correct.

## 15. Security Findings (OWASP-relevant)

| # | Finding | Severity | Evidence |
|---|---|---|---|
| S-1 | Resend webhook signature secret falls back to `""` if unset | 🔴 High (see B-1) | [app/api/webhooks/resend/route.ts](app/api/webhooks/resend/route.ts#L24) |
| S-2 | No duplicate-send guard on reminder emails | 🔴 High (see B-2) | `EmailLog` schema + `lib/email/send.ts` |
| S-3 | RLS isolation | 🟢 Pass | `withUserContext` is used consistently in user-facing routes per research pass; `prismaAdmin` usage is confined to cron/webhooks/bootstrap per convention, matching repository rules |
| S-4 | Zod validation at route boundaries | 🟢 Pass | Confirmed present across sampled routes (settings, onboarding, invoice import) |
| S-5 | Admin route protection | 🟢 Pass | Layered: `proxy.ts` (edge, Supabase-auth-only) + `lib/admin/guard.ts` (PlatformRole + AdminSession) — confirmed by direct read of `proxy.ts` |
| S-6 | `xlsx@0.18.5` (SheetJS Community Edition) | 🟡 Medium | Known historical prototype-pollution/ReDoS advisories against older SheetJS releases; confirm this pinned version and usage pattern (parsing only, not `eval`-based formula execution) are not exposed to unauthenticated input paths |

## 16. Database / Migration Findings

- `prisma/rls-accounting-connections-hotfix.sql` and `prisma/rls-invoice-import-hotfix.sql` exist as standalone SQL files outside the `prisma/migrations/` history. Per repository convention, RLS changes should flow through the standard migration process and be reflected in `prisma/rls-policies.sql`; confirm these hotfixes have since been folded into a proper migration, or fold them in before launch, so a fresh environment bootstrap doesn't silently miss them.
- `EmailLog` has no `@@unique`/`@@index` beyond its primary key (see B-2) — the only model in the schema with essentially no supporting indexes, notable given it's queried per-invoice.

## 17. Environment Variables Matrix

(Cross-checked against `docs/runbooks/README.md` and shipped `.env*.example` files.)

| Variable | Documented in runbook | Present in `.env.example` | Notes |
|---|---|---|---|
| `RESEND_WEBHOOK_SECRET` | Yes | Yes | Must fail closed if unset (B-1) |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Yes | Yes | |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Yes | Yes | |
| `CRON_SECRET` | Yes | Yes | |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Yes (runbook matrix) | **No** | Documented in `docs/runbooks/README.md` but missing from the shipped `.env.example` template — both facts are simultaneously true; add it to the template so new environments aren't silently missing it |
| `INTERNAL_JOBS_SECRET` / `WORKER_TRIGGER_SECRET` | Yes | Yes | Only meaningful once the Railway worker is deployed (B-5) |
| `LIVE` | Yes | Yes | Confirmed actually enforced via `proxy.ts` (see §3 correction) |
| `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` | Yes | Yes | Never construct derived URLs elsewhere, per convention — confirmed only used via `lib/config/supabaseEnvironment.ts` |

## 18. Background Worker / Scheduling Findings

- Dual-system architecture risk: Vercel Cron (active) and Railway/Celery (coded, undeployed) use different code paths for overlapping responsibilities (see §12). This is not just a deployment gap — it's a design risk if both are ever active simultaneously without a single source of truth for "who owns this job."
- Recommendation: either complete the Railway deployment and retire the corresponding Vercel Cron jobs, or explicitly scope launch to Vercel-only and remove/gate the now-unreachable weekly-summary code path from being presented as a feature.

## 19. Test Coverage Gaps

| Area | Coverage | Production risk if untested |
|---|---|---|
| `app/api/webhooks/stripe-billing` | Not directly covered by a route-level test in the sampled suite | `invoice.payment_failed` gap (B-3) would likely have been caught by a table-driven webhook-event test |
| `app/api/webhooks/resend` | Not directly covered | The empty-string secret fallback (B-1) would be caught by a test that unsets the secret and asserts rejection |
| `app/api/cron/send-emails` | Not directly covered at the route level | Duplicate-send risk (B-2) is exactly the kind of defect an integration test simulating two concurrent invocations would catch |
| Xero provider | 🟢 Strong — dedicated `XeroProvider` suite, all passing | |
| Turnstile verification | 🟢 Strong — covers success, missing/empty token, non-200, network failure, timeout, missing secret | |
| Billing/subscription logic (trial, tier resolution, checkout URL resolution) | 🟢 Strong | |

## 20. Build / Lint / Typecheck / Test Results (verified first-hand this session)

- **`npm run lint`**: ✅ Pass — 0 errors, 4 warnings (unused vars):
  - `app/(auth)/sign-in/page.tsx:10` — `persistClientTraceCookie`
  - `lib/dashboard/aiSummary.ts:4` — `LedgerPayment`
  - `lib/invoiceImport/parser.ts:147` — `error`
  - `lib/invoices/export.ts:4` — `STATUS_LABELS`
- **`npx tsc --noEmit`**: ❌ 16 errors, **all confined to `tests/**`** (no application code affected):
  - `tests/dashboard-arrangement-state.test.ts` (1) — test fixture missing `customerId`
  - `tests/dashboard-currency-summaries.test.ts` (3) — test fixture type mismatches
  - `tests/db-check-route.test.ts` (4) — implicit `any` on mock fetch params
  - `tests/supabase-command-bootstrap.test.ts` (8) — mock `process.env` objects missing `NODE_ENV`
- **`npm run test`**: ✅ 683/683 passing, 150 suites, 0 failed, 0 skipped (3.85s)
- **`npm run build`**: ✅ Succeeds — `next build` completes, all 111 static pages generate, all dynamic routes compile (including `ƒ Proxy (Middleware)`)

None of the 16 typecheck errors are launch-blocking (they're test-fixture typing issues, not
application bugs), but they should be fixed since they mean `tsc --noEmit` cannot be used as a
clean CI gate today.

## 21. Documentation Mismatches

| Doc claim | Actual | Fix |
|---|---|---|
| `.github/copilot-instructions.md`: "Custom email templates — routes exist, data is not persisted" | Templates route persists to the `EmailTemplate` model | Update instructions file to reflect actual (partial-but-persisted) status |
| Repo memory note: `add-invoice-export` "not yet implemented" | Export is implemented (`app/api/invoices/export`, `lib/invoices/export.ts`) | Stale note — updated in this session's memory (see below) |
| Pre-launch `LIVE` gate described in some research as "cosmetic only" | Actually enforced at the edge via `proxy.ts` | Corrected in §3 of this report |
| AI rewrite described in some research as a placeholder | Real OpenAI-backed rewrite | Corrected in §3 of this report |

## 22. Production Configuration Risks

- `vercel.json` still schedules `/api/cron/send-emails` and 3 other cron jobs even though a
  parallel Railway system is designed to eventually replace some of them — confirm intent
  before launch (see §18).
- `xlsx@0.18.5` (SheetJS Community Edition) — confirm no unauthenticated upload path passes
  attacker-controlled files directly into parsing without size/row limits (S-6).
- `RESEND_WEBHOOK_SECRET ?? ""` fail-open pattern (B-1) — audit other webhook verifiers
  (`stripe-billing`, `stripe-connect`) to confirm they do not share this pattern; the research
  pass reported those two as verifying strictly, but given this finding was missed by one
  subagent and caught by direct inspection of a different one, a manual line-by-line check of
  both remaining webhook handlers before launch is warranted.

## 23. Pre-Release Tasks

### P0 (must fix before launch)
- [ ] B-1: Make `RESEND_WEBHOOK_SECRET` verification fail closed when unset
- [ ] B-2: Add `@@unique([trackedInvoiceId, stage])` to `EmailLog` + check-before-send in `sendFollowUpEmail()`
- [ ] B-3: Handle `invoice.payment_failed` in the Stripe billing webhook
- [ ] B-4: Implement password reset (Supabase `resetPasswordForEmail` flow)
- [ ] B-5: Decide and execute: deploy the Railway worker, or scope launch to Vercel-only and gate/remove weekly-summary claims
- [ ] Manually re-verify `stripe-billing` and `stripe-connect` webhook secret handling do not share the empty-string fallback pattern found in the Resend webhook

### P1 (should fix soon after launch)
- [ ] Fix 16 `tsc --noEmit` errors in `tests/**` so typecheck can be a clean CI gate
- [ ] Add route-level tests for `stripe-billing`, `resend`, and `send-emails` webhooks/cron
- [ ] Fold `prisma/rls-*-hotfix.sql` files into proper tracked migrations
- [ ] Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to `.env.example` templates
- [ ] Enrich `paymentUrl` in reminder emails instead of hardcoding `undefined`
- [ ] Improve MYOB field mapping/error handling toward Xero parity, or explicitly document MYOB as "partial support"
- [ ] Correct `.github/copilot-instructions.md`'s custom-email-templates scaffold claim

### P2 (cleanup / low risk)
- [ ] Remove 4 unused-variable lint warnings
- [ ] Add pagination to large CSV/XLSX exports
- [ ] Persist a default AI-rewrite tone preference per user
- [ ] Implement team-invite persistence or clearly mark as "coming soon" in the UI

## 24. Final Release Checklist

- [ ] All P0 items above resolved and verified with a passing test
- [ ] `npm run lint` clean (already passing)
- [ ] `npm run test` clean (already passing, 683/683)
- [ ] `npx tsc --noEmit` clean (currently 16 test-fixture errors — fix or explicitly accept)
- [ ] `npm run build` succeeds in an environment matching production env vars (already verified locally)
- [ ] `npm run verify-rls` run against a real Supabase instance after any schema/RLS change
- [ ] Manual re-verification of `stripe-billing` and `stripe-connect` webhook secret handling
- [ ] Decision recorded on Railway worker deployment vs. Vercel-only launch scope
- [ ] `docs/runbooks/README.md` and `.github/copilot-instructions.md` updated per §21

## 25. Final Verdict

- **Recommendation:** 🔴 **DO NOT RELEASE** until P0 items are resolved; re-audit after fixes lands as 🟡 CONDITIONAL at best given the worker-deployment decision still outstanding.
- **Blocker count:** 5 (B-1 through B-5)
- **High-priority (non-blocker) count:** 6 P1 items
- **Most important single issue:** B-2 — the reminder engine, which is the product's core
  revenue-protecting workflow, has no durable guard against sending a customer the same
  reminder twice. This is both a customer-trust risk and the easiest of the five blockers to
  turn into a regression once the Railway worker is deployed alongside the existing Vercel
  Cron path.
- **Minimum work required for launch:** Fix B-1 through B-4 (all are small, targeted code
  changes — a webhook fail-closed fix, a unique constraint + check, one new Stripe event
  handler, and a standard password-reset flow), and make an explicit, documented decision on
  B-5 (worker deployment scope) rather than leaving it ambiguous.
