## Why

Freelancers frequently receive verbal or written commitments from clients about when they'll pay an overdue invoice, but PaidSoon has no way to capture or track these commitments. This means automated follow-up emails keep firing at clients who have already promised to pay, damaging the freelancer's relationship — and when a promise is broken, the freelancer has no alert and no structured record of the debtor's behaviour. Tracking promises to pay closes this loop and lays the groundwork for AI-assisted debtor risk flagging.

## What Changes

- **New `PromiseToPay` model** — stores a history of client payment commitments per invoice, each with a status lifecycle (`active` → `kept` / `broken` / `superseded`).
- **Client-initiated promise flow** — follow-up emails sent to Business+ users will include a secure link (`/promise/[token]`) that allows the client to self-commit to a payment date without requiring authentication.
- **New public page** — `/promise/[token]` lets a client confirm a payment date, an optional partial amount, and an optional note. Requires no login.
- **Email suppression while promise is active** — the daily cron will skip sending follow-up emails to invoices that have an `active` promise, preventing duplicate pressure on committed clients.
- **Breach detection in cron** — when a promise date passes without payment, the promise is marked `broken` and the freelancer is notified by email with a link to their dashboard to decide next steps.
- **Freelancer notification on promise receipt** — when a client submits a promise, the freelancer receives a notification email confirming the commitment details.
- **Tier gate** — the feature is gated behind `promise_to_pay_tracking` (already named in `subscriptionPlans.ts`), enabled for `business` and `accountant_partner` tiers.
- **Dashboard indicators** — the invoice table shows an active promise badge and a broken promise warning flag, including a count of prior broken promises from the same client email.
- **Promise history per invoice** — each promise submission creates a new record; the full history is preserved for future AI analysis.

## Capabilities

### New Capabilities

- `promise-to-pay`: Client-initiated payment commitment flow — token generation, public confirmation page, freelancer notifications, cron-based breach detection, and dashboard visibility of promise state and history.

### Modified Capabilities

- `subscription-plan-tiers`: Enable `promise_to_pay_tracking` on `business` and `accountant_partner` tiers (currently `false` with a `// not yet implemented` comment).

## Impact

- **Schema**: New `PromiseToPay` model; new `p2pToken` field on `TrackedInvoice`.
- **Migration**: One new migration adding the table and column.
- **RLS**: New RLS policy for `promise_to_pay` scoped to `userId`.
- **Cron** (`app/api/cron/send-emails/route.ts`): Two additions — skip emails when active promise exists; detect and notify on broken promises.
- **Email** (`lib/email/send.ts`, `lib/email/templates.ts`): Conditionally embed P2P link for Business+ users; new breach and promise-received notification emails.
- **New route** (`app/api/promise/[token]/route.ts`): Public POST — validates token, creates `PromiseToPay`, notifies freelancer.
- **New page** (`app/promise/[token]/page.tsx`): Public — no auth, minimal invoice info, promise submission form.
- **Dashboard** (`components/dashboard/InvoiceTable.tsx`): P2P badge and broken-promise flag.
- **Plan catalog** (`lib/subscriptionPlans.ts`): Flip `promise_to_pay_tracking` to `true` for `business` and `accountant_partner`.
- **Webhook** (`app/api/webhooks/stripe-connect/route.ts`): On `invoice.paid`, mark any `active` promise as `kept`.
- **Tests**: New tests for promise state machine, token lookup, breach detection logic.
- **Docs**: Update `DDD.md` (new model, new routes) and `docs/runbooks/README.md` (no new env vars needed).
