## Why

PaidSoon advertises a weekly debtor summary, but the feature is currently marked as not implemented in the plan catalog and is rendered as "Coming soon" in the pricing UI. There is also no scheduled job that sends a tenant-level weekly digest today. The existing Celery migration work proves the worker stack is the right place for durable scheduled work, so this feature should be implemented there rather than in a new Vercel Cron path.

## What Changes

- Add a weekly Celery Beat job that sends one debtor summary email per tenant on a fixed weekly schedule.
- Build the summary from each tenant's overdue invoices and payment follow-up state, using the same tenant isolation model as the rest of the app.
- Reuse the existing email delivery stack so the summary is sent through the same Resend-backed path as other outbound system email.
- Add idempotency so a tenant gets at most one weekly summary per period, even if the job retries.
- Mark `weekly_summary_email` as implemented in the plan catalog and update customer-facing pricing/help content so the feature is shown as available where the catalog already enables it.

## Impact

- New Celery task(s) and Beat schedule in the Railway worker service.
- New summary-building logic in the shared application layer so the digest can be tested independently of the worker runtime.
- A small persistence record or log-based idempotency guard for weekly summary sends.
- Updates to pricing/help copy and tests so the feature is no longer presented as coming soon.
- No change to tenant boundaries: the summary remains one email per tenant and only uses that tenant's data.
