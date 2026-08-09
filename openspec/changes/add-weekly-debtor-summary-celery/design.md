## Context

PaidSoon already has a Railway Celery worker architecture for durable scheduled jobs, and the product already has the underlying tenant-scoped data needed to build a weekly debtor summary. The missing piece is the weekly digest itself: a tenant-specific summary of overdue invoices, debtor counts, and follow-up status that is sent once per week.

Today the codebase treats `weekly_summary_email` as a planned feature. The pricing page renders it as "Coming soon", and there is no worker task, cron route, or dashboard action that actually sends the summary. This change adds the feature without changing the existing tenant model: one Supabase auth user is one tenant.

## Goals / Non-Goals

**Goals:**
- Send one weekly debtor summary email per tenant on a fixed schedule.
- Keep the job inside the existing Celery worker stack rather than adding another Vercel Cron route.
- Preserve tenant isolation and avoid cross-tenant aggregation.
- Make the send idempotent per tenant and week so retries do not duplicate mail.
- Promote the feature from "Coming soon" to implemented in plan/catalog UI.

**Non-Goals:**
- Not changing the reminder sequence logic or the existing daily reminder cron.
- Not adding a new tenant/membership model.
- Not changing billing tiers beyond enabling the feature that is already encoded in the catalog.
- Not building a generic reporting framework.

## Decisions

- **Use Celery Beat for the schedule.** The weekly summary is another scheduled background workflow, so it belongs with the existing worker instead of a new Vercel Cron path.
- **Compute summaries in shared application code.** The worker should call a reusable summary builder so the behavior can be unit tested without a live worker.
- **One summary per tenant per week.** The job should derive a stable idempotency key from tenant id and week start so retries and deploy restarts do not duplicate sends.
- **Reuse the current email delivery path.** The summary should go through the same Resend-backed sending helper and logging pattern as other PaidSoon system emails.
- **Tenant scope is the user scope.** Every query must stay rooted in a single tenant/user id; no cross-tenant rollups or support-style global aggregation are needed.

## Risks / Trade-offs

- [Summary content could diverge from dashboard metrics] -> keep the builder small and feed it from the same invoice state fields used elsewhere.
- [Weekly sends may duplicate during retries or deploy restarts] -> require an idempotency record keyed by tenant + week.
- [Feature visibility may lag behind implementation] -> update the plan catalog, pricing page, and tests in the same change.

## Migration Plan

1. Add shared summary-building logic that gathers the tenant's overdue-invoice view for the email.
2. Add a Celery Beat task that runs weekly and enqueues or sends one summary per tenant.
3. Add idempotency and send logging for the weekly summary path.
4. Update plan/catalog presentation so `weekly_summary_email` is no longer marked as unimplemented.
5. Add tests that prove the summary is tenant-scoped and only sent once per period.

## Open Questions

- Which exact day/time should the weekly summary run at in production?
- What should the summary email emphasize first: amount due, debtor count, newest overdue items, or next-step reminders?
- Should the summary be limited to currently overdue invoices only, or include all active pending follow-ups?
