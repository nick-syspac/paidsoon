## Context

The codebase is on `main` with the `paidsoon.com` brand flip already committed. There are two pre-existing operator docs (`docs/SETUP.md` and `docs/GO-LIVE.md`) produced by the `invoice-nudge-mvp` and `go-live-runbook` changes. Both have drifted from the code (see proposal for the nine drift items) and overlap heavily.

This change is documentation only — no code, no env vars added or removed, no runtime change. The audience for the runbooks is a single operator (likely the developer themselves) bringing up a fresh environment.

The application's external surface area today:

```
                       ┌────────────────────────┐
                       │       Vercel           │
                       │  Next.js + cron        │
                       └──────────┬─────────────┘
                                  │
        ┌──────────────┬──────────┼──────────┬──────────────┐
        ▼              ▼          ▼          ▼              ▼
   ┌─────────┐    ┌─────────┐  ┌──────┐  ┌────────┐    ┌───────────┐
   │Supabase │    │ Stripe  │  │Stripe│  │ Resend │    │ Vercel    │
   │ Auth +  │    │ Billing │  │Conn- │  │ Email  │    │ Cron      │
   │ DB+RLS  │    │ (us)    │  │ ect  │  │ Send   │    │ (daily)   │
   │         │    │         │  │(them)│  │        │    │           │
   └─────────┘    └─────────┘  └──────┘  └────────┘    └───────────┘
```

Three environments are in scope (Operator question answered):

```
  LOCAL          PREVIEW (Vercel)         PRODUCTION
  -----          ----------------         ----------
  Supabase:      Supabase:                Supabase:
   paidsoon-dev   paidsoon-dev (shared)    paidsoon-prod
  Stripe:        Stripe:                  Stripe:
   test mode      test mode (shared)       live mode
  Webhooks:      Webhooks:                Webhooks:
   Stripe CLI     NONE — UI-only          dashboard endpoints
                 (D3)                     pointing at prod URL
  Cron:          Cron:                    Cron:
   manual         NOT scheduled (D6)       09:00 UTC daily
   trigger
  Resend:        Resend:                  Resend:
   resend.dev     resend.dev sandbox       billing@paidsoon.com
   sandbox
```

## Goals / Non-Goals

**Goals:**

- Produce four per-service runbooks (Supabase, Stripe, Vercel, Resend) plus a top-level README with the canonical env-var matrix.
- Each runbook stands on its own: an operator wiping one provider can re-execute one file without consulting another (cross-references for cross-service dependencies are explicit).
- The runbooks reflect the code as ground truth — every drift item identified in the proposal is resolved in the runbook content.
- The runbooks support local + Vercel Preview + Production without duplicating instructions per environment; per-env differences live in the matrix.

**Non-Goals:**

- Any code change. `invoice.payment_failed` handling is captured as a follow-up change, not done here.
- A dedicated Staging environment with its own Supabase project. The operator chose to share dev backend between local and Preview.
- Per-PR Stripe webhook plumbing (a stable preview alias + duplicate test-mode webhook endpoints). Previews are UI-only.
- New service onboarding (e.g., S3 / Supabase Storage). The code has no storage usage; runbooks deliberately do not cover it.
- Migration of the existing `go-live-runbook` change. It stays archived as-is once complete; this change is independent.

## Decisions

### D1: Per-service runbooks, not per-environment

**Choice**: One file per provider — `supabase.md`, `stripe.md`, `vercel.md`, `resend.md` — each covering all three environments inline. A top-level `README.md` holds the env-var matrix and orchestrates execution order.

**Alternatives considered**:

- *Per-environment runbooks* (`bootstrap-dev.md`, `bootstrap-prod.md`): matches operator workflow ("I'm bringing up prod today") but causes heavy duplication across files and makes "re-run just Stripe" awkward.
- *One monolithic doc*: what `SETUP.md` is today. Hard to navigate, hard to update without merge conflicts when reconfiguring a single provider.

**Why per-service wins**: The operator picked Option A explicitly. The provider-level isolation maps cleanly to "I broke / wiped one service, walk me through that one." Cross-service dependencies (e.g., webhook URL needs production deploy first) are made explicit with "Prerequisite" callouts at the top of each affected section.

### D2: Code is the single source of truth for env var names and webhook events

**Choice**: Every disputed env var name and webhook event list is resolved by `grep` of the code, not by reading either old doc.

| Drift item | Code says | Runbook will say |
|---|---|---|
| Supabase publishable key | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (3 files) | Same |
| Supabase secret key | `SUPABASE_SECRET_KEY` (cron route) | Same |
| App base URL | `NEXT_PUBLIC_APP_URL` (5 sites) | Same |
| Stripe publishable | unused | Omit |
| Google OAuth wired | yes (sign-in + sign-up) | Mark as required |
| Stripe Connect events | `invoice.overdue`, `invoice.paid` | Same |
| `authenticator` role | username swap in pooler URL; same password | Document the swap, not a separate role password |
| Cron on preview | not scheduled | Explicit "production only" note |

**Why**: The two old docs disagree on most of these. A test like "does grep find this env var anywhere?" gives an objective answer.

### D3: Previews are UI-only with respect to Stripe webhooks

**Choice**: Stripe webhooks register one endpoint pair (billing + connect) per Stripe **mode**. Test-mode endpoints are NOT pointed at a Vercel preview alias — instead, local development uses the Stripe CLI to forward webhooks. Live-mode endpoints point at the production URL only.

**Alternative considered**: register a second pair of test-mode webhook endpoints against a stable preview alias like `paidsoon-preview.vercel.app` set up in Vercel → Settings → Domains for the Preview environment. This would let preview deploys exercise the webhook path end-to-end.

**Why the simpler posture wins**: The operator picked it explicitly, and it removes per-PR webhook noise, eliminates a category of "is this webhook hitting prod or preview?" mistakes, and keeps Stripe configuration symmetrical (one endpoint per webhook per mode). The trade-off is that preview deploys cannot fully exercise webhook receipt — but the cron path, the dashboard, and OAuth all still work, which is what previews are useful for in this app.

### D4: Cron schedule is production-only — make this loud in the docs

**Choice**: The `vercel.json` cron entry runs `/api/cron/send-emails` once a day on the production deployment. Vercel does not schedule crons on preview deployments. The Vercel runbook calls this out twice: once when setting the `CRON_SECRET` env var (note it doesn't need to be set on Preview), and once in a dedicated "How to trigger the cron manually for testing" section that gives operators the exact `curl` command.

**Why**: The current docs do not mention this at all, which means anyone debugging "why didn't a preview environment send emails?" loses time before they figure it out.

### D5: Delete the old docs in this change — do not maintain a parallel path

**Choice**: `docs/SETUP.md` and `docs/GO-LIVE.md` are deleted in the same commit that adds `docs/runbooks/`. The repository `README.md` is updated to point at `docs/runbooks/` instead.

**Alternative considered**: leave the old docs in place with a deprecation header pointing at the new ones. Keeps history visible at the cost of perpetual drift — the next time the code changes, someone will update only one of the three places.

**Why deletion wins**: Operator chose it. Git history preserves the old docs; nobody should be reading a deprecated runbook from `main`. The runbooks are the single source of truth.

### D6: `invoice.payment_failed` is in the runbook but not in code — split as a follow-up

**Choice**: The Stripe Billing runbook lists `invoice.payment_failed` as a required event in the dashboard webhook config (operators subscribe to it now). The corresponding code handler is captured as a follow-up change `handle-billing-payment-failed-webhook` to be filed separately, not done here.

**Why**: Operator wants the event subscribed in production so the data is available immediately when the handler lands. Stripe is happy to deliver events that the endpoint acknowledges with `200`; the current billing webhook switch falls through and returns `{received: true}` for unhandled types, so listing the extra event is non-breaking. Doing the handler in this change would mix code with docs and inflate the diff.

**Follow-up scope** (for the next change, not here):

- Add a `case "invoice.payment_failed":` branch in [stripe-billing route](app/api/webhooks/stripe-billing/route.ts) that flips `subscriptionStatus` to `past_due` and (optionally) emits an in-app notice.
- Add a test or smoke check.
- Update the runbook from "subscribed but not handled yet" to "subscribed and handled."

### D7: Env-var matrix in `runbooks/README.md` is the single normative place

**Choice**: Every env var lives in one table, with one row per var and one column per environment. Per-service runbooks **reference** rows of this table rather than restating values, so updating the matrix updates all the runbooks transitively.

**Why**: This is the most error-prone surface — wrong copy in any one runbook leads to a broken environment. Centralizing it makes drift between runbooks impossible by construction.

## Risks / Trade-offs

- **[Per-service runbooks bury cross-service ordering]** → Mitigation: each runbook starts with a "Prerequisites" block naming the other runbook sections that must be complete first; `README.md` also includes a top-to-bottom recommended execution order for a brand-new environment.
- **[Operators read only one runbook and miss the matrix]** → Mitigation: each runbook header sentence: "Env-var values come from [runbooks/README.md](./README.md) — set them in the environment named in each row."
- **[D6 leaves the docs ahead of the code]** → Mitigation: the Stripe runbook section that lists `invoice.payment_failed` includes an inline "as of <date> this event is delivered but not yet handled by code; see follow-up `handle-billing-payment-failed-webhook`" note so future readers understand the lag.
- **[Deleting old docs invalidates any external links]** → Mitigation: low risk (this is an internal repo), but the repo `README.md` will point at `docs/runbooks/` so the natural entry point is preserved.
- **[The runbooks themselves drift from code over time]** → Mitigation: the same grep-based drift audit that produced this change can be re-run; we should consider adding a CI check that asserts no env var is named in docs but missing from code (out of scope for this change, but worth filing as a future improvement).

## Migration Plan

This is a docs-only change.

1. Land all five new files under `docs/runbooks/` in one commit.
2. Update repository `README.md` to point at `docs/runbooks/` (single-line link update).
3. Delete `docs/SETUP.md` and `docs/GO-LIVE.md` in the same commit.
4. No deploy required. No env var changes. No risk to production.

**Rollback**: `git revert` the commit. Nothing in production is affected.

## Open Questions

- Should the runbooks include a "tear-down" section per provider (how to wipe a Supabase project, revoke Stripe Connect, etc.)? Decision deferred — not requested, not blocking. Easy to add as an appendix later.
- Should the matrix in `README.md` be auto-generated from a script that greps the code? Possible future improvement; out of scope here.
- Date of follow-up to land `handle-billing-payment-failed-webhook`? To be decided by the operator after this change merges.
