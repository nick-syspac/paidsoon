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
