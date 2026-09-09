# Seeded Dev User Test Plan (dev.paidsoon.com)

This runbook is a full manual test plan for the seeded development environment at `https://dev.paidsoon.com`.

It is designed to validate every functional module currently present in this repository, using the seeded demo tenants described in [docs/preview-seed-data.md](../preview-seed-data.md).

## 1. Scope and goals

Goals:

1. Verify all user-facing modules with deterministic seeded data.
2. Verify plan-gating behavior (Starter vs Business-tier seeded users).
3. Verify tenant isolation between seeded accounts.
4. Verify operator-only modules (cron, internal jobs, webhooks, admin) with explicit steps.

Out of scope:

1. Real third-party production data.
2. Real outbound customer email delivery (seed uses `.test` addresses and suppression safeguards).

## 2. Seeded test users

Use these seeded sign-in accounts (default password: `PaidSoonDev!2026`, unless `SEED_USER_PASSWORD` was overridden):

| Persona | Email | Seed purpose |
|---|---|---|
| Primary business account | `owner@coastline-demo.test` | Full workflows and full module coverage |
| Restricted starter account | `bookkeeper@coastline-demo.test` | Plan-gating and upsell behavior |
| Second business tenant | `owner@yarravalley-demo.test` | RLS isolation and cross-tenant checks |

Seed reference: [docs/preview-seed-data.md](../preview-seed-data.md).

## 3. Module coverage matrix

Each module below maps to one or more test cases in this runbook.

| Module | Coverage IDs |
|---|---|
| Marketing site + contact form | TC-01, TC-02 |
| Auth + LIVE gating + sign out | TC-03, TC-04 |
| Onboarding + plan selection + trial gating | TC-05 |
| Dashboard overview + nav | TC-06 |
| Invoices (active/resolved, filters, actions) | TC-07, TC-08, TC-09 |
| Promise-to-pay | TC-10 |
| Arrangements | TC-11 |
| Schedule settings | TC-12 |
| Email sender settings | TC-13 |
| Templates + AI rewrite | TC-14 |
| Team seats/invite scaffold | TC-15 |
| Billing/subscription/checkout/portal/downgrade | TC-16 |
| Stripe connection lifecycle | TC-17 |
| Accounting integrations (MYOB/Xero) | TC-18 |
| Invoice import (template/upload/mapping/commit) | TC-19 |
| Spend import | TC-20 |
| SpendLeak list + finding detail + export | TC-21 |
| MarginGuard dashboard + export | TC-22 |
| Cost Guard dashboard + detail pages | TC-23 |
| Runway Guard dashboard + settings | TC-24 |
| Tax Buffer dashboard + settings + overrides | TC-25 |
| CommitGuard dashboard + settings + lifecycle | TC-26 |
| CashPlan dashboard/settings | TC-27 |
| Owner's Digest dashboard + detail + settings | TC-28 |
| Help/training content fallback behavior | TC-29 |
| Admin console + device/session/audit | TC-30 |
| Cron + internal jobs + diagnostics + webhook protections | TC-31 |
| Tenant isolation end-to-end regression | TC-32 |

## 4. Test execution rules

1. Capture evidence for every case: screenshot + short pass/fail note + timestamp.
2. Do not modify production data or credentials.
3. For any failing case, record:
   1. URL
   2. User account
   3. Repro steps
   4. Actual result
   5. Expected result
4. Between persona switches, always sign out and sign back in.

## 5. Test cases

### TC-01 Marketing pages and navigation

1. Open `https://dev.paidsoon.com` in an incognito/private window.
2. Verify landing page sections render (hero, how-it-works, pricing, footer).
3. Open pricing CTA and verify it routes to sign-up or relevant auth flow.
4. Verify no broken internal links in top-level marketing navigation.
5. Pass criteria: marketing pages load without 500/404 and CTAs route correctly.

### TC-02 Contact form and anti-abuse flow

1. While signed out, open the contact form page or contact section.
2. Submit with one required field empty.
3. Verify validation message appears and form does not submit.
4. Submit with valid non-sensitive demo text.
5. Verify success state appears.
6. Pass criteria: validation and successful submission both behave as expected.

### TC-03 Auth flows (sign-in, sign-up redirect behavior)

1. Go to `/sign-in` and sign in as `owner@coastline-demo.test`.
2. Verify redirect to `/dashboard`.
3. Open `/sign-in` again while authenticated.
4. Verify redirect away from auth page (to dashboard/home per current policy).
5. Sign out.
6. Try opening `/dashboard` while signed out.
7. Verify redirect back to `/sign-in`.
8. Pass criteria: auth guards and redirects are consistent.

### TC-04 Live-mode and sign-out behavior

1. While signed in, use the user menu sign-out action.
2. Verify redirect to `/`.
3. If pre-launch banner is configured in this environment, verify banner text appears on public pages.
4. Pass criteria: sign-out always ends session and routes to homepage.

### TC-05 Onboarding and plan selection entry points

1. Sign in as `bookkeeper@coastline-demo.test`.
2. Open onboarding and subscription-related pages from settings.
3. Verify Starter-tier messaging and upgrade CTAs are visible.
4. Attempt to access higher-tier-only module from dashboard nav.
5. Verify you receive upsell/locked state (not server error).
6. Pass criteria: onboarding/plan messaging and gating are correct.

### TC-06 Dashboard overview and cross-module cards

1. Sign in as `owner@coastline-demo.test`.
2. Open `/dashboard`.
3. Verify overview cards load (overdue, chase allowance, broken promises, held invoices).
4. Click each card filter CTA and confirm it lands in the expected filtered list.
5. Verify navigation rail loads all enabled module links.
6. Pass criteria: overview state and click-through filters are coherent.

### TC-07 Invoice list integrity (active and resolved)

1. Open `/dashboard/invoices`.
2. Confirm seeded examples are present, including:
   1. `northcote-dental`
   2. `sunshine-metal`
   3. `ringwood-auto`
3. Open `/dashboard/resolved`.
4. Confirm paid/manually-resolved examples exist (for example `camberwell-strata`).
5. Pass criteria: seeded invoice scenarios are visible in correct lists.

### TC-08 Invoice action state machine

1. In active invoices, choose a pending invoice and click Pause.
2. Verify status changes to paused and reminder progression is blocked.
3. Click Resume and verify status returns to pending.
4. Run Snooze and verify snooze indicator/date appears.
5. Mark one invoice as manually resolved.
6. Verify it moves to resolved list.
7. Pass criteria: pause/resume/snooze/resolve transitions persist and render correctly.

### TC-09 Dispute and dispute resolution

1. Choose an eligible pending invoice and open Dispute action.
2. Enter a dispute note and submit.
3. Verify invoice status is disputed and normal chase actions are blocked.
4. Run Resolve dispute with a resolution note.
5. Verify status returns to pending and note updates/clears per UI behavior.
6. Pass criteria: dispute lifecycle works and prevents invalid transitions.

### TC-10 Promise-to-pay scenarios

1. In active invoices, locate seeded active promise example (`ringwood-auto`).
2. Verify promise state is visible and reminders are suppressed while active.
3. Locate broken promise example (`sunbury-landscaping`) and verify broken state indicators.
4. If UI exposes promise details/history, verify dates and states are consistent.
5. Pass criteria: active and broken promise states are distinguishable and consistent.

### TC-11 Arrangement scenarios

1. Locate arrangement-in-progress example (`dandenong-freight`).
2. Verify arrangement state and expected payment metadata appear.
3. Locate broken arrangement example (`broadmeadows-panel`).
4. Verify broken arrangement state is visible.
5. Pass criteria: arrangement lifecycle states are correctly represented.

### TC-12 Schedule settings

1. Open `/dashboard/settings/schedule` as `owner@coastline-demo.test`.
2. Verify existing seeded cadence loads.
3. Change offsets to a valid ascending sequence and save.
4. Reload page and verify persistence.
5. Attempt invalid sequence (non-ascending or invalid values).
6. Verify validation blocks invalid save.
7. Restore original values.
8. Pass criteria: schedule validation and persistence behave correctly.

### TC-13 Email identity settings

1. Open `/dashboard/settings/email` as primary business account.
2. Verify custom sender/reply-to controls are visible for this tier.
3. Save a valid custom sender name and reply-to.
4. Verify success feedback and persisted values after reload.
5. Sign in as starter account and open same page.
6. Verify restricted controls are gated/hidden with upsell messaging.
7. Pass criteria: tier-based sender capabilities are enforced.

### TC-14 Templates and AI rewrite

1. Open `/dashboard/settings/templates` as primary business account.
2. Edit stage 1 template text and save.
3. Reload and verify saved content persists.
4. Trigger AI rewrite for the edited text.
5. Verify three tone variants are returned.
6. Choose one variant and apply it.
7. Reset one stage to default using delete/reset action.
8. Pass criteria: template CRUD and AI rewrite flow work end-to-end.

### TC-15 Team seats/invite scaffold behavior

1. Open `/dashboard/settings/team`.
2. Verify seat usage summary loads.
3. Submit an invite with invalid email.
4. Verify validation error.
5. Submit invite with valid email.
6. Verify current scaffold response is user-safe (no crash, clear status messaging).
7. Pass criteria: scaffold endpoint handles valid/invalid submissions safely.

### TC-16 Billing and subscription management

1. Open `/dashboard/settings/subscription` as starter account.
2. Trigger upgrade flow to checkout initiation.
3. Verify checkout session redirect/url creation works.
4. Open billing portal action (if available for seeded account state).
5. Verify portal session creation behavior and error handling.
6. If downgrade flow is exposed, verify schedule/deferred downgrade messaging appears.
7. Pass criteria: checkout/portal/downgrade surfaces operate without runtime errors.

### TC-17 Stripe connection lifecycle module

1. Open `/dashboard/settings/stripe` or integrations connection UI.
2. Start Stripe connect authorization flow.
3. Verify redirect to provider and safe callback handling.
4. Return/cancel and confirm app handles cancellation gracefully.
5. If seeded connection already exists, run disconnect action.
6. Verify connection state updates and related invoices move to expected paused behavior.
7. Pass criteria: connect/disconnect state changes are consistent.

### TC-18 Accounting integrations (MYOB/Xero)

1. Open `/dashboard/settings/integrations` and connections pages.
2. As primary account, verify seeded accounting connection states are visible.
3. As second tenant (`owner@yarravalley-demo.test`), verify independent seeded connection with error-state example is visible.
4. If "Sync now" exists, trigger it and verify safe status feedback.
5. Pass criteria: integration states render accurately and are tenant-scoped.

### TC-19 Invoice import module

1. Open `/dashboard/settings/import-export` or `/dashboard/settings/import`.
2. Download invoice import template.
3. Upload a minimally valid test file based on template.
4. Verify mapping UI appears.
5. Complete mapping and run validation/preview.
6. Commit import.
7. Verify imported invoices appear in invoice list with expected status.
8. Pass criteria: template -> upload -> mapping -> commit path is functional.

### TC-20 Spend import module

1. Open spend import section from combined import/export settings.
2. Download spend template.
3. Upload seeded-compatible sample spend file.
4. Verify parsing/mapping/validation flows complete.
5. Commit import and verify completion message.
6. Pass criteria: spend import flow completes and produces usable records.

### TC-21 SpendLeak module and export

1. Open `/dashboard/spendleak` as business-tier account.
2. Verify module summaries load without stale/error state (unless intentionally seeded stale).
3. Open one finding detail at `/dashboard/spendleak/[id]`.
4. Verify evidence cards, lifecycle controls, and raw evidence areas render.
5. Trigger SpendLeak export and download CSV/XLSX.
6. Verify exported file has rows and expected columns.
7. Pass criteria: list/detail/export flows are usable and grounded in data.

### TC-22 MarginGuard module and export

1. Open `/dashboard/margin-guard`.
2. Verify seeded healthy/watch/critical signals are represented.
3. Open margin-related settings/export screen.
4. Run MarginGuard export for at least one dataset.
5. Verify downloaded file is non-empty and structurally valid.
6. Pass criteria: margin dashboard and export are functional.

### TC-23 Cost Guard module

1. Open `/dashboard/cost-guard`.
2. Verify summary and alert surfaces load.
3. Open each subpage:
   1. `/dashboard/cost-guard/rules`
   2. `/dashboard/cost-guard/alerts`
   3. `/dashboard/cost-guard/categories`
   4. `/dashboard/cost-guard/suppliers`
4. Open one alert detail and one category/supplier detail page.
5. Pass criteria: all Cost Guard routes render and data is tenant-scoped.

### TC-24 Runway Guard module

1. Open `/dashboard/runway-guard`.
2. Verify runway summary timeline/cards render.
3. Trigger scenario simulation (if available in UI) and verify deterministic output.
4. Open `/dashboard/settings/runway-guard` and save a non-destructive settings change.
5. Reload to verify persistence.
6. Revert the settings change.
7. Pass criteria: dashboard and settings persist correctly.

### TC-25 Tax Buffer module

1. Open `/dashboard/tax-buffer`.
2. Verify reserve totals, safe-to-spend, category breakdown, and obligations render.
3. Open `/dashboard/settings/tax-buffer`.
4. Modify one configurable category setting and save.
5. Create one manual override (small value) and verify summary updates.
6. Reload page and verify settings/override persistence.
7. Revert changes made in this test.
8. Pass criteria: summary, settings, and overrides all function.

### TC-26 CommitGuard module

1. Open `/dashboard/commitguard`.
2. Verify horizon totals, upcoming commitments, and detection candidates render.
3. Open one candidate/commitment lifecycle action (confirm, pause, resume, cancel) and execute one reversible action.
4. Verify event history updates accordingly.
5. Open `/dashboard/settings/commitguard`, adjust one setting, save, and verify persistence.
6. Revert changes.
7. Pass criteria: commitment lifecycle and settings are operational.

### TC-27 CashPlan module

1. Open `/dashboard/settings/cash-plan` and related cash plan views.
2. Verify seeded scenario data is present (base + conservative where available).
3. Adjust a non-destructive override/scenario value.
4. Save and verify summary changes.
5. Reload and verify persistence.
6. Revert change.
7. Pass criteria: cash plan data loads, updates, and persists.

### TC-28 Owner's Digest module

1. Open `/dashboard/owners-digest`.
2. Verify summary sections render: attention, opportunities, positive signals, metrics.
3. Open one digest detail at `/dashboard/owners-digest/[digestId]`.
4. Verify source completeness and historical delivery records are visible.
5. Open `/dashboard/settings/owners-digest`.
6. Change cadence or materiality threshold and save.
7. Reload and verify persistence.
8. Revert change.
9. Pass criteria: digest list/detail/settings work and are deterministic.

### TC-29 Help and training content destination fallback

1. Open `/help` while signed out.
2. Open several guides and verify all destination links are valid.
3. For any guide link that requires auth, verify signed-out user is redirected safely.
4. Sign in and verify same link resolves to in-app destination.
5. Pass criteria: no broken help destinations; fallback behavior is safe.

### TC-30 Admin module

Precondition: admin role and environment flags are configured per [docs/runbooks/admin.md](./admin.md).

1. Sign in as support/admin account.
2. Open `/admin`.
3. Verify verify-challenge/session flow behavior per environment.
4. Open admin areas and verify each loads:
   1. staff
   2. users
   3. customers/tenants
   4. subscriptions
   5. integrations
   6. sessions/devices
   7. audit log/activity feed
5. Perform one non-destructive action (for example, search/filter only).
6. Verify audit entries are visible.
7. Pass criteria: admin guard, session, and read workflows operate.

### TC-31 Operator-only modules (cron, internal jobs, diagnostics, webhooks)

Precondition: operator secrets available (`CRON_SECRET`, webhook secrets, internal secrets).

1. Trigger each cron route once with authorized header in dev:
   1. `/api/cron/send-emails`
   2. `/api/cron/sync-accounting`
   3. `/api/cron/invoice-import-cleanup`
   4. `/api/cron/margin-guard-snapshots`
   5. `/api/cron/runway-guard-snapshots`
   6. `/api/cron/scheduling-watchdog`
2. Verify each returns authenticated success or safe no-op responses.
3. Call one internal job route with proper internal auth and verify unauthorized calls are rejected.
4. Send one invalid-signature request to each webhook endpoint and verify signature rejection.
5. If diagnostics routes are enabled in dev, verify they require auth and return safe payloads.
6. Pass criteria: operator routes enforce auth/signature checks and execute safely.

### TC-32 Tenant isolation and regression sweep

1. Sign in as `owner@coastline-demo.test`; note one invoice/customer record unique to Coastline.
2. Sign out and sign in as `owner@yarravalley-demo.test`.
3. Confirm the Coastline-only record is not visible in invoices, module dashboards, exports, or settings.
4. Repeat spot checks for SpendLeak, MarginGuard, Cost Guard, Runway Guard, Tax Buffer, CommitGuard, and Owner's Digest pages.
5. Run one export in each tenant and confirm row sets are tenant-specific.
6. Pass criteria: no cross-tenant data leakage anywhere in UI/API responses.

## 6. Exit criteria

The test plan passes when all are true:

1. All 32 test cases are executed.
2. All P0/P1 failures are fixed or accepted with documented risk.
3. No cross-tenant data exposure is observed.
4. No module route produces unhandled 500 errors in normal seeded flows.
5. Plan-gating and scaffold behavior are clear and user-safe.

## 7. Recommended execution order

1. TC-01 to TC-06 (core user journey)
2. TC-07 to TC-18 (invoice, billing, integrations, settings)
3. TC-19 to TC-29 (imports, analytics modules, help)
4. TC-30 to TC-31 (admin/operator-only)
5. TC-32 (final isolation regression)

## 8. Known scaffold expectations (do not fail as bugs unless behavior regresses)

1. Team invites are partial scaffold behavior and may not persist membership.
2. Some module states may intentionally show seeded synthetic/demo statuses.
3. Seed safety guards intentionally suppress real outbound delivery to reserved domains.

References:

1. [docs/preview-seed-data.md](../preview-seed-data.md)
2. [docs/DDD.md](../DDD.md)
3. [docs/runbooks/admin.md](./admin.md)
4. [docs/runbooks/support-account.md](./support-account.md)
5. [docs/runbooks/README.md](./README.md)
