## Why

Freelancers lose thousands of dollars annually not because clients refuse to pay, but because they dread the awkwardness of following up. This "Polite Procrastination" is a chronic, emotional problem — not an accounting one. Existing invoicing tools (Stripe, QuickBooks, FreshBooks) track what's owed but leave the human to do the uncomfortable work of chasing payment. Invoice Nudge automates the follow-up sequence entirely, acting as a neutral "system" the freelancer can hide behind — turning an emotionally loaded task into a background process.

## What Changes

This is a greenfield Next.js SaaS application with no existing codebase. All capabilities are new.

- **New**: Supabase Auth for freelancer accounts (email/password + Google OAuth)
- **New**: Stripe Connect OAuth for reading freelancer invoices from their Stripe account
- **New**: Stripe Billing for platform subscriptions (Free / Pro at $19/month)
- **New**: Automated 3-stage email follow-up sequences via Resend
- **New**: Vercel Cron job for daily email dispatch
- **New**: Dashboard to view overdue invoices, sequence status, and take manual actions (pause, snooze, mark resolved)
- **New**: User-configurable follow-up schedule (default: Day +3, +10, +21 after due date)
- **New**: Pro tier: verified custom from-address via Resend (freelancer verifies their email)
- **New**: Provider abstraction layer supporting additional invoice sources in the future (Stripe first)
- **New**: Free tier limited to 3 simultaneously tracked invoices; Pro is unlimited

## Capabilities

### New Capabilities

- `user-auth`: Freelancer account creation, sign-in, session management via Supabase Auth
- `invoice-connection`: Connecting a freelancer's invoice source via OAuth; provider-agnostic adapter layer; Stripe Connect implementation
- `invoice-tracking`: Detecting overdue invoices, storing tracked invoice state, detecting payment events to stop sequences
- `follow-up-sequences`: Pre-written 3-stage escalating email templates (Friendly → Professional → Firm); sequence state machine; daily cron dispatch via Vercel Cron + Resend
- `schedule-config`: Per-account configurable follow-up timing with sensible defaults (Day +3, +10, +21); Pro-only custom schedule
- `email-settings`: Free tier sends from system domain; Pro tier allows freelancer to verify their own from-address via Resend
- `subscription-billing`: Stripe Billing integration for Free/Pro tiers; tier enforcement across invoice tracking limits and email settings
- `dashboard`: Overdue invoice list with sequence status; manual actions (pause, snooze, mark resolved); upgrade prompts for free tier users at limit

### Modified Capabilities

## Impact

- **New codebase**: Next.js App Router (TypeScript), Tailwind CSS, shadcn/ui
- **External services**: Supabase (auth + Postgres), Stripe (Connect + Billing), Resend (email), Vercel (hosting + cron)
- **Database**: Supabase Postgres with Prisma ORM; schema designed for multi-tenant isolation with Row Level Security
- **Stripe Connect**: Requires Stripe Connect application approval before production launch
- **Resend**: Custom domain verification (`invoicenudge.com`) required for system-domain emails; per-user email verification for Pro from-address
