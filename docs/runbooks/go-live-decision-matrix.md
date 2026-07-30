# PaidSoon Go-Live Decision Matrix Runbook

This runbook is the launch decision artifact for PaidSoon.

Use it to run a single go/no-go review meeting and produce a clear launch decision backed by evidence.

## Decision policy

A release is **GO** only when:

- All Critical gates are Pass.
- No High gate is Fail.
- Every deferred Medium gate has an explicit owner and date.

A release is **NO-GO** when any Critical gate is Fail.

## Roles

- Release owner: accountable for final go/no-go call.
- Evidence owner: gathers proof and links for each gate.
- Service owners: Supabase, Stripe, Resend, Vercel, Product.
- Recorder: updates this document live during the review.

## How to run the review

1. Review each gate in order.
2. Confirm evidence is current (same day as decision).
3. Mark Status as Pass or Fail.
4. Record blocker action, owner, and ETA for each Fail.
5. Make final decision at the bottom.

## Gate matrix

| Gate ID | Gate | Status | Severity | Evidence required | Owner | ETA | Blocker action |
|---|---|---|---|---|---|---|---|
| G1 | Build and test baseline is green on develop | Pass | Critical | Latest `npm run build` and `npm test` outputs | Engineering | Done | Re-run before launch cut |
| G2 | Production infra is provisioned (domain, Supabase prod, Vercel, env vars, migrations) | Fail | Critical | Completed checklist in [go-live-runbook tasks](../../openspec/changes/go-live-runbook/tasks.md) Phase 1, 2, 4 | Platform | TBD | Complete all open Phase 1/2/4 tasks |
| G3 | Stripe live readiness (Connect approved, live keys, billing and connect webhooks set) | Fail | Critical | [go-live-runbook tasks](../../openspec/changes/go-live-runbook/tasks.md) Phase 3 and [invoice-nudge-mvp tasks](../../openspec/changes/invoice-nudge-mvp/tasks.md) 13.3-13.5 | Billing | TBD | Finish Connect approval and register live webhooks |
| G4 | Resend production sender domain verified and active | Fail | Critical | [go-live-runbook tasks](../../openspec/changes/go-live-runbook/tasks.md) 1.2-1.3 and [invoice-nudge-mvp tasks](../../openspec/changes/invoice-nudge-mvp/tasks.md) 13.4 | Email | TBD | Verify DNS and confirm production sender |
| G5 | RLS runtime rollout validated (authenticator runtime URL + verification) | Fail | Critical | [enforce-rls-via-prisma tasks](../../openspec/changes/enforce-rls-via-prisma/tasks.md) 1.5-1.7, 5.5, 7.1-7.3 | Data | TBD | Complete env rollout and run isolation verification |
| G6 | End-to-end production simulation passed (connect -> overdue -> 3 emails -> paid stop) | Fail | Critical | [go-live-runbook tasks](../../openspec/changes/go-live-runbook/tasks.md) 5.4 and [invoice-nudge-mvp tasks](../../openspec/changes/invoice-nudge-mvp/tasks.md) 13.6 | Product | TBD | Run and record full E2E evidence |
| G7 | Runtime API error hygiene for production | Fail | High | Remove production TODO in [app/api/billing/downgrade/route.ts](../../app/api/billing/downgrade/route.ts) | Engineering | TBD | Remove detailed error leak in response body |
| G8 | Contact surface readiness (implemented or intentionally disabled) | Fail | Medium | Decision and implementation state in [app/api/contact/route.ts](../../app/api/contact/route.ts) | Product | TBD | Implement handler or remove public entrypoint |
| G9 | CI and integration automation maturity | Fail | Medium | Gap acknowledged in [docs/DDD.md](../DDD.md) | Engineering | TBD | Track post-launch hardening work |

## MYOB Business launch gates

MYOB Business is a separate rollout decision from the overall product go-live above — it can
be private-beta while the rest of the product is in private beta, and does not need to wait
for the Critical gates G1–G9 above (those cover Stripe/Supabase/Resend/RLS, not accounting
integrations). Use this sub-matrix specifically to decide whether MYOB can move from
**blocked** → **private beta** → **supported production**.

| Gate ID | Gate | Status | Severity | Evidence required | Owner | ETA | Blocker action |
|---|---|---|---|---|---|---|---|
| G-MYOB1 | Environment and secret completeness | Pass | Critical | `MYOB_CLIENT_ID`, `MYOB_CLIENT_SECRET`, `MYOB_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY` set per [myob.md §2](./myob.md) for the target environment, redirect URI registered in the MYOB developer portal | Platform | Done | Register the redirect URI and set the four env vars |
| G-MYOB2 | Real MYOB sandbox connection validation | Fail | Critical | Connect → callback → company-file resolution → first sync completed against a real MYOB sandbox company file, following [myob.md §3.1](./myob.md); all 5 invoice types (Service, Item, Professional, TimeBilling, Miscellaneous) confirmed reachable under the `sme-sales` scope | Integrations | TBD | Run the sandbox validation in [myob.md §3](./myob.md) and attach evidence (sync run output, invoice counts) |
| G-MYOB3 | First-sync and status-transition validation | Fail | Critical | Observed `pending_first_sync` → `active` transition on a successful first sync, and `pending_first_sync` → `error` on a deliberately-failed first sync, with a working retry via "Sync now" / "Retry sync" | Engineering | TBD | Exercise both the success and failure paths against sandbox and record the connection status at each step |
| G-MYOB4 | Support and observability readiness | Fail | High | Admin tenant detail surfaces a stale/pending/error MYOB connection as a diagnostic with a working "Trigger resync" action end-to-end (not just present in code) | Support / Engineering | TBD | Run through [lib/admin/diagnostics/checks/sync-stale.ts](../../lib/admin/diagnostics/checks/sync-stale.ts) scenarios against a real connection and confirm the admin resync action reflects the true outcome |
| G-MYOB5 | Documentation and rollout messaging alignment | Fail | High | Marketing pages, FAQ, docs, and roadmap describe MYOB's actual rollout state (not "planned"/"coming soon" once connect is user-reachable, and not "supported" before G-MYOB2/G-MYOB3 pass) | Product | TBD | Reconcile marketing copy against the current rollout level whenever it changes |

### MYOB rollout levels

- **Blocked** — any Critical MYOB gate (G-MYOB1–G-MYOB3) is Fail. MYOB connect entry points
  should not be advertised as usable; if already deployed behind a feature flag or tier gate,
  treat failures as expected and do not promise data collection.
- **Private beta** — G-MYOB1–G-MYOB3 are Pass, G-MYOB4 and/or G-MYOB5 may still be Fail.
  MYOB can be offered to invited/early-access users with clear "private beta" messaging, but
  is not yet a generally-supported production data source.
- **Supported production** — all five gates (G-MYOB1–G-MYOB5) are Pass. MYOB may be
  described as a supported, generally-available invoice source in public-facing copy.

As of this change, MYOB is **blocked** for supported-production claims: G-MYOB2 and G-MYOB3
require a real MYOB sandbox, which cannot be exercised without live MYOB developer
credentials. G-MYOB1 (env/secret shape), G-MYOB4 (support tooling), and the code-level half of
G-MYOB5 are addressed by this change; the sandbox run and the final rollout-level decision are
operator actions to complete using [myob.md §3](./myob.md).

## Current snapshot (2026-07-01)

- Decision: NO-GO.
- Reason: Critical gates G2, G3, G4, G5, and G6 are still Fail.
- Code confidence: High (build and tests green), but launch operations are incomplete.

## Pre-launch command evidence pack

Run these commands on the final candidate and attach outputs in launch notes.

```bash
npm test
npm run build
```

For RLS verification, run the script with production-like credentials after env rollout.

```bash
npm run verify-rls
```

## Launch sign-off

- Decision date:
- Decision: GO / NO-GO
- Release owner:
- Evidence links:
- Notes:

## Post-decision actions

If GO:

1. Deploy production release.
2. Execute smoke checklist from [vercel runbook](./vercel.md).
3. Monitor Stripe webhooks, cron sends, and error logs for first 24 hours.

If NO-GO:

1. Convert each failing gate into an actionable task with owner and ETA.
2. Re-run decision review after all Critical gates are Pass.
3. Keep `LIVE=false` in production until final GO call.
