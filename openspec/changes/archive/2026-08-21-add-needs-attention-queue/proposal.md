## Why

Today's dashboard "Attention Required" widget (`lib/dashboard/attentionRequired.ts`) is a ranked, capped-at-6 list of specific messages (long-overdue, exhausted reminders, expiring promises, unusually large invoices). It has no concept of disputes, bounced emails, or customers missing a contact email at all, and its flat message-list format doesn't scale cleanly as more categories are added. This change extends it into a category-counted triage queue ("Needs Attention — 7: 2 broken promises, 1 disputed, 1 bounced...") covering every exception type a business owner needs to see in one place, and adds the email delivery-status tracking (sent/delivered/bounced/failed) that the bounced-email category depends on.

## What Changes

- New Resend webhook receiver at `POST /api/webhooks/resend`, verifying Resend's webhook signature before processing (following the same signature-verification pattern already used for Stripe billing/Connect webhooks).
- `EmailLog.status` gains `delivered`, `bounced`, and `complained` values, updated asynchronously as Resend delivers webhook events after a send.
- `lib/dashboard/attentionRequired.ts` is restructured from a flat ranked message list into category-grouped counts, covering: broken promises, disputed invoices (from `add-dispute-pause`), bounced emails (from this change), invoices overdue 60+ days, customers with no contact email (from `add-customer-entity`), and import anomalies (from `add-invoice-payment-ledger`).
- `lib/dashboard/overviewCards.ts` gains new traffic-light cards for disputed and bounced counts, matching the existing pattern used for `broken_promises`/`held_invoices`.
- **BREAKING** (internal only): the existing `AttentionItem` shape (flat message + severity + href) used by `app/dashboard/page.tsx` is replaced by a category-grouped shape; any code consuming the old shape needs updating.

## Capabilities

### New Capabilities
- `needs-attention-queue`: category-counted triage queue surfacing every exception type (broken promises, disputes, bounces, long-overdue invoices, missing contact emails, import anomalies) in one place on the dashboard
- `email-delivery-tracking`: Resend webhook ingestion updating each sent email's delivery status (sent/delivered/bounced/complained)

## Impact

- Prisma schema: no new models; `EmailLog.status` allowed-values comment updated (already a plain `String`, no migration needed for the column itself, just new values written to it).
- New env var: `RESEND_WEBHOOK_SECRET` (documented in `docs/runbooks/README.md` per project convention).
- Code touched: `lib/dashboard/attentionRequired.ts`, `lib/dashboard/overviewCards.ts`, `app/dashboard/page.tsx`, new `app/api/webhooks/resend/route.ts`.
- Depends on `add-dispute-pause` (disputed status), `add-customer-entity` (no-contact-email signal), and `add-invoice-payment-ledger` (import anomaly signal) all being in place first; this is the last change in the sequence.
