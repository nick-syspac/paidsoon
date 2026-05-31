## Context

Invoice Nudge is a greenfield multi-tenant SaaS application for freelancers. There is no existing codebase. The product is a "Bad Cop as a Service" — it automates escalating payment follow-up sequences so freelancers never have to personally chase overdue invoices.

The core data flow is: invoice source (Stripe Connect) → overdue detection (webhooks + cron) → sequence state machine → email dispatch (Resend) → payment detected → sequence stops.

The system must be multi-tenant from day one: every database query must be scoped to the authenticated user's data, and tenant isolation must be enforced at the database level (not just application level). This is critical because the system stores client emails and invoice amounts belonging to real freelancer businesses.

Constraints:
- Hosted on Vercel (serverless, no persistent processes)
- Must support additional invoice providers in the future beyond Stripe
- Free tier enforces a 3 active invoice limit; Pro is unlimited
- Stripe Connect requires platform approval — this is the primary external dependency risk

## Goals / Non-Goals

**Goals:**
- Deliver a working Next.js SaaS on Vercel with auth, billing, Stripe Connect, and automated email sequences
- Enforce tenant isolation at the DB level via Supabase Row Level Security
- Build the invoice provider layer as an abstraction (adapter pattern) to support future providers
- Ship with a clean, honest free-to-Pro upgrade path
- Make the sequence logic clearly understandable and easily modifiable (pre-written templates, not user-generated)

**Non-Goals:**
- In-app messaging or client communication portal
- Custom email template builder
- Partial payment tracking
- Support for non-Stripe invoice providers at launch
- Annual billing at launch (monthly only)
- Mobile app

## Decisions

### D1: Full Supabase (Auth + Postgres) over Clerk + Neon

**Decision:** Use Supabase for both authentication and the Postgres database.

**Rationale:** The application handles sensitive multi-tenant data (client emails, invoice amounts). Supabase Row Level Security (RLS) enforces tenant isolation at the database layer, making it impossible for a misconfigured query to leak data across users. Using a single platform for auth + DB also simplifies token-to-user resolution in RLS policies. The developer has prior Supabase experience, reducing ramp-up time.

**Alternative considered:** Clerk (auth) + Neon (DB). Neon has better serverless cold-start characteristics, but RLS integration requires manual JWT verification middleware at the application layer — more surface area for security mistakes. Supabase's native RLS + JWT integration is the safer default for this use case.

**Note:** Prisma + Supabase requires using the pgBouncer pooler `DATABASE_URL` for serverless environments. The direct URL is used for migrations only.

**Implementation note (see change `enforce-rls-via-prisma`):** Making the RLS guarantee actually hold under Prisma required wiring per-request `set_config('request.jwt.claims', ...)` and `SET LOCAL ROLE authenticated` inside a transaction, and splitting the runtime DB client (`withUserContext`) from a clearly-named service client (`prismaAdmin`) used only by cron, webhooks, and the post-signup bootstrap. The connection role configured in `DATABASE_URL` must not have `BYPASSRLS`.

---

### D2: Provider Abstraction Layer for Invoice Sources

**Decision:** Wrap all invoice source interactions behind a provider interface rather than calling Stripe APIs directly from application logic.

**Rationale:** The proposal explicitly calls for future support of QuickBooks, FreshBooks, and other invoice tools. If Stripe is called directly throughout the codebase, adding a second provider becomes a refactor. The adapter pattern costs ~2 hours now and avoids a painful migration later.

**Interface:**
```
InvoiceProvider {
  getOverdueInvoices(connectionId): Invoice[]
  getInvoiceDetails(connectionId, externalId): Invoice
  verifyWebhookSignature(payload, headers): boolean
  parseWebhookEvent(payload): WebhookEvent
}
```

Implementations: `StripeInvoiceProvider` (MVP). Future: `QuickBooksProvider`, `FreshBooksProvider`.

The `InvoiceConnection` table stores `provider: 'stripe'` and encrypted credentials (Stripe Connect account ID). Application logic selects the correct provider adapter at runtime.

---

### D3: Vercel Cron for Email Dispatch (not pure webhook-driven)

**Decision:** Use a daily Vercel Cron job to check for pending email sends, rather than scheduling individual jobs per invoice.

**Rationale:** Vercel does not support persistent workers or job queues natively. A per-invoice scheduled job would require an external queue (Inngest, Upstash QStash, etc.), adding a dependency and cost. A daily cron that queries `TrackedInvoice WHERE nextEmailAt <= NOW() AND status = 'pending'` achieves the same result with zero extra infrastructure. The trade-off is that emails go out once per day (at cron time) rather than at the exact scheduled minute — acceptable for this use case.

**Alternative considered:** Inngest or Upstash QStash for per-invoice scheduling. More precise, but adds a paid dependency and significant complexity for an MVP. Can be adopted later if precision matters.

---

### D4: Resend for All Email (Free tier + Pro tier)

**Decision:** Use Resend for all outbound email. Free tier sends from the system domain (`billing@invoicenudge.com`). Pro tier allows the freelancer to verify their own email address (Resend sender verification) and use it as the `From` address.

**Rationale:** Resend supports custom `From` addresses once an email is verified, without requiring full domain DNS setup. This is the minimal-friction path to "emails appear to come from the freelancer." Full domain verification (DNS records) is a future Pro+ feature — too much friction for MVP.

**Free tier:** `From: Invoice Nudge <billing@invoicenudge.com>`, `Reply-To: freelancer@email.com`
**Pro tier:** `From: Freelancer Name <freelancer@theirdomain.com>` (after email verification in Resend)

---

### D5: Sequence State Machine per TrackedInvoice

**Decision:** Model the follow-up sequence as a simple state machine stored on `TrackedInvoice`.

```
State: pending (stage 0)
  → [cron: nextEmailAt reached] → send email 1 → stage 1, set nextEmailAt
State: pending (stage 1)
  → [cron: nextEmailAt reached] → send email 2 → stage 2, set nextEmailAt
State: pending (stage 2)
  → [cron: nextEmailAt reached] → send email 3 → stage 3 (sequence_complete)
State: pending (stage 3)
  → sequence_complete, no more sends
State: paid
  → terminal, sequence stopped
State: paused
  → no sends until resumed
State: snoozed (snoozedUntil: date)
  → no sends until snoozedUntil, then resume as pending
State: manually_resolved
  → terminal
```

`nextEmailAt` is computed as: `invoice.dueDate + user.schedule.emailNDaysAfterDue`.

---

### D6: Two Stripe Integrations (Billing + Connect)

**Decision:** The platform has two separate Stripe relationships: Stripe Billing (charging users for the subscription) and Stripe Connect (reading their invoices).

These are completely independent:
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — platform billing
- Stripe Connect OAuth flow → stored `stripeConnectAccountId` per user

Stripe Connect webhooks are received at `/api/webhooks/stripe-connect` and use the connected account's webhook signature. Platform billing webhooks are at `/api/webhooks/stripe-billing`.

---

### D7: Database Schema — Key Tables

```
users (managed by Supabase Auth)
  + profileId → user_profiles (app-level data)

user_profiles
  id, userId (FK → auth.users)
  stripeCustomerId         -- your billing relationship
  subscriptionTier         -- 'free' | 'pro'
  subscriptionStatus

invoice_connections
  id, userId
  provider                 -- 'stripe' (extensibility hook)
  stripeConnectAccountId   -- encrypted
  isActive

schedules
  id, userId
  email1DaysAfterDue       -- default: 3
  email2DaysAfterDue       -- default: 10
  email3DaysAfterDue       -- default: 21

email_settings
  id, userId
  fromEmail                -- null = use system domain
  fromName
  replyTo
  resendVerified           -- bool: verified in Resend

tracked_invoices
  id, userId, invoiceConnectionId
  externalId               -- Stripe invoice ID
  provider                 -- 'stripe'
  clientEmail, clientName
  amountDue, currency
  dueDate
  status                   -- 'pending' | 'paid' | 'paused' | 'snoozed' | 'sequence_complete' | 'manually_resolved'
  currentStage             -- 0, 1, 2, 3
  nextEmailAt
  snoozedUntil             -- nullable

email_logs
  id, trackedInvoiceId
  stage, sentAt
  resendMessageId
  fromAddress
  subject
```

RLS policies: all tables enforce `userId = auth.uid()` — no cross-tenant data access possible.

---

## Risks / Trade-offs

**[Risk] Stripe Connect platform approval can take days to weeks**
→ Mitigation: Apply for Stripe Connect immediately (day one of the project). Use Stripe's test mode with a simulated connected account during development. Do not block development on approval.

**[Risk] Resend email verification is per-address — if a Pro user has multiple sending addresses, they must verify each one**
→ Mitigation: MVP supports one verified from-address per account. Multiple addresses are a future feature.

**[Risk] Daily cron timing — emails go out at cron time, not the exact scheduled minute**
→ Mitigation: This is acceptable for payment follow-ups. Users set days-after-due, not specific times. Document this behavior in the UI ("follow-ups go out daily around 9am UTC").

**[Risk] Supabase + Prisma connection pooling on Vercel serverless can exhaust connections under load**
→ Mitigation: Use pgBouncer pooler URL for `DATABASE_URL`. Set `connection_limit=1` in Prisma datasource for serverless. Monitor connection count on Supabase dashboard.

**[Risk] Invoice detected as overdue via webhook may arrive with delay or be missed**
→ Mitigation: Daily cron also performs a "catch-up scan" — it queries the Stripe API for overdue invoices that aren't yet in `tracked_invoices`, not just processing already-tracked ones. Belt + suspenders.

**[Risk] User cancels Pro subscription while having >3 tracked invoices**
→ Mitigation: On `customer.subscription.deleted` webhook, mark active invoices over the free limit as `paused` (not deleted). User sees them in the dashboard with a clear upgrade prompt.

## Open Questions

- What timezone should the cron job target? (Default: 9am UTC — to confirm)
- Should snoozed invoices show a distinct visual state in the dashboard vs. paused?
- Should the platform send a notification email to the freelancer when a sequence completes (all 3 emails sent, still unpaid)?
