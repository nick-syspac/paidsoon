## 1. Project Scaffolding

- [x] 1.1 Create Next.js App Router project with TypeScript (`npx create-next-app@latest`)
- [x] 1.2 Install and configure Tailwind CSS and shadcn/ui
- [x] 1.3 Install dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `prisma`, `@prisma/client`, `stripe`, `resend`, `zod`
- [x] 1.4 Set up environment variable schema (`.env.local`, `.env.example`) for all secrets
- [ ] 1.5 Configure Vercel project and link to GitHub repository
- [ ] 1.6 Create Supabase project and note connection strings (direct + pgBouncer pooler URLs)

## 2. Database Schema

- [x] 2.1 Initialize Prisma with Supabase Postgres (use pgBouncer URL for `DATABASE_URL`, direct URL for migrations)
- [x] 2.2 Define `user_profiles` model (userId, stripeCustomerId, subscriptionTier, subscriptionStatus)
- [x] 2.3 Define `invoice_connections` model (userId, provider, stripeConnectAccountId, isActive)
- [x] 2.4 Define `schedules` model (userId, email1DaysAfterDue, email2DaysAfterDue, email3DaysAfterDue)
- [x] 2.5 Define `email_settings` model (userId, fromEmail, fromName, replyTo, resendVerified)
- [x] 2.6 Define `tracked_invoices` model (userId, invoiceConnectionId, externalId, provider, clientEmail, clientName, amountDue, currency, dueDate, status, currentStage, nextEmailAt, snoozedUntil)
- [x] 2.7 Define `email_logs` model (trackedInvoiceId, stage, sentAt, resendMessageId, fromAddress, subject)
- [ ] 2.8 Run initial migration and verify schema in Supabase
- [x] 2.9 Write and apply Row Level Security policies for all tables (`userId = auth.uid()`)

## 3. Authentication

- [ ] 3.1 Configure Supabase Auth in project (enable email/password and Google OAuth providers)
- [x] 3.2 Create Supabase SSR client helpers for Next.js App Router (server client, browser client, middleware)
- [x] 3.3 Build sign-up page (`/sign-up`) with email/password form and Google OAuth button
- [x] 3.4 Build sign-in page (`/sign-in`) with email/password form and Google OAuth button
- [x] 3.5 Implement auth callback route (`/auth/callback`) for OAuth and magic link handling
- [x] 3.6 Add Next.js middleware to protect all `/dashboard/**` routes (redirect to `/sign-in` if unauthenticated)
- [x] 3.7 Add sign-out button/action in dashboard layout
- [x] 3.8 Create `user_profiles` record on new user sign-up (via Supabase `auth.users` trigger or post-signup server action)
- [x] 3.9 Create default `schedules` record on new user sign-up

## 4. Invoice Provider Abstraction

- [x] 4.1 Define `InvoiceProvider` TypeScript interface (`getOverdueInvoices`, `getInvoiceDetails`, `verifyWebhookSignature`, `parseWebhookEvent`)
- [x] 4.2 Implement `StripeInvoiceProvider` class satisfying the `InvoiceProvider` interface
- [x] 4.3 Create `getProvider(connection: InvoiceConnection): InvoiceProvider` factory function that selects the correct adapter by `provider` field

## 5. Stripe Connect Integration

- [ ] 5.1 Apply for Stripe Connect platform access in Stripe dashboard (do this on day 1)
- [x] 5.2 Build "Connect Stripe" OAuth initiation route (`/api/stripe/connect/authorize`) that redirects to Stripe OAuth
- [x] 5.3 Build Stripe Connect OAuth callback route (`/api/stripe/connect/callback`) that exchanges code for access token and saves `invoice_connections` record
- [x] 5.4 Display Stripe connection status on dashboard/settings; show "Connect Stripe" button if not connected
- [x] 5.5 Implement disconnect Stripe action (mark connection `isActive: false`, pause pending invoices)

## 6. Stripe Billing (Subscriptions)

- [ ] 6.1 Create Stripe product and $19/month price in Stripe dashboard
- [x] 6.2 Build upgrade-to-Pro endpoint (`/api/billing/checkout`) that creates a Stripe Checkout session and redirects user
- [x] 6.3 Build billing portal endpoint (`/api/billing/portal`) that creates a Stripe Customer Portal session for subscription management
- [x] 6.4 Create webhook endpoint `/api/webhooks/stripe-billing` with signature verification
- [x] 6.5 Handle `checkout.session.completed`: create Stripe customer, update `subscriptionTier: 'pro'` and `subscriptionStatus`
- [x] 6.6 Handle `customer.subscription.updated`: sync `subscriptionTier` and `subscriptionStatus`
- [x] 6.7 Handle `customer.subscription.deleted`: revert `subscriptionTier: 'free'`, pause invoices over the 3-invoice free limit
- [x] 6.8 Add tier-enforcement middleware/helper (`requirePro(userId)`) used by Pro-only API routes

## 7. Invoice Tracking

- [x] 7.1 Create webhook endpoint `/api/webhooks/stripe-connect` with per-connected-account signature verification
- [x] 7.2 Handle `invoice.payment_overdue` webhook: create `tracked_invoices` record if not already exists; enforce free tier 3-invoice limit
- [x] 7.3 Handle `invoice.paid` webhook: set `status: 'paid'` on matching `tracked_invoices` record
- [x] 7.4 Build catch-up scan function: query Stripe for overdue invoices per connected account and create missing `tracked_invoices` records
- [x] 7.5 Implement manual "Mark as resolved" API action (`POST /api/invoices/[id]/resolve`)
- [x] 7.6 Implement "Pause" API action (`POST /api/invoices/[id]/pause`)
- [x] 7.7 Implement "Resume" API action (`POST /api/invoices/[id]/resume`)
- [x] 7.8 Implement "Snooze 7 days" API action (`POST /api/invoices/[id]/snooze`)
- [x] 7.9 Implement snooze-expiry handler in the cron job (set `status: 'pending'` for snoozed invoices where `snoozedUntil <= now`)

## 8. Follow-up Sequence & Cron Job

- [x] 8.1 Write the three email template functions (Stage 1 Friendly, Stage 2 Professional, Stage 3 Firm) with placeholder interpolation
- [x] 8.2 Build `resolveFromAddress(userId)` helper: returns system domain for Free tier, verified custom address for Pro (or fallback to system if unverified)
- [x] 8.3 Build `sendFollowUpEmail(trackedInvoice, stage)` function: selects template, resolves from-address, calls Resend, logs to `email_logs`
- [x] 8.4 Build `computeNextEmailAt(dueDate, stage, schedule)` helper function
- [x] 8.5 Build main cron handler: query all actionable invoices, dispatch emails, update `currentStage` and `nextEmailAt`, set `sequence_complete` after stage 3
- [x] 8.6 Configure Vercel Cron job in `vercel.json` to call `/api/cron/send-emails` daily at 09:00 UTC
- [x] 8.7 Secure the cron endpoint with `CRON_SECRET` header verification (Vercel provides this automatically for Vercel Cron)
- [x] 8.8 Run the catch-up scan function as part of the cron job (before email dispatch)

## 9. Email Settings (Pro)

- [x] 9.1 Build email settings API (`GET /api/settings/email`, `PUT /api/settings/email`) with Pro-tier enforcement
- [x] 9.2 Implement from-address verification: call Resend to add sender, store `resendVerified: false`
- [ ] 9.3 Build a webhook or polling mechanism to detect when Resend sender verification completes and set `resendVerified: true`
- [x] 9.4 Implement "replace from-address" logic: reset `resendVerified: false` and trigger new verification when address changes

## 10. Schedule Settings (Pro)

- [x] 10.1 Build schedule settings API (`GET /api/settings/schedule`, `PUT /api/settings/schedule`) with validation (`email1 < email2 < email3`, all > 0) and Pro-tier enforcement on writes
- [x] 10.2 Schedule updates do NOT recalculate `nextEmailAt` on existing tracked invoices (verified by API logic)

## 11. Dashboard UI

- [x] 11.1 Build dashboard layout with navigation (Dashboard, Settings, Account/Sign out)
- [x] 11.2 Build main invoice list table: invoice number, client name, amount, days overdue, sequence stage badge, next email date
- [x] 11.3 Add action buttons per invoice row: Pause/Resume, Snooze 7 days, Mark as resolved (with confirmation modal)
- [x] 11.4 Build expandable email history panel per invoice (shows `email_logs` for that invoice)
- [x] 11.5 Build "untracked invoices" upgrade banner for Free users at limit (show count + total $ value)
- [x] 11.6 Build resolved invoices view (filterable/toggleable from main list)
- [x] 11.7 Build Settings page with tabs: Stripe Connection, Schedule, Email, Subscription
- [x] 11.8 Build Schedule settings tab (read-only on Free with upgrade prompt, editable on Pro)
- [x] 11.9 Build Email settings tab (system domain info on Free with upgrade prompt; from-address form + verification status on Pro)
- [x] 11.10 Build Subscription tab with current tier display, "Upgrade to Pro" button (Free) or "Manage subscription" link (Pro)
- [x] 11.11 Build Stripe connection tab showing connection status, "Connect Stripe" / "Disconnect" actions

## 12. Landing Page

- [x] 12.1 Build marketing landing page (`/`) with product value proposition, pricing section (Free vs Pro $19/mo), and sign-up CTA
- [x] 12.2 Add "How it works" section explaining the 3-stage sequence

## 13. Production Readiness

- [ ] 13.1 Set all production environment variables in Vercel dashboard
- [ ] 13.2 Configure Supabase production project (separate from dev) and run migrations
- [ ] 13.3 Verify Stripe Connect production mode (ensure platform approval is complete)
- [ ] 13.4 Register Resend sending domain (`invoicenudge.com`) and complete DNS verification
- [ ] 13.5 Register Stripe billing webhooks (`/api/webhooks/stripe-billing`) and Connect webhooks (`/api/webhooks/stripe-connect`) in production Stripe dashboard
- [ ] 13.6 End-to-end test: connect Stripe, detect overdue invoice, receive 3 emails across the sequence, detect payment, sequence stops
- [ ] 13.7 Verify RLS policies in production: confirm cross-user data isolation
