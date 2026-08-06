# Detailed Design Document — PaidSoon

> **Repository note.** The generation prompt targeted a `one-core` Django
> monorepo. **This repository is PaidSoon**, a single Next.js 16 (App Router)
> application. There are no Django apps, bounded contexts, vertical products,
> workflow engine, control library, or AI gateway. This document describes
> PaidSoon's actual implementation. Template sections without a code counterpart
> are marked **Not applicable to this repository**.

## 1. Purpose and Scope

This document describes the detailed implementation design of PaidSoon — a SaaS
app that automatically follows up on overdue invoices for freelancers. It is
derived from the current code, the OpenSpec change folders, and the operator
runbooks. It complements the high-level design in [HLD.md](HLD.md).

Scope: authentication and tenancy, the Stripe Connect invoice pipeline, the
three-stage email follow-up engine, subscription billing and entitlements,
data model, API surface, and runtime/infrastructure. Out of scope: anything not
present in the repository (it is documented as absent, not designed).

## 2. Source of Truth and Traceability

| Source | Path | Used for | Notes |
|---|---|---|---|
| Application code | `app/**`, `lib/**`, `proxy.ts` | Primary truth for all behaviour | App Router |
| Prisma schema | `prisma/schema.prisma` | Data model | User + admin models; includes arrangements |
| Initial migration | `prisma/migrations/20260531101711_init/migration.sql` | Tables, indexes, FKs | Single migration |
| RLS policies | `prisma/rls-policies.sql` | Tenant isolation | Applied manually in Supabase |
| Prisma config | `prisma.config.ts` | Two-URL migration/runtime split | `DIRECT_URL` vs `DATABASE_URL` |
| OpenSpec changes | `openspec/changes/**` | Spec intent + status | No `specs/` baseline dir |
| Runbooks | `docs/runbooks/**` | Env vars, deployment | Canonical env matrix |
| Tests | `tests/**` | Pure-logic unit tests | `node --test` + `tsx` |
| Scripts | `scripts/verify-rls.ts` | RLS verification | Proves isolation |
| Config | `package.json`, `next.config.ts`, `vercel.json`, `tsconfig.json` | Runtime/build | — |

## 3. Domain Model Overview

There is one bounded context: the freelancer's invoice-chasing domain. The table
below maps logical areas to code modules (there are no Django apps).

| Logical area | Module(s) | Purpose | Key models/services | OpenSpec |
|---|---|---|---|---|
| Auth & tenancy | `lib/supabase/**`, `lib/db/**`, `proxy.ts` | Identity, session, RLS scoping | `UserProfile`; `withUserContext`, `prismaAdmin` | `changes/invoice-nudge-mvp/specs/user-auth`, `changes/enforce-rls-via-prisma` |
| Invoice connection | `lib/providers/**`, `app/api/stripe/connect/**` | Link Stripe, abstract providers | `InvoiceConnection`; `InvoiceProvider` | `.../specs/invoice-connection` |
| Invoice tracking | `lib/email/catchup.ts`, `app/api/webhooks/stripe-connect/route.ts` | Detect/track overdue invoices | `TrackedInvoice` | `.../specs/invoice-tracking` |
| Follow-up engine | `app/api/cron/send-emails/route.ts`, `lib/email/**` | Stage progression + send | `TrackedInvoice`, `EmailLog`, `Schedule` | `.../specs/follow-up-sequences`, `.../specs/schedule-config` |
| Email identity | `app/api/settings/email/route.ts`, `lib/email/send.ts` | Custom verified sender | `EmailSettings` | `.../specs/email-settings`, `changes/rename-to-paidsoon` |
| Billing & entitlements | `app/api/billing/**`, `app/api/webhooks/stripe-billing/route.ts`, `lib/billing.ts`, `lib/subscriptionPlans.ts` | Plans, checkout, gating | `UserProfile.subscriptionTier`; `PLAN_CATALOG` | `changes/restore-three-tier-pricing`, `.../specs/subscription-plan-tiers` |
| Dashboard & upsell | `app/dashboard/**`, `components/dashboard/**`, `lib/dashboardUpsell.ts` | Views + upgrade prompts | `DashboardUpsellModel` | `changes/sample-overdue-preview-upsell`, `changes/add-dashboard-overview` |
| Live-mode gating | `lib/liveMode.ts`, `proxy.ts`, `app/layout.tsx` | Pre-launch lockout | — | `changes/live-mode-auth-gate-banner` |

## 4. Backend Application Design

There are no Django apps. The backend is route handlers + `lib` services. Each
subsection documents a functional module.

### 4.1 Auth & tenancy (`lib/db/**`, `lib/supabase/**`, `proxy.ts`)

- **Responsibility:** authenticate users, refresh sessions, enforce per-user DB
  isolation.
- **Key services:**
  - `createClient()` (`lib/supabase/server.ts`) — cookie-bound Supabase client
    for RSC/route handlers; `lib/supabase/client.ts` for the browser.
  - `withUserContext(userId, fn)` (`lib/db/withUserContext.ts`) — opens a Prisma
    `$transaction`, runs `SELECT set_config('request.jwt.claims', …, true)` and
    `SET LOCAL ROLE authenticated`, then runs `fn(tx)` so RLS applies.
  - `prismaAdmin` (`lib/db/admin.ts`) — singleton `PrismaClient` over
    `@prisma/adapter-pg` using `DATABASE_URL`; **bypasses RLS**; service paths
    only.
- **Permissions:** route handlers reject with 401 when `auth.getUser()` returns
  no user. `proxy.ts` redirects unauthenticated `/dashboard/*` to
  `/sign-in` and authenticated users away from auth pages.
- **Integration points:** Supabase Auth; Supabase Postgres.
- **Tests:** `scripts/verify-rls.ts` proves cross-user isolation (seed via
  `prismaAdmin`, read via `withUserContext`).

### 4.2 Invoice connection (`lib/providers/**`, `app/api/stripe/connect/**`)

- **Responsibility:** connect a user's Stripe account and normalise invoice data.
- **Key abstractions:** `InvoiceProvider` interface (`lib/providers/types.ts`)
  with methods `getOverdueInvoices`, `getInvoiceDetails`,
  `verifyWebhookSignature`, `parseWebhookEvent`. `getProvider(name)`
  (`lib/providers/index.ts`) resolves the registry (`stripe` only).
- **Stripe implementation:** `StripeInvoiceProvider` (`lib/providers/stripe.ts`)
  lists `status: "open"` invoices for a connected account and filters past-due;
  normalises to `NormalizedInvoice`.
- **Routes:**
  - `GET authorize` — checks connection-limit, redirects to Stripe OAuth with
    `state = user.id`.
  - `GET callback` — verifies `state == user.id`, exchanges code, enforces
    per-tier connection limit inside `withUserContext`, upserts
    `InvoiceConnection`.
  - `POST disconnect` — deactivates a connection and pauses its
    pending/snoozed invoices.
- **Integration points:** Stripe OAuth + Invoices API (per connected account via
  `{ stripeAccount }`).

### 4.3 Invoice tracking (`app/api/webhooks/stripe-connect/route.ts`, `lib/email/catchup.ts`)

- **Responsibility:** create `TrackedInvoice` rows for overdue invoices, mark
  paid.
- **Two ingestion paths:**
  1. **Webhook** (`stripe-connect`): verifies signature, handles
     `invoice.overdue` (create tracked invoice, idempotent — always created,
     never gated by allowance) and `invoice.paid` (mark paid).
  2. **Catch-up scan** (`runCatchUpScan`): cron-time poll across all active
     Stripe connections, creating missing tracked invoices.
- **Idempotency:** unique key `(externalId, provider, userId)` +
  pre-insert `findFirst` checks.
- **Chase-volume allowance is not enforced at ingest.** Every synced invoice
  (Stripe Connect, catch-up scan, and accounting sync — `lib/providers/accounting/sync.ts`)
  is created and stays visible on the dashboard regardless of the account's
  plan or remaining allowance. The allowance only governs whether follow-up
  *begins* for a given invoice — enforced once, in the cron (§4.4) — not
  whether the invoice is recorded. See the `chase-volume-entitlement` capability
  (`openspec/changes/monthly-chase-volume-limits`).

### 4.4 Follow-up engine (`app/api/cron/send-emails/route.ts`, `lib/email/**`)

- **Responsibility:** advance each tracked invoice through stages 1→3 and send.
- **Flow (cron GET):** auth via `Bearer CRON_SECRET` → `runCatchUpScan()` →
  resume snoozed invoices whose `snoozedUntil` elapsed → **detect broken promises**
  (active promises whose `promisedPayBy` has passed; mark `broken`, notify freelancer) →
  **detect expired/broken arrangements** (active arrangements whose payment/expiry date has elapsed) →
  **exclude invoices with active promises or active arrangements** from the email queue → select `pending`
  invoices with `nextEmailAt <= now` and `currentStage < 3` → compute each
  distinct account's chase-volume allowance status once for the pass
  (`getChaseAllowanceStatusesForUsers`, `lib/billing.ts`) → for each invoice,
  resolve freelancer email/name via Supabase admin; if `currentStage === 0`
  (first chase) and the account has no remaining allowance, **hold** the
  invoice (skip it, leave its state untouched, retried on a later pass) —
  otherwise `sendFollowUpEmail`, set `firstChasedAt` on a first chase, and
  advance `currentStage`/`nextEmailAt` or mark `sequence_complete` after stage
  3. A single pass decrements the in-memory allowance figure after each first
  send so it can never exceed the allowance; the response includes `held`
  (invoices skipped this pass) and `usageByAccount` (per-account
  allowance/usage/remaining/atCapacity) so the held condition is observable.
  Stage 2/3 sends for a sequence already under way are never gated.
- **Chase-volume allowance model** (`chase-volume-entitlement` capability,
  `lib/billing.ts`): one unit of allowance is consumed once per invoice, at
  its first reminder send (not derivable from `EmailLog.stage`, since tone
  escalation can promote a first send from stage 1 to stage 2 — see §4.6).
  Consumption is recorded via `TrackedInvoice.firstChasedAt` (set once, never
  cleared). Usage is measured over `resolveAllowancePeriod()`'s resolved
  window: the account's billing period
  (`UserProfile.subscriptionCurrentPeriodStart/End`) → the trial window
  (account creation → `trialEndsAt`) → the current calendar month in
  Australia/Melbourne, in that order. No overage charging exists; reaching
  the allowance pauses new first chases until the period resets.
- **Services:**
  - `sendFollowUpEmail` (`lib/email/send.ts`) — resolves from-address, renders
    template (including `{{promiseToPayLink}}`, available on every paid tier), sends via Resend,
    writes an `EmailLog`. Generates and persists `p2pToken` on first send.
  - `sendP2PNotification` (`lib/email/send.ts`) — sends freelancer notifications for
    promise received and promise broken events. Goes to the freelancer (not the client).
  - `generateP2PToken` (`lib/email/send.ts`) — 32-byte cryptographically random hex token.
  - `resolveFromAddress` — sender-identity ladder: system address + custom reply-to
    (`custom_reply_to`, all tiers) → custom sender name (`custom_sender_name`, Solo+) →
    verified custom from-domain (`verified_from_domain`, Small Business+, requires
    Resend verification).
  - `computeNextEmailAt` (`lib/email/schedule.ts`) — `dueDate + dayOffset`.
  - `renderTemplate` (`lib/email/templates.ts`) — stage 1/2/3 HTML+text.
- **Background tasks:** exactly one — this cron route. No queue/worker.

### 4.5 Email identity (`app/api/settings/email/route.ts`)

- **GET:** returns settings; if a custom `fromEmail` is set but unverified,
  polls `resend.domains.list()` and flips `resendVerified` when the sending
  domain reports `verified`.
- **PUT:** gated by `custom_reply_to` (available on every paid tier); a Resend
  domain-verification call is only triggered for tiers with `verified_from_domain`.

### 4.6 Billing & entitlements (`app/api/billing/**`, `app/api/webhooks/stripe-billing/route.ts`, `lib/billing.ts`, `lib/subscriptionPlans.ts`)

- **Plan catalog:** `PLAN_CATALOG` defines `starter`/`solo`/`small_business` (public,
  customer-selectable) and `accountant_partner` (contact-only, hidden from plan
  listings via `visibility: "contact_only"`) with `limits` (chased invoices, seats,
  connected invoice sources; `-1` = unlimited) and a `features` map. There is no
  legacy alias map — `normalizeSubscriptionTier` falls back to `starter` for any
  unrecognised value.
- **Entitlement checks:** `requireFeature(userId, feature)` reads the tier via
  `withUserContext` and consults `hasPlanFeature`. Limit helpers:
  `getInvoiceLimitForTier`, `getInvoiceSourceLimitForTier` (Stripe Connect +
  accounting connections combined, via `countActiveInvoiceSources`),
  `getUserSeatLimitForTier`. `getPublicPlans()` returns only customer-facing tiers,
  used by the pricing page, onboarding plan picker, and
  `getNextTierRecommendation` (never recommends the hidden contact-only tier).
- **Chase-volume allowance helpers** (`lib/billing.ts`, `chase-volume-entitlement`
  capability): `resolveAllowancePeriod(account, now)` resolves the current
  billing/trial/calendar-month window; `getChaseAllowanceStatus(tx, userId)`
  and the batched `getChaseAllowanceStatusesForUsers(tx, userIds)` return
  `{ period, allowance, usage, remaining, atCapacity, nearLimit }` for one or
  many accounts, accepting either a `withUserContext` tx or `prismaAdmin`.
  `usage` counts `TrackedInvoice` rows whose `firstChasedAt` falls inside the
  resolved period — **not** `EmailLog.stage`, because
  `applyToneEscalationStage` (`lib/promiseEscalationPolicy.ts`) can promote a
  debtor's first reminder from stage 1 to stage 2, so an invoice's first
  `EmailLog` row is not reliably `stage: 1`. `nearLimit` reuses
  `isNearLimit`/`DEFAULT_NEAR_LIMIT_THRESHOLD` (0.8) from
  `lib/dashboardUpsell.ts` as the single 80% threshold definition.
- **Checkout:** `POST checkout` maps requested tier → price id env var, creates
  (or reuses) a Stripe customer, returns a Checkout session URL.
- **Portal:** `POST portal` returns a Stripe billing-portal URL.
- **Webhook (`stripe-billing`):** signature-verified; handles
  `checkout.session.completed` (set tier/active, persist
  `subscriptionCurrentPeriodStart`/`End` from the Stripe invoice
  `period_start`/`period_end`), `customer.subscription.updated` (resolve tier
  from price id, persist the refreshed period start/end), `customer.subscription.deleted`
  (revert to `starter`, pause invoices over the starter limit — this is a
  separate, pre-existing concurrent-count safeguard on downgrade, distinct
  from the chase-volume allowance). **`invoice.payment_failed`
  is not handled** (proposed in `changes/handle-billing-payment-failed-webhook`).

### 4.7 Dashboard actions (`app/api/invoices/[id]/**`)

- `pause`, `resume`, `snooze` (7-day), `resolve` (`manually_resolved`). All run
  inside `withUserContext` and re-check ownership via `findFirst` with
  `userId: user.id`, returning 404 when not found/ineligible.

### 4.8 Settings (templates / AI / team)

- `settings/templates` — GET returns the saved or default template for a stage
  (gated by `basic_templates`); PUT is gated by `custom_reminder_templates` and
  persists to the `email_templates` table via `withUserContext`; DELETE resets a
  stage to the system default.
- `settings/ai` — GET reports `canRewrite`; POST accepts `{ text, stage }`,
  calls GPT-4o-mini via the Vercel AI SDK (`lib/email/ai-rewrite.ts`), and
  returns three tone variants (`friendly`, `firm`, `final_notice`). Token usage
  and estimated cost are written to `ai_usage_logs` via `prismaAdmin`
  (documented RLS bypass: token counts are only available after the call).
  **There is no standalone AI settings page** — AI controls are embedded in the
  Templates settings page (`app/dashboard/settings/templates`).
- `settings/team/invite` — GET reports seats; POST validates email and seat
  limit but **does not persist** (no membership model).

### 4.9 Not applicable

Compliance/control-library, workflow engine, CMS, vertical_setup, RTO,
integrations registry, and any `apps/api/apps/**` modules — **not present**.

## 5. Frontend Application Design

| Concern | Path(s) | Notes |
|---|---|---|
| Root layout + LIVE banner | `app/layout.tsx` | Renders not-live banner when `LIVE` is falsey |
| Landing page | `app/page.tsx` | Hero, "How it works" (templates/AI items with `*` higher-plan markers), pricing, footer |
| Auth pages | `app/(auth)/sign-in/page.tsx`, `app/(auth)/sign-up/page.tsx` | Client components; email/pw + Google OAuth; `Spinner` loading state |
| Auth callback | `app/auth/callback/route.ts` | `exchangeCodeForSession` → `/dashboard` |
| Sign out | `app/auth/sign-out/route.ts` | `signOut()` → redirect `/` |
| Trial checkout gateway | `app/billing/checkout/page.tsx` | Server component; reads `?plan` param (falls back to profile tier), POSTs to `/api/billing/checkout`, and redirects to the Stripe Checkout URL. Entry point for both the trial-expired gate and the TrialBanner "Add payment" CTA. Renders an error UI if checkout session creation fails. |
| Dashboard shell | `app/dashboard/layout.tsx` | Nav with `UserMenu` dropdown (identity + sign-out); left-side vertical tab rail (`DashboardNavRail`) for Overview/Invoices/Resolved Invoices; redirects unauthenticated to `/sign-in` |
| Dashboard Overview page | `app/dashboard/page.tsx` | Traffic-light summary cards (Overdue, Chase allowance, Broken promises, Held invoices), ungated for every tier; redirects legacy `?resolved=1` to `/dashboard/resolved` |
| Dashboard Invoices page | `app/dashboard/invoices/page.tsx` | Active-invoice table; feature-gated module + upsell; supports `?filter=` from Overview card click-throughs |
| Dashboard Resolved Invoices page | `app/dashboard/resolved/page.tsx` | Paid/manually-resolved invoice table; feature-gated module + upsell |
| Settings pages | `app/dashboard/settings/{account,schedule,email,templates,team,stripe,subscription}/page.tsx` | Each pairs with a `*Client.tsx`; AI controls are embedded in the templates page |
| Dashboard components | `components/dashboard/{InvoiceTable,LockedDashboardPreview,UpgradeBanner,OverviewCards,DashboardNavRail}.tsx` | Table + locked preview + banner + Overview cards + nav rail |
| Settings clients | `components/settings/*Client.tsx` | Client-side forms calling the settings APIs |
| Shared UI | `components/ui/Spinner.tsx` | Only shared primitive |
| API clients | (none) | Components call route handlers via `fetch`; Supabase via `@supabase/ssr` |
| Env config | `process.env.NEXT_PUBLIC_*` | Supabase URL/key, `NEXT_PUBLIC_APP_URL` |

- **Auth/session logic:** browser client (`lib/supabase/client.ts`) for sign-in;
  server client (`lib/supabase/server.ts`) for RSC/route handlers; refresh in
  `proxy.ts`.
- **Tenant context:** implicit `user.id`; no tenant switcher.
- **RBAC helpers:** none; only `hasPlanFeature`/`requireFeature` entitlement
  gates.
- **Vertical-specific pages:** none.

## 6. Database Design

User-scoped application tables are owned by a single tenant (`userId`) and are
protected by RLS. FKs reference `user_profiles.userId` (or parent rows) with
`ON DELETE RESTRICT`.

### 6.1 Tenancy / profile / connections / config

```mermaid
erDiagram
    USER_PROFILE ||--o{ INVOICE_CONNECTION : has
    USER_PROFILE ||--o| SCHEDULE : has
    USER_PROFILE ||--o| EMAIL_SETTINGS : has
    USER_PROFILE ||--o{ TRACKED_INVOICE : owns
    INVOICE_CONNECTION ||--o{ TRACKED_INVOICE : sources

    USER_PROFILE {
        string id PK
        string userId UK
        string stripeCustomerId UK
        string stripeSubscriptionId
        datetime subscriptionCurrentPeriodEnd
        string pendingDowngradeTier
        string stripeScheduleId
        string subscriptionTier
        string subscriptionStatus
        datetime trialEndsAt
        datetime onboardingCompletedAt
    }
    INVOICE_CONNECTION {
        string id PK
        string userId FK
        string provider
        string stripeConnectAccountId
        bool isActive
    }
    SCHEDULE {
        string id PK
        string userId UK
        int email1DaysAfterDue
        int email2DaysAfterDue
        int email3DaysAfterDue
    }
    EMAIL_SETTINGS {
        string id PK
        string userId UK
        string fromEmail
        string fromName
        bool resendVerified
    }
```

### 6.2 Invoice tracking / email log

```mermaid
erDiagram
    TRACKED_INVOICE ||--o{ EMAIL_LOG : logs
    TRACKED_INVOICE {
        string id PK
        string userId FK
        string invoiceConnectionId FK
        string externalId
        string provider
        string clientEmail
        int amountDue
        datetime dueDate
        string status
        int currentStage
        datetime nextEmailAt
        datetime snoozedUntil
    }
    EMAIL_LOG {
        string id PK
        string trackedInvoiceId FK
        int stage
        datetime sentAt
        string resendMessageId
        string fromAddress
        string subject
    }
    EMAIL_TEMPLATE {
        string id PK
        string userId FK
        int stage
        string subject
        string htmlBody
        string textBody
    }
    AI_USAGE_LOG {
        string id PK
        string userId FK
        string model
        string feature
        int promptTokens
        int completionTokens
        decimal estimatedCostUsd
    }
```

`USER_PROFILE ||--o{ EMAIL_TEMPLATE : has`
`USER_PROFILE ||--o{ AI_USAGE_LOG : logs`

### 6.3 Model reference

| Model | Path | Purpose | Key fields | Relationships | Tenant scoped? | Notes |
|---|---|---|---|---|---|---|
| `UserProfile` | `prisma/schema.prisma` | Per-user billing/sub state | `userId` (UK), `stripeCustomerId` (UK), `stripeSubscriptionId`, `subscriptionCurrentPeriodStart`, `subscriptionCurrentPeriodEnd`, `pendingDowngradeTier`, `stripeScheduleId`, `subscriptionTier`, `subscriptionStatus`, `trialEndsAt`, `onboardingCompletedAt`, `displayName` | 1—N connections/invoices; 1—1 schedule/email settings | Yes (RLS) | New users start with `subscriptionStatus: "trialing"` and `trialEndsAt: now + 14 days`; `onboardingCompletedAt` is null until plan is chosen on `/onboarding`; `displayName` is used as `{{yourName}}` in reminder emails; `subscriptionCurrentPeriodStart` anchors the chase-volume allowance period (§4.6) and is populated from Stripe's invoice `period_start` alongside `subscriptionCurrentPeriodEnd` |
| `InvoiceConnection` | `prisma/schema.prisma` | Linked Stripe account | `provider`, `stripeConnectAccountId`, `isActive` | N—1 profile; 1—N invoices | Yes | Comment claims app-layer encryption (not implemented) |
| `Schedule` | `prisma/schema.prisma` | Day offsets for stages | `email{1,2,3}DaysAfterDue` | 1—1 profile | Yes | Defaults 3/10/21 |
| `EmailSettings` | `prisma/schema.prisma` | Custom verified sender | `fromEmail`, `fromName`, `replyTo`, `resendVerified` | 1—1 profile | Yes | Used when tier has `custom_sender_name`/`verified_from_domain` |
| `TrackedInvoice` | `prisma/schema.prisma` | Overdue invoice being chased | `externalId`, `status`, `currentStage`, `nextEmailAt`, `snoozedUntil`, `firstChasedAt`, `p2pToken` | N—1 profile/connection; 1—N logs, 1—N promises | Yes | Unique `(externalId, provider, userId)`; `p2pToken` unique, nullable — generated on first send for every paid tier; `firstChasedAt` is null until the first reminder is sent, then set once (indexed with `userId`) — it is the sole source of chase-volume allowance usage (§4.6), independent of `status`/`currentStage` changing later |
| `EmailLog` | `prisma/schema.prisma` | Per-send record | `stage`, `resendMessageId`, `fromAddress`, `subject`, `htmlBody`, `textBody` | N—1 tracked invoice | Yes (via join policy) | Insert via service role; `htmlBody`/`textBody` (nullable) persist the exact rendered content sent, added for the dashboard's email-detail modal — `null` for rows sent before this column existed |
| `EmailTemplate` | `prisma/schema.prisma` | Per-user custom stage template | `userId`, `stage` (1–3), `subject`, `htmlBody`, `textBody` | N—1 profile | Yes | Unique `(userId, stage)`; upserted by templates PUT; deleted by templates DELETE |
| `AiUsageLog` | `prisma/schema.prisma` | AI token usage + cost record | `userId`, `model`, `feature`, `promptTokens`, `completionTokens`, `estimatedCostUsd` | N—1 profile | Yes (SELECT only; INSERT via `prismaAdmin`) | Written after each GPT-4o-mini rewrite call |
| `PromiseToPay` | `prisma/schema.prisma` | Client payment commitment history per invoice | `trackedInvoiceId`, `userId`, `promisedPayBy`, `promisedAmount`, `clientNotes`, `status`, `breachNotifiedAt` | N—1 tracked invoice | Yes (SELECT only; INSERT/UPDATE via `prismaAdmin`) | `status`: `active` → `kept` / `broken` / `superseded`; indexes on `(trackedInvoiceId, createdAt)` and `(status, promisedPayBy)` |
| `Arrangement` | `prisma/schema.prisma` | Freelancer-managed agreement for one debtor (single or multi-invoice scope) | `userId`, `debtorEmail`, `arrangementType`, `status`, `promisedPayBy`, `agreedAmount`, `planSchedule`, `expiresAt`, `breachedAt`, `fulfilledAt` | N—1 profile; 1—N coverages | Yes (RLS CRUD) | `arrangementType`: `full_payment` / `partial_payment` / `instalment_plan`; `status`: `active` → `broken` / `fulfilled` / `expired` / `cancelled` |
| `ArrangementInvoiceCoverage` | `prisma/schema.prisma` | Joins arrangements to covered invoices for suppression/resume behavior | `arrangementId`, `trackedInvoiceId`, `userId`, `debtorEmail` | N—1 arrangement; N—1 tracked invoice | Yes (RLS CRUD) | Unique `(arrangementId, trackedInvoiceId)`; tenant/debtor-safe relational constraints via composite references |
| `AccountingConnection` | `prisma/schema.prisma` | OAuth connection to Xero or MYOB | `userId`, `provider`, `organisationId`, `organisationName`, `encryptedAccessToken`, `encryptedRefreshToken`, `tokenExpiresAt`, `scopes`, `status`, `lastSyncedAt` | N—1 profile; 1—N sync runs, provider mappings | Yes (RLS) | Unique `(userId, provider, organisationId)`; tokens encrypted with AES-256-GCM via `TOKEN_ENCRYPTION_KEY` |
| `AccountingSyncRun` | `prisma/schema.prisma` | Sync run history per accounting connection | `accountingConnectionId`, `provider`, `userId`, `startedAt`, `completedAt`, `status`, `invoicesCreated`, `invoicesUpdated`, `invoicesSkipped`, `errorMessage` | N—1 connection | Yes (SELECT only; writes via `prismaAdmin` in cron) | Index on `(accountingConnectionId, startedAt)` |
| `ProviderInvoiceMapping` | `prisma/schema.prisma` | Maps provider invoice IDs to `TrackedInvoice` | `trackedInvoiceId`, `accountingConnectionId`, `providerInvoiceId`, `providerUpdatedAt`, `providerMetadata` | 1—1 tracked invoice; N—1 connection | Yes (SELECT via JOIN on tracked_invoices.userId) | Unique `(providerInvoiceId, accountingConnectionId)`; `providerUpdatedAt` drives incremental sync |
| `ProviderContactMapping` | `prisma/schema.prisma` | Maps provider customer/contact IDs for deduplication | `accountingConnectionId`, `providerContactId`, `contactName`, `contactEmail`, `providerMetadata` | N—1 connection | Yes (SELECT via JOIN on accounting_connections.userId) | Unique `(providerContactId, accountingConnectionId)`; `contactEmail` is PII |
| `OauthState` | `prisma/schema.prisma` | CSRF nonce for accounting OAuth callbacks (10-min TTL) | `userId`, `provider`, `nonce`, `expiresAt` | — | Yes (by userId; SELECT/INSERT/DELETE) | Unique `(nonce)`; expired rows cleaned up by `/api/cron/sync-accounting` |
| `PlatformRole` | `prisma/schema.prisma` | Platform staff membership | `userId`, `role` (`platform_owner`/`platform_admin`/`platform_support`), `status` (`active`/`disabled`), `grantedBy` | — | No (deny-all RLS; `prismaAdmin` only) | Max one active role per user; `grantedBy` = granting user id |
| `AdminDevice` | `prisma/schema.prisma` | Enrolled SSH Ed25519 public keys | `userId`, `name`, `publicKeyBytes`, `fingerprint` (UK), `status` (`pending`/`active`/`revoked`/`expired`) | N—1 platform role user; 1—N challenges/sessions | No (deny-all RLS) | `publicKeyBytes` = 32-byte Ed25519 raw key; `fingerprint` = `SHA256:<base64>` |
| `AdminChallenge` | `prisma/schema.prisma` | Single-use SSH signing nonce | `userId`, `adminDeviceId`, `nonce` (UK), `expiresAt`, `usedAt` | N—1 device | No (deny-all RLS) | Nonce is 32 bytes / 64 hex chars; `usedAt` marks replay prevention |
| `AdminSession` | `prisma/schema.prisma` | Elevated admin session after key verification | `userId`, `adminDeviceId`, `sessionToken` (UK), `expiresAt`, `revokedAt`, `ipAddress`, `userAgent` | N—1 device | No (deny-all RLS) | Token stored as `admin_session` cookie (HttpOnly/Secure/SameSite=Strict); `revokedAt` enables soft revocation |
| `AdminAuditEvent` | `prisma/schema.prisma` | Append-only admin action log | `actorUserId`, `action` (enum, 23 values including `admin_tenant_action`), `targetUserId`, `tenantId`, `success`, `metadata` (JSON, action-specific context), `ipAddress`, `requestId` | — | No (deny-all RLS; `prismaAdmin` only) | Never deleted; no UPDATE policy; fire-and-forget write via `logAdminEvent()` |
| `StaffInvitation` | `prisma/schema.prisma` | Pending platform staff invite | `invitedEmail`, `role`, `token` (UK), `invitedBy`, `status` (`pending`/`accepted`/`expired`/`revoked`), `expiresAt`, `acceptedBy` | — | No (deny-all RLS) | Token is 32 bytes / 64 hex chars; accepted by matching Supabase user email |

> ERDs for compliance/controls/obligations/evidence, workflow, and vertical models are **not applicable** — no such tables exist.

### 6.4 RLS design

`prisma/rls-policies.sql` enables RLS on user-scoped tables. Policies key on
`auth.uid()::text = "userId"` for SELECT/INSERT/UPDATE. `email_templates` has a
DELETE policy (users reset a stage to defaults). Other tables have no DELETE
policy (app never hard-deletes rows; FKs are `RESTRICT`). `email_logs` SELECT
and INSERT both use a join-based `EXISTS` check against `tracked_invoices`
(ownership via `userId`); the cron worker bypasses RLS entirely via `prismaAdmin`
(service role), so the tightened INSERT policy does not affect it. `ai_usage_logs`
has a SELECT policy for own rows; INSERTs are `prismaAdmin`-only (no user INSERT
policy). `arrangements` and `arrangement_invoice_coverages` have full tenant-scoped
CRUD policies.

The six **platform admin tables** (`platform_roles`, `admin_devices`,
`admin_challenges`, `admin_sessions`, `admin_audit_events`, `staff_invitations`)
all have deny-all RLS — no `anon` or `authenticated` role may SELECT, INSERT,
UPDATE, or DELETE from them. All reads and writes go through `prismaAdmin`
(service role) in admin route handlers that have first passed the three-layer
admin guard. See `prisma/rls-policies.sql`.

## 7. API Design

| Route | Handler | Validation | Permission | Tenant scoping | Request → Response | Status |
|---|---|---|---|---|---|---|
| `PATCH /api/onboarding` | `app/api/onboarding/route.ts` | `zod` `{tier}` | session | `withUserContext` profile | `{tier}` → `{ok}` | Implemented |
| `POST /api/billing/checkout` | `app/api/billing/checkout/route.ts` | `zod` `{tier?}` | session | `withUserContext` profile | `{tier}` → `{url}` | Implemented |
| `POST /api/billing/portal` | `app/api/billing/portal/route.ts` | — | session | `withUserContext` | `{}` → `{url}` | Implemented |
| `GET /api/stripe/connect/authorize` | `.../authorize/route.ts` | — | session | `withUserContext` count | → redirect to Stripe | Implemented |
| `GET /api/stripe/connect/callback` | `.../callback/route.ts` | query `code,state` | session + `state==user.id` | `withUserContext` upsert | → redirect to settings | Implemented |
| `POST /api/stripe/connect/disconnect` | `.../disconnect/route.ts` | optional `{connectionId}` | session | `withUserContext` | → `{success}` | Implemented |
| `POST /api/webhooks/stripe-billing` | `.../stripe-billing/route.ts` | Stripe signature | signature | `prismaAdmin` by `stripeCustomerId` | Stripe event → `{received}` | Implemented (no `payment_failed`) |
| `POST /api/webhooks/stripe-connect` | `.../stripe-connect/route.ts` | provider signature | signature | `prismaAdmin` by account id | Stripe event → `{received}` | Implemented |
| `GET /api/cron/send-emails` | `.../cron/send-emails/route.ts` | — | `Bearer CRON_SECRET` | `prismaAdmin` | → `{emailsSent,errors,processed,held,usageByAccount}` | Implemented |
| `GET /api/cron/scheduling-watchdog` | `.../cron/scheduling-watchdog/route.ts` | — | `Bearer CRON_SECRET` | `prismaAdmin` | → `{ok,stale,lastRunAt}` | Implemented — alerts via email if the Railway Celery Beat heartbeat is stale/missing; see [migrate-scheduled-jobs-to-railway-celery](../openspec/changes/migrate-scheduled-jobs-to-railway-celery/design.md) |
| `POST /api/internal/jobs/send-reminder` | `.../internal/jobs/send-reminder/route.ts` | `zod` `{userId,trackedInvoiceId}` | `Bearer INTERNAL_JOBS_SECRET` | `withUserContext` | → `{outcome,...}` | Implemented — called by the Railway Celery `reminder_email` task, not public |
| `POST /api/internal/jobs/sync-connection` | `.../internal/jobs/sync-connection/route.ts` | `zod` `{accountingConnectionId}` | `Bearer INTERNAL_JOBS_SECRET` | `syncConnection` (`prismaAdmin`) | → `SyncResult` | Implemented — called by the Railway Celery `accounting_sync` task, not public |
| `POST /api/internal/jobs/promise-arrangement-sweep` | `.../internal/jobs/promise-arrangement-sweep/route.ts` | — | `Bearer INTERNAL_JOBS_SECRET` | `prismaAdmin` | → `{brokenPromises,arrangementsUpdated}` | Implemented — called by the Railway Celery sweep task, not public |
| `POST /api/internal/jobs/catchup-snooze-sweep` | `.../internal/jobs/catchup-snooze-sweep/route.ts` | — | `Bearer INTERNAL_JOBS_SECRET` | `prismaAdmin` | → `{snoozedResumed}` | Implemented — called by the Railway Celery sweep task, not public |
| `POST /api/invoices/[id]/pause` | `.../pause/route.ts` | path `id` | session | `withUserContext` | → `{success}` | Implemented |
| `POST /api/invoices/[id]/resume` | `.../resume/route.ts` | path `id` | session | `withUserContext` | → `{success}` | Implemented |
| `POST /api/invoices/[id]/snooze` | `.../snooze/route.ts` | path `id` | session | `withUserContext` | → `{success,snoozedUntil}` | Implemented |
| `POST /api/invoices/[id]/cancel-snooze` | `.../cancel-snooze/route.ts` | path `id` | session | `withUserContext` | → `{success}` | Implemented — manually ends an in-progress snooze early, clearing `snoozedUntil` and returning the invoice to `pending` |
| `POST /api/invoices/[id]/resolve` | `.../resolve/route.ts` | path `id` | session | `withUserContext` | → `{success}` | Implemented |
| `POST /api/arrangements` | `app/api/arrangements/route.ts` | body `{invoiceIds[], arrangementType, promisedPayBy?, agreedAmount?, currency?, termsNotes?, planSchedule?}` | session | `withUserContext` | → `{arrangement}` | Implemented — freelancer-managed arrangement creation for single/multi-invoice scope |
| `POST /api/arrangements/[id]/status` | `app/api/arrangements/[id]/status/route.ts` | path `id`; body `{status}` | session | `withUserContext` | → `{arrangement}` | Implemented — lifecycle transitions (`active`, `broken`, `fulfilled`, `expired`, `cancelled`) |
| `GET /api/arrangements/[id]` | `app/api/arrangements/[id]/route.ts` | path `id` | session | `withUserContext` + explicit `userId` check | → `{arrangement}` (with full `coverages`, each including the covered invoice's `clientName`/`clientEmail`/`amountDue`/`currency`/`status`) | Implemented — full arrangement detail for the dashboard's arrangement-detail modal; 404 if not found or not owned by the requesting user |
| `POST /api/promise/[token]` | `.../promise/[token]/route.ts` | path `token`; body `{promisedPayBy, promisedAmount?, clientNotes?}` | none (public) | `prismaAdmin` | → `{ok}` | Implemented — client-initiated single-invoice P2P; arrangement-like payloads rejected |
| `GET/PUT /api/settings/schedule` | `.../schedule/route.ts` | `zod` ascending offsets | session + `email_reminder_sequence` | `withUserContext` upsert | → `{schedule}` / `{success}` | Implemented |
| `GET/PUT /api/settings/email` | `.../email/route.ts` | `zod` email/name | session + `custom_reply_to` (PUT) | `withUserContext` | → `{settings}` / `{success}` | Implemented |
| `PATCH /api/settings/profile` | `.../profile/route.ts` | `zod` `{displayName}` 1–100 chars | session | `withUserContext` profile update | → `{displayName}` | Implemented |
| `GET/PUT/DELETE /api/settings/templates` | `.../templates/route.ts` | `zod` subject/body | session + template features | `withUserContext` (PUT/DELETE) | → `{...template}` / `{success}` | Implemented |
| `GET/POST /api/settings/ai` | `.../ai/route.ts` | `zod` text/stage | session + `ai_rewrite` | `prismaAdmin` (`ai_usage_logs`) | → `{canRewrite}` / `{success, friendly, firm, final_notice}` | Implemented (GPT-4o-mini) |
| `POST /api/billing/downgrade` | `app/api/billing/downgrade/route.ts` | `zod` `{tier}` | session | `withUserContext` profile | `{tier}` → `{scheduledAt}` | Implemented |
| `GET /api/diagnostics/db-check` | `.../diagnostics/db-check/route.ts` | — | none (public); 404s unless `DEBUG=true` | `prismaAdmin` `SELECT 1` only | → `{ok,message,latencyMs,error?}` | Implemented — debug-only connectivity probe surfaced by a homepage button when `DEBUG=true` |
| `DELETE /api/billing/downgrade` | `app/api/billing/downgrade/route.ts` | — | session | `withUserContext` profile | → `{cancelled}` | Implemented |
| `GET/POST /api/settings/team/invite` | `.../team/invite/route.ts` | `zod` email | session | (none) | → seats / `{success}` | **Scaffold (not persisted)** || `GET /api/integrations/xero/connect` | `.../xero/connect/route.ts` | — | session + `accounting_integrations` feature | `prismaAdmin` oauth_state insert | → redirect to Xero OAuth | Implemented |
| `GET /api/integrations/xero/callback` | `.../xero/callback/route.ts` | query `code,state` | session + nonce validation | `withUserContext` upsert accounting_connections | → redirect to settings | Implemented |
| `POST /api/integrations/xero/disconnect` | `.../xero/disconnect/route.ts` | `zod` `{connectionId}` | session | `withUserContext` status update | → `{success}` | Implemented |
| `POST /api/integrations/xero/sync` | `.../xero/sync/route.ts` | `zod` `{connectionId}` | session + ownership check | `withUserContext` verify; `prismaAdmin` sync | → `SyncResult` | Implemented |
| `GET /api/integrations/myob/connect` | `.../myob/connect/route.ts` | — | session + `accounting_integrations` feature | `prismaAdmin` oauth_state insert | → redirect to MYOB OAuth | Implemented |
| `GET /api/integrations/myob/callback` | `.../myob/callback/route.ts` | query `code,state,businessId,businessName` | session + nonce validation | `withUserContext` upsert accounting_connections | → redirect to settings | Implemented |
| `POST /api/integrations/myob/disconnect` | `.../myob/disconnect/route.ts` | `zod` `{connectionId}` | session | `withUserContext` status update | → `{success}` | Implemented |
| `POST /api/integrations/myob/sync` | `.../myob/sync/route.ts` | `zod` `{connectionId}` | session + ownership check | `withUserContext` verify; `prismaAdmin` sync | → `SyncResult` | Implemented |
| `GET /api/cron/sync-accounting` | `.../cron/sync-accounting/route.ts` | — | `Bearer CRON_SECRET` | `prismaAdmin` | → `{totalConnections,succeeded,failed,invoicesCreated,invoicesUpdated}` | Implemented |
| `POST /api/admin/challenges` | `app/api/admin/challenges/route.ts` | `zod` `{deviceId}` | Layer 1+2 (Supabase session + PlatformRole) | `prismaAdmin` | → `{challengeId, nonce}` | Implemented |
| `POST /api/admin/challenges/[id]/verify` | `.../verify/route.ts` | `zod` `{signature, publicKeyFingerprint}` | Layer 1+2 | `prismaAdmin` | → sets `admin_session` cookie; `{ok}` | Implemented |
| `POST /api/admin/sessions/revoke` | `app/api/admin/sessions/revoke/route.ts` | — | All 3 layers | `prismaAdmin` | → clears `admin_session` cookie; `{ok}` | Implemented |
| `GET /api/admin/audit-events` | `app/api/admin/audit-events/route.ts` | query filters + cursor | All 3 layers | `prismaAdmin` | → `{events, nextCursor}` | Implemented |
| `GET /api/admin/devices` | `app/api/admin/devices/route.ts` | — | All 3 layers | `prismaAdmin` | → `{devices}` (no publicKeyBytes) | Implemented |
| `POST /api/admin/devices` | `app/api/admin/devices/route.ts` | `zod` `{name, publicKey}` | All 3 layers | `prismaAdmin` | → `{device}` | Implemented |
| `POST /api/admin/devices/[id]/revoke` | `.../revoke/route.ts` | path `id` | All 3 layers; `minRole: platform_admin` | `prismaAdmin` | → `{ok}` | Implemented |
| `GET /api/admin/staff` | `app/api/admin/staff/route.ts` | — | All 3 layers | `prismaAdmin` | → `{staff}` | Implemented |
| `POST /api/admin/staff/invitations` | `.../invitations/route.ts` | `zod` `{email, role}` | All 3 layers; `minRole: platform_admin` | `prismaAdmin` | → `{invitation}` | Implemented |
| `POST /api/admin/staff/invitations/accept` | `.../accept/route.ts` | `zod` `{token}` | Layer 1+2 (email must match) | `prismaAdmin` | → `{ok}` | Implemented |
| `POST /api/admin/staff/[userId]/role` | `.../role/route.ts` | `zod` `{role}` | All 3 layers; `minRole: platform_owner` | `prismaAdmin` | → `{ok}` | Implemented |
| `POST /api/admin/staff/[userId]/disable` | `.../disable/route.ts` | path `userId` | All 3 layers; `minRole: platform_owner` | `prismaAdmin` | → `{ok}` | Implemented |
| `GET /api/admin/tenants` | `app/api/admin/tenants/route.ts` | query `cursor,limit,search` | All 3 layers | `prismaAdmin` | → `{tenants, nextCursor}` (safe fields); `search` filters by `displayName` (case-insensitive) | Implemented |
| `GET /api/admin/tenants/[id]` | `.../[id]/route.ts` | path `id` | All 3 layers | `prismaAdmin` | → `{tenant}` (safe fields); logs `tenant_viewed` | Implemented |
| `POST /api/admin/tenants/[id]/actions/reset-email-from` | `.../reset-email-from/route.ts` | path `id` (userId) | All 3 layers | `prismaAdmin` | → clears `EmailSettings.fromEmail/fromName/replyTo`; logs `admin_tenant_action` with old value in metadata | Implemented |
| `POST /api/admin/tenants/[id]/actions/extend-trial` | `.../extend-trial/route.ts` | `zod` `{days: 1–30}`; path `id` (userId) | All 3 layers | `prismaAdmin` | → updates `UserProfile.trialEndsAt`; rejects if not trialing; logs `admin_tenant_action` | Implemented |
| `POST /api/admin/tenants/[id]/actions/trigger-resync` | `.../trigger-resync/route.ts` | `zod` `{connectionId}`; path `id` (userId) | All 3 layers | `prismaAdmin` | → invokes `syncConnection`; verifies connection belongs to tenant; logs `admin_tenant_action` | Implemented |
| `GET /api/admin/users` | `app/api/admin/users/route.ts` | query `search,cursor,limit` | All 3 layers | `prismaAdmin` | → `{users, nextCursor}` | Implemented (route retained; UI redirects to /admin/tenants) |
| `GET /api/admin/subscriptions` | `app/api/admin/subscriptions/route.ts` | — | All 3 layers | `prismaAdmin` | → `{tiers}` (counts, no Stripe IDs) | Implemented |
| `GET /api/admin/integrations` | `app/api/admin/integrations/route.ts` | — | All 3 layers | `prismaAdmin` | → `{byProvider}` (no tokens) | Implemented |
| `GET /api/admin/email-jobs` | `app/api/admin/email-jobs/route.ts` | query `cursor,limit` | All 3 layers | `prismaAdmin` | → `{jobs}` (no clientEmail) | Implemented |
| `POST /api/admin/impersonation/start` | `.../start/route.ts` | `zod` `{tenantId}` | All 3 layers; cannot impersonate other admin | `prismaAdmin` | → updates `AdminSession.impersonatedTenantId`; `{ok}` | Implemented |
| `POST /api/admin/impersonation/end` | `.../end/route.ts` | — | All 3 layers | `prismaAdmin` | → clears `impersonatedTenantId`; `{ok}` | Implemented |
Canonical vs deprecated: there are no deprecated API aliases. The only
backward-compat artifact is `STRIPE_PRO_PRICE_ID` accepted as a `solo` fallback.

## 8. Authentication, Authorization and Tenancy

- **Auth provider:** Supabase Auth (email/password + Google OAuth). Browser
  sign-in uses `supabase.auth.signInWithPassword` / `signInWithOAuth`
  (`app/(auth)/sign-in/page.tsx`). OAuth returns to `app/auth/callback/route.ts`
  which calls `exchangeCodeForSession`.
- **Session model:** Supabase session cookies bridged by `@supabase/ssr`.
  `proxy.ts` calls `supabase.auth.getUser()` to refresh and to guard
  `/dashboard/*`.
- **Backend auth:** every user-facing route handler calls
  `supabase.auth.getUser()` and returns 401 when absent. Webhooks use Stripe
  signatures; cron uses `CRON_SECRET`.
- **Authorization model:** **plan-tier entitlements only** — there are no roles,
  no org/workspace/tenant role hierarchy, no impersonation. `requireFeature`
  and limit helpers in `lib/billing.ts` are the entire authorization surface.
- **Tenant resolution:** the authenticated `user.id` → `withUserContext` sets
  `request.jwt.claims.sub` and `SET LOCAL ROLE authenticated`, so
  `auth.uid()` resolves to that user and RLS scopes every query in the
  transaction.
- **Cross-tenant enforcement:** Postgres RLS policies; `scripts/verify-rls.ts`
  proves user A cannot read user B's rows even with the `where` clause omitted.

### 8.1 Platform admin authentication

The `/admin` route group adds a **three-layer elevated-privilege guard** on top of normal Supabase auth:

| Layer | Mechanism | Where enforced |
|---|---|---|
| 1 | Supabase session — same as `/dashboard` | `proxy.ts` |
| 2 | `PlatformRole` row in `platform_roles` with `status = active` | `lib/admin/guard.ts` |
| 3 | `AdminSession` row linked to a verified `AdminDevice` (Ed25519 SSH public key challenge-response) | `lib/admin/guard.ts` + `app/api/admin/challenges/` |

**Challenge-response flow** (browser → server; private key never leaves the device):

1. Browser POSTs `deviceId` to `/api/admin/challenges` → server stores a 32-byte nonce and returns `{challengeId, nonce}`.
2. Operator runs: `echo "<nonce>" | ssh-keygen -Y sign -f ~/.ssh/id_ed25519 -n paidsoon-admin-auth` and pastes the armoured signature.
3. Browser POSTs signature to `/api/admin/challenges/[id]/verify` → server verifies the Ed25519 signature with the stored public key bytes, marks the challenge used, creates an `AdminSession`, and sets the `admin_session` cookie (`HttpOnly`, `Secure`, `SameSite=Strict`).

**Key observation:** the server stores only the 32-byte Ed25519 *public* key. The *private* key never leaves the operator's machine. For production, a hardware-backed key (YubiKey resident key, macOS Secure Enclave key via `ssh-keygen -t ecdsa-sk`) is strongly recommended because a software private key file can be exfiltrated if the machine is compromised.

**Role hierarchy:** `platform_support < platform_admin < platform_owner`

- `platform_support` — read-only tenant/subscription/email-job views
- `platform_admin` — all of the above + device revocation + staff invitations
- `platform_owner` — all of the above + role changes + disable staff

All six admin DB tables have deny-all RLS. Every admin route handler calls `requireAdminElevation()` (all 3 layers) or `requirePlatformRole()` (layers 1+2, for the `/admin/verify` challenge page). Session signing-out revokes the `AdminSession` row and clears the cookie.

```mermaid
sequenceDiagram
    participant U as Browser
    participant MW as proxy.ts
    participant RH as Route handler
    participant WC as withUserContext
    participant PG as Postgres (RLS)

    U->>MW: GET /dashboard (session cookie)
    MW->>MW: supabase.auth.getUser()
    alt no user
        MW-->>U: 302 /sign-in
    else authenticated
        MW-->>RH: forward request
        RH->>RH: supabase.auth.getUser() → user.id
        RH->>WC: withUserContext(user.id, fn)
        WC->>PG: BEGIN; set_config(jwt.claims); SET LOCAL ROLE authenticated
        WC->>PG: SELECT ... (RLS scoped to auth.uid())
        PG-->>WC: only this user's rows
        WC-->>RH: result
        RH-->>U: rendered page / JSON
    end
```

## 9. Compliance and Evidence Design

**Not applicable to this repository.** PaidSoon is not a compliance product.
There are no standards, obligations, controls, control templates, evidence
items, evaluation events, or compliance exports. The closest analogue to an
"evidence trail" is the `email_logs` table recording each reminder sent.

## 10. Workflow Engine Design

**No general workflow engine exists.** The only stateful "workflow" is the
three-stage email follow-up sequence implemented procedurally in
`app/api/cron/send-emails/route.ts`. There are no workflow definitions,
versions, instances, nodes, tasks, approvals, decision nodes, or SLA handling.

State transitions of a `TrackedInvoice`:

```mermaid
stateDiagram-v2
    [*] --> pending: detected overdue (webhook/catch-up)
    pending --> pending: stage 1→2→3 sent (currentStage++)
    pending --> sequence_complete: stage 3 sent
    pending --> snoozed: user snooze (7d)
    snoozed --> pending: snoozedUntil elapsed (cron)
    pending --> paused: connection disconnected / over tier limit on downgrade
    paused --> pending: user resume
    pending --> paid: invoice.paid webhook
    pending --> manually_resolved: user resolve
    sequence_complete --> paid: invoice.paid webhook
```

- **Notification hook:** sending an email writes an `EmailLog` and advances
  `currentStage`/`nextEmailAt`.
- **Background worker:** the single daily cron route; no queue.

## 11. Billing and Entitlements Design

- **Plans** (`lib/subscriptionPlans.ts`), prices inclusive of GST:

| Tier | Visibility | Price/mo | Chased invoices/period | Seats | Connected invoice sources |
|---|---|---|---|---|---|
| `starter` | public | A$9 | 10 | 1 | 1 |
| `solo` | public (marked "Most Popular") | A$19 | 50 | 1 | 1 |
| `small_business` | public | A$39 | 200 | 3 (usable seats not yet implemented) | 1 |
| `accountant_partner` | contact-only (hidden from pricing page & upgrade recommendations) | Contact us | Unlimited | Unlimited | Unlimited |

  Feature matrix (✓ = enabled, — = disabled, ◷ = enabled in the catalog but not yet
  implemented in the product — presentation code must render these as "Coming soon",
  see `UNIMPLEMENTED_FEATURES`/`isFeatureImplemented()`):

| Feature (`SubscriptionFeature`) | Starter | Solo | Small Business | Accountant Partner |
|---|---|---|---|---|
| `basic_email_reminders` | ✓ | ✓ | ✓ | ✓ |
| `email_reminder_sequence` (custom timing) | — | ✓ | ✓ | ✓ |
| `customer_specific_sequences` ◷ | — | — | ◷ | ◷ |
| `basic_templates` | ✓ | ✓ | ✓ | ✓ |
| `custom_reminder_templates` | — | ✓ | ✓ | ✓ |
| `multi_template_customer_wording` ◷ | — | — | ◷ | ◷ |
| `paid_soon_branding` | ✓ | ✓ | ✓ | ✓ |
| `custom_reply_to` | ✓ | ✓ | ✓ | ✓ |
| `custom_sender_name` | — | ✓ | ✓ | ✓ |
| `verified_from_domain` | — | — | ✓ | ✓ |
| `ai_rewrite` | — | ✓ | ✓ | ✓ |
| `tone_settings` | — | ✓ | ✓ | ✓ |
| `payment_status_dashboard` | ✓ | ✓ | ✓ | ✓ |
| `overdue_invoice_dashboard` | ✓ | ✓ | ✓ | ✓ |
| `accounting_integrations` | ✓ | ✓ | ✓ | ✓ |
| `promise_to_pay_tracking` | ✓ | ✓ | ✓ | ✓ |
| `dispute_pause` | ✓ | ✓ | ✓ | ✓ |
| `weekly_summary_email` | — | — | ✓ | ✓ |
| `csv_export` ◷ | — | — | ◷ | ◷ |
| `approval_mode` ◷ | — | — | ◷ | ◷ |
| `contact_suppression` ◷ | — | — | ◷ | ◷ |
| `team_seats` ◷ | — | — | ◷ | ◷ |
| `multi_client_management` ◷ | — | — | — | ◷ |

- **Features** are a `Record<SubscriptionFeature, boolean>` per plan; checked via
  `hasPlanFeature`/`requireFeature`. Core follow-up capabilities (sync, the
  Friendly/Firm/Final progression, auto-stop on payment, promise-to-pay, dispute
  pause, the debtor dashboard, accounting integrations) are enabled on every paid
  tier — MYOB's own reminder features are not a substitute for PaidSoon's workflow,
  so these are not used as upsell levers.
- **No legacy alias map:** `normalizeSubscriptionTier` returns `starter` for any
  value not in `{starter, solo, small_business, accountant_partner}`. Previous
  generations of tier naming (`free`/`pro`/`business`) are not aliased — a stray
  legacy value surfaces as a visibly wrong plan rather than resolving silently.
- **Accountant Partner checkout:** `accountant_partner` has `monthlyPriceAud: null` (contact-us
  pricing); the Stripe Checkout route returns an error for this tier. Provisioning is manual.
  It is `visibility: "contact_only"` — `getPublicPlans()` excludes it from the pricing page,
  the onboarding plan picker, and `getNextTierRecommendation`.
- **Unlimited limits:** `accountant_partner` has `-1` for all limits in `PlanLimits`; the
  `getInvoiceLimitForTier` / `getInvoiceSourceLimitForTier` / `getUserSeatLimitForTier`
  helpers in `lib/billing.ts` normalise -1 to `Number.MAX_SAFE_INTEGER` for comparisons.
  `getInvoiceSourceLimitForTier` covers Stripe Connect accounts and accounting
  connections combined (`countActiveInvoiceSources`), replacing the earlier
  Stripe-only connection limit.
- **Checkout → activation:** `POST /api/billing/checkout` → Stripe Checkout →
  `checkout.session.completed` webhook sets `subscriptionTier` (from
  `selectedTier` metadata) and `subscriptionStatus = active`.
- **Updates/cancellation:** `customer.subscription.updated` resolves tier from
  the price id (`PRICE_ID_TO_TIER`); `customer.subscription.deleted` reverts to
  `starter`, sets `cancelled`, and pauses invoices exceeding the starter limit.
- **Price IDs:** the webhook's `PRICE_ID_TO_TIER` map has exactly three entries —
  `STRIPE_STARTER_PRICE_ID→starter`, `STRIPE_SOLO_PRICE_ID→solo`,
  `STRIPE_SMALL_BUSINESS_PRICE_ID→small_business`. `STRIPE_BUSINESS_PRICE_ID` and
  `STRIPE_PRO_PRICE_ID` have been retired (see `changes/restore-three-tier-pricing`).
- **Portal:** `POST /api/billing/portal` → Stripe billing portal.
- **Trial/free handling:** `trialing` is treated as active; there is no separate
  free plan — `starter` is the paid entry tier (schema's `subscriptionTier` default
  is `"starter"`).
- **GST:** all three prices are inclusive of GST. The corresponding Stripe Price
  objects must carry `tax_behavior: "inclusive"` — this attribute is immutable
  once set, so it must be confirmed before pricing/checkout changes, not after.
- **Not implemented:** `invoice.payment_failed` → `past_due`
  (`changes/handle-billing-payment-failed-webhook`); add-ons; usage events;
  monthly chased-invoice allowance enforcement semantics (counting, warning,
  pausing) — see `changes/monthly-chase-volume-limits`.

## 12. AI Rewrite Design

`app/api/settings/ai/route.ts` gates on the `ai_rewrite` plan feature
(`solo` tier and above).

**GET** returns `{ canRewrite: boolean }`.

**POST** accepts `{ text, stage: 1|2|3 }` and calls GPT-4o-mini via the Vercel
AI SDK (`lib/email/ai-rewrite.ts`). The model produces three tone variants —
`friendly`, `firm`, and `final_notice` — each with a rewritten `subject` and
`message`. A stage-specific prompt prefix guides tone (stage 1 = friendly;
stage 2 = professional + urgent; stage 3 = direct + firm deadline). After a
successful call, token counts and estimated cost (USD) are written to
`ai_usage_logs` via `prismaAdmin` (documented RLS bypass: token counts are only
available after the call completes, outside any user-context transaction).

**UI integration:** the AI Rewrite button lives in the Templates settings page
(`app/dashboard/settings/templates`). The standalone `/dashboard/settings/ai`
page was removed as part of `changes/ai-message-rewrite`.

**No AI gateway abstraction** — one hardcoded `gpt-4o-mini` model call via
`@ai-sdk/openai`. No allowed-model registry, no budget enforcement, no
RAG/vector store, no LLM fallback.

## 13. Notifications and Messaging Design

- **Provider:** Resend (`lib/email/send.ts`).
- **No notification model** — emails are the only notification channel; there is
  no in-app notification table or user notification preferences (beyond the
  custom-sender `EmailSettings`).
- **Delivery path:** cron → `sendFollowUpEmail` → `resend.emails.send` →
  `EmailLog` insert. From-address resolved by tier + Resend verification.
- **Retry/error handling:** send failures are caught, logged via
  `console.error`, counted as `errors` in the cron response, and `null` is
  returned (no `EmailLog` written, stage not advanced). There is **no automatic
  retry/backoff** — the next daily cron re-attempts because the stage did not
  advance.
- **Webhooks:** inbound Stripe webhooks (not outbound notifications).

## 14. Integrations Design

- **No integration registry/model.** Integrations are hardcoded providers:
  - **Stripe Connect** — read invoices (`lib/providers/stripe.ts`).
  - **Stripe Billing** — subscriptions/portal (`app/api/billing/**`).
  - **Resend** — email + domain verification.
  - **Supabase** — auth + DB.
  - **Xero** — pull-based accounting invoice sync via OAuth 2.0 (`lib/providers/accounting/xero.ts`). Available on every paid tier (`accounting_integrations`).
  - **MYOB Business** — pull-based accounting invoice sync via OAuth 2.0 (`lib/providers/accounting/myob.ts`). Available on every paid tier (`accounting_integrations`).

### Accounting Provider Architecture

All accounting integrations implement the `AccountingProvider` interface (`lib/providers/accounting/types.ts`). This is separate from the `InvoiceProvider` interface (which is event/webhook-driven for Stripe Connect).

```
AccountingProvider (interface)
├── XeroProvider       — lib/providers/accounting/xero.ts
└── MyobProvider       — lib/providers/accounting/myob.ts
```

The factory function `getAccountingProvider(providerName)` from `lib/providers/accounting/index.ts` returns the correct implementation.

**Token encryption:** OAuth access/refresh tokens are encrypted at rest using AES-256-GCM via `lib/providers/accounting/crypto.ts`. The `TOKEN_ENCRYPTION_KEY` environment variable (64-char hex = 32 bytes) is required.

**Sync model:** Pull-based polling (no webhooks). A Vercel Cron job (`GET /api/cron/sync-accounting`) at 02:00 UTC calls `syncAllActiveConnections()`. Users can also trigger manual syncs.

**Incremental sync:** On subsequent syncs, `modifiedAfter = connection.lastSyncedAt` is passed to the provider. Xero uses the `If-Modified-Since` HTTP header; MYOB uses the `$filter=LastModified gt datetime'...'` OData query parameter.

**Invoice import flow:**
1. Provider invoice fetched → normalised to `ProviderInvoice` type
2. `TrackedInvoice` upserted (unique on `externalId + provider + userId`)
3. `ProviderInvoiceMapping` and `ProviderContactMapping` rows upserted
4. When provider status transitions to `paid`/`voided` → `nextEmailAt` cleared (reminder cancelled)
5. `AccountingSyncRun` row written with counts and any error

**CSRF protection:** OAuth connect flows use a nonce stored in `oauth_states` (10-min TTL). Expired nonces are cleaned up by the sync cron job.

- **Connectivity probes:** none, except the implicit Resend domain-status poll in
  the email settings GET.
- **Error handling:** webhook signature failures → 400; provider list/retrieve
  failures are caught and skipped; `AccountingProviderError({ kind: 'unauthorized' })` marks connection as `revoked`.

## 15. Reporting, Audit and Export Design

- **Audit model:** none. `email_logs` is the only persistent event record.
- **Reporting views:** the dashboard's "resolved" view (`?resolved=1`) is the
  only reporting surface, gated by `payment_status_dashboard`.
- **Export pipeline / evidence export / retention:** none implemented or
  specified.

## 16. Vertical Product Design

**Not applicable to this repository.** PaidSoon is a single product with a single
brand (`app/layout.tsx`, `changes/rename-to-paidsoon`). There is no shared core
vs vertical-module split, no per-hostname/domain separation, no vertical
setup/admin, and no ISOComply/RTOComply/StrataComply/NDISComply code or seed
data. The legacy brand "Invoice Nudge" / `invoicenudge.com` is being retired in
favour of "PaidSoon" / `paidsoon.com`.

## 17. Infrastructure Runtime Design

| Concern | Design | Evidence |
|---|---|---|
| Local dev | `npm install` → `vercel env pull .env.local` → `npm run dev` | `README.md` |
| Build | `prisma generate && next build` | `package.json` |
| API/web runtime | Single Next.js 16 app on Vercel | `docs/runbooks/vercel.md` |
| Worker runtime | Cron routes on the same Vercel deployment today; a Railway Celery worker + Celery Beat + Redis is being introduced to take over scheduled business workflows (dispatcher claims due work from Postgres, enqueues one task per item onto Redis, tasks call back into `app/api/internal/jobs/*` for the actual business logic) — see [migrate-scheduled-jobs-to-railway-celery](../openspec/changes/migrate-scheduled-jobs-to-railway-celery/design.md). Not yet deployed; runs in parallel with the existing Vercel Cron jobs during burn-in before the old jobs are removed. | `worker/`, `openspec/changes/migrate-scheduled-jobs-to-railway-celery/` |
| Scheduler | Vercel Cron `0 9 * * *` → `/api/cron/send-emails`; `0 2 * * *` → `/api/cron/sync-accounting`; `0 12 * * *` → `/api/cron/scheduling-watchdog` (Hobby plan caps cron frequency at once daily) | `vercel.json`, `docs/runbooks/vercel.md` |
| Database | Supabase Postgres; runtime via the shared pooler as `postgres.[ref]`, RLS applied per-transaction by `withUserContext`. Two internal orchestration tables (`scheduled_task_claims`, `dispatcher_heartbeats`) have RLS enabled with no policies — written only by the Railway worker's trusted DB role. | `prisma.config.ts`, `lib/db/admin.ts`, `prisma/schema.prisma` |
| Migrations | `prisma migrate` via `DIRECT_URL` (owner) | `prisma.config.ts` |
| RLS bootstrap | `prisma/rls-policies.sql` applied manually in Supabase | `prisma/rls-policies.sql`, `docs/runbooks/supabase.md` |
| Object storage / Redis | Redis is being introduced as the Celery broker/queue for the Railway worker (transient state only, never a source of truth) | `worker/.env.example` |
| Email | Resend | `docs/runbooks/resend.md` |
| Secrets / env | Vercel env + `.env.local`; canonical matrix | `docs/runbooks/README.md` |
| CI workflows | **None** (`.github/` has only `prompts/` + `skills/`, no `workflows/`) | (file tree) |
| Deploy workflows | Vercel Git integration (no repo workflow files) | `docs/runbooks/vercel.md` |
| Docker Compose | **None** | — |

> **Explicitly not present:** AWS App Runner, RDS Multi-AZ, SES, Cognito,
> Terraform, Docker, Redis. The system runs entirely on Vercel + Supabase +
> Stripe + Resend.

### Environment variables (consumed in code)

The exhaustive, code-checked list lives in `docs/runbooks/README.md`
("Where each var is consumed in code"). Key ones:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`, `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_APP_URL`,
`LIVE`, `CRON_SECRET`, `STRIPE_SECRET_KEY`,
`STRIPE_{STARTER,SOLO,SMALL_BUSINESS}_PRICE_ID`,
`STRIPE_CONNECT_CLIENT_ID`, `STRIPE_BILLING_WEBHOOK_SECRET`,
`STRIPE_CONNECT_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`RESEND_FROM_NAME`.

## 18. Testing Strategy

| Layer | Tooling | Coverage | Status |
|---|---|---|---|
| Unit (pure logic) | `node --test` + `tsx` (`npm test`) | `tests/live-mode.test.ts`, `tests/subscription-plans.test.ts`, `tests/dashboard-upsell.test.ts` | Implemented |
| RLS isolation | `scripts/verify-rls.ts` (`npm run verify-rls`) | Cross-user isolation proof | Implemented |
| Type checks | `tsc` via `next build` | Whole app | Implemented |
| Lint | `eslint` (`npm run lint`, `eslint-config-next`) | Whole app | Implemented |
| CI gates | **None** — no `.github/workflows` | — | **Gap** |
| Integration / E2E | None in repo (manual E2E checklist in `changes/go-live-runbook`) | — | **Gap** |
| Performance/Locust | None | — | N/A |
| OpenSpec validation | OpenSpec CLI exists conceptually (`openspec/config.yaml`); no CI hook | — | Gap |

**Coverage gaps:** route handlers, webhooks, and the cron engine have no
automated tests; only pure helpers are unit-tested.

## 19. Security and Privacy Detailed Design

- **Tenant isolation:** RLS via `withUserContext` (§8); verified by script.
- **Service-role escalation:** `prismaAdmin` bypasses RLS; restricted by
  convention to cron, webhooks, and post-signup bootstrap
  (`lib/actions/auth.ts`); imports are grep-able by design.
- **Data access controls:** RLS policies on all eight tables; `email_templates`
  has a DELETE policy (users reset a stage to defaults); other tables have no
  DELETE policy (FKs `RESTRICT`).
- **Storage access controls:** N/A (no object storage).
- **Encryption:** delegated to managed platforms. **Gap:**
  `stripeConnectAccountId` is documented as app-encrypted but stored in plaintext
  (`app/api/stripe/connect/callback/route.ts`).
- **Secrets:** environment variables only; no secrets manager.
- **Webhook/cron auth:** Stripe signatures; `CRON_SECRET` bearer.
- **OAuth CSRF:** Stripe Connect `state == user.id` check.
- **AI governance:** `ai_usage_logs` records model name, feature, token counts,
  and estimated cost per call; gated to `solo` tier and above via
  `requireFeature`.
- **PII handling:** client name/email and invoice amounts are stored; **no
  documented retention, minimisation, or deletion** policy. RLS prevents
  cross-tenant exposure.
- **Admin access / impersonation:** none in app; operators use external
  consoles.
- **Rate limiting / abuse protection:** **none in code** — gap.

## 20. Operational Runbooks and Support

| Area | Where | Notes |
|---|---|---|
| Runbooks | `docs/runbooks/{README,supabase,stripe,resend,vercel}.md` | README holds the canonical env matrix + execution order |
| Health checks | None | No `/health` route |
| Local startup | `README.md` quick reference | `vercel env pull` then `npm run dev` |
| Migration process | `prisma migrate` via `DIRECT_URL`; RLS SQL applied manually | `prisma.config.ts`, `docs/runbooks/supabase.md` |
| Backup/restore | Supabase managed (not documented in repo) | Assumed |
| Cron testing | Manual `curl` with `CRON_SECRET` (prod-only schedule) | `docs/runbooks/vercel.md` |
| Go-live | Ordered operator checklist | `changes/go-live-runbook/proposal.md` |
| Support/helpdesk | None integrated | Gap |
| Incident response | Not documented | Gap |

## 21. Implementation Status Matrix

| Capability | Implemented in code? | OpenSpec status | Key code paths | Key spec paths | Notes |
|---|---|---|---|---|---|
| User auth | Yes | Specified | `app/(auth)/**`, `lib/supabase/**` | `changes/invoice-nudge-mvp/specs/user-auth` | Email/pw + Google |
| RLS tenant isolation | Yes | Specified | `lib/db/withUserContext.ts`, `prisma/rls-policies.sql` | `changes/enforce-rls-via-prisma` | Verified by script |
| Invoice connection | Yes | Specified | `app/api/stripe/connect/**`, `lib/providers/**` | `.../invoice-connection` | Stripe only |
| Invoice tracking | Yes | Specified | `lib/email/catchup.ts`, `.../webhooks/stripe-connect` | `.../invoice-tracking` | Webhook + catch-up |
| Follow-up sequences | Yes | Specified | `app/api/cron/send-emails/route.ts`, `lib/email/**` | `.../follow-up-sequences` | 3 stages |
| Schedule config | Yes | Specified | `app/api/settings/schedule/route.ts` | `.../schedule-config` | Ascending offsets |
| Email settings | Yes | Specified | `app/api/settings/email/route.ts` | `.../email-settings` | Resend verify poll |
| Manual actions | Yes | Specified | `app/api/invoices/[id]/**` | `.../dashboard` | pause/resume/snooze/resolve |
| Dashboard + upsell | Yes | Specified | `app/dashboard/{page,invoices/page,resolved/page}.tsx`, `lib/dashboardUpsell.ts` | `changes/sample-overdue-preview-upsell`, `changes/add-dashboard-overview` | Gated modules; Overview ungated |
| Billing tiers | Yes | Specified | `lib/subscriptionPlans.ts`, `app/api/billing/**` | `changes/restore-three-tier-pricing` | 3 public tiers + 1 hidden contact-only tier |
| Live-mode gating | Yes | Specified | `lib/liveMode.ts`, `proxy.ts` | `changes/live-mode-auth-gate-banner` | `LIVE` flag |
| Login spinner | Yes | Specified | `components/ui/Spinner.tsx`, `app/(auth)/**` | `changes/login-loading-spinner` | — |
| Logout redirect | Yes | Specified | `app/auth/sign-out/route.ts` | `changes/logout-redirect-homepage` | → `/` |
| Rename to PaidSoon | Yes | Specified | `app/layout.tsx`, `lib/email/send.ts` | `changes/rename-to-paidsoon` | Brand flip |
| How-it-works gating | Yes | Specified | `app/page.tsx` | `changes/expand-how-it-works-with-plan-gated-features` | Tasks all checked |
| Environment runbooks | Yes (docs) | Specified | `docs/runbooks/**` | `changes/build-environment-runbooks` | Replaces old SETUP/GO-LIVE |
| Basic templates | Yes | Specified | `app/api/settings/templates/route.ts` | `changes/ai-message-rewrite`, `changes/templates-sidebar-help` | GET/PUT/DELETE; persists to `email_templates`; sidebar with variable chips |
| Custom templates | Yes | Specified | `app/api/settings/templates/route.ts` | `changes/ai-message-rewrite` | Persisted via `withUserContext`; gated to `business`+ |
| AI rewrite | Yes | Specified | `app/api/settings/ai/route.ts`, `lib/email/ai-rewrite.ts` | `changes/ai-message-rewrite` | GPT-4o-mini; usage logged; UI embedded in templates page |
| Subscription plan switching | Yes | Specified | `app/api/billing/{checkout,downgrade}/route.ts` | `changes/subscription-plan-switching` | Upgrade mid-cycle; deferred downgrade via Stripe Schedule |
| Team seats / invites | Partially implemented | Not specified | `app/api/settings/team/invite/route.ts` | — | No persistence |
| `invoice.payment_failed` | No | Proposed | (`app/api/webhooks/stripe-billing/route.ts`) | `changes/handle-billing-payment-failed-webhook` | Not in code |
| Env-var drift CI check | No | Proposed | (`scripts/check-runbook-envvars.ts`) | `changes/ci-runbook-envvar-drift-check` | No CI at all |
| Go-live execution | N/A (ops) | Proposed (ops runbook) | — | `changes/go-live-runbook` | Operator actions |
| Organisations/RBAC/workflow/compliance/AI gateway/verticals | No | Not specified | — | — | Not this product |

## 22. Known Gaps and Follow-Up Work

**Documentation gaps**
- No `docs/adr/**`; architectural decisions live informally in OpenSpec
  `design.md` files.
- Backup/restore, incident response, and DR are undocumented.

**OpenSpec gaps**
- No `openspec/specs/**` baseline — specs only exist inside change folders and
  are never archived, so "current spec" is hard to read.
- Templates, AI rewrite, and team seats are implemented (as scaffolds) without
  any OpenSpec coverage.

**Code gaps**
- `invoice.payment_failed` handler missing (proposed).
- Team invites are a non-functional scaffold (no membership model or persistence).
- Cron `send-emails` loops sequentially over all due invoices with no
  pagination/batching — a scaling risk.

**Test gaps**
- No tests for route handlers, webhooks, or the cron engine.
- No CI pipeline to run `lint`/`test`/`build`/`verify-rls` automatically.

**Security gaps**
- `stripeConnectAccountId` plaintext despite "encrypted at app layer" comment.
- No rate limiting / abuse protection.
- No PII retention/deletion policy.

**Operational gaps**
- No health-check endpoint.
- No structured logging/observability.
- No support/helpdesk integration.

## 23. Appendix A — Code Path Index

**Auth & tenancy**
- `lib/supabase/server.ts`, `lib/supabase/client.ts`, `proxy.ts`
- `lib/db/withUserContext.ts`, `lib/db/admin.ts`, `lib/actions/auth.ts`
- `app/(auth)/sign-in/page.tsx`, `app/(auth)/sign-up/page.tsx`,
  `app/auth/callback/route.ts`, `app/auth/sign-out/route.ts`

**Invoice pipeline**
- `lib/providers/types.ts`, `lib/providers/stripe.ts`, `lib/providers/index.ts`
- `app/api/stripe/connect/{authorize,callback,disconnect}/route.ts`
- `app/api/webhooks/stripe-connect/route.ts`, `lib/email/catchup.ts`

**Follow-up engine**
- `app/api/cron/send-emails/route.ts`
- `lib/email/{send,schedule,templates}.ts`
- `app/api/invoices/[id]/{pause,resume,snooze,resolve}/route.ts`

**Billing & entitlements**
- `lib/subscriptionPlans.ts`, `lib/billing.ts`
- `app/api/billing/{checkout,portal}/route.ts`
- `app/api/webhooks/stripe-billing/route.ts`

**Dashboard & settings**
- `app/dashboard/{layout,page}.tsx`, `app/dashboard/{invoices,resolved}/page.tsx`,
  `app/dashboard/settings/**`
- `components/dashboard/**`, `components/settings/**`,
  `lib/dashboardUpsell.ts`, `lib/dashboard/**`

**Platform/config**
- `app/layout.tsx`, `lib/liveMode.ts`
- `prisma/schema.prisma`, `prisma/rls-policies.sql`, `prisma.config.ts`
- `vercel.json`, `next.config.ts`, `scripts/verify-rls.ts`

## 24. Appendix B — OpenSpec Index

**Implemented changes (code confirms):** `invoice-nudge-mvp`,
`enforce-rls-via-prisma`, `update-subscription-plan-tiers`, `rename-to-paidsoon`,
`live-mode-auth-gate-banner`, `login-loading-spinner`, `logout-redirect-homepage`,
`sample-overdue-preview-upsell`, `build-environment-runbooks`,
`expand-how-it-works-with-plan-gated-features`, `signup-trial-onboarding`,
`email-settings-field-hints`, `templates-sidebar-help`, `ai-message-rewrite`,
`subscription-plan-switching`.

**Proposed / not implemented:** `handle-billing-payment-failed-webhook`
(no `invoice.payment_failed` case in code), `ci-runbook-envvar-drift-check`
(no script, no CI).

**Operator runbook (no code):** `go-live-runbook`.

Delta specs live under `openspec/changes/<change>/specs/<capability>/spec.md`.
There is no `openspec/specs/**` baseline directory.

## 25. Appendix C — Glossary

| Term | Meaning |
|---|---|
| Tenant | A single user, keyed by Supabase `auth.users.id`; the isolation boundary |
| RLS | Postgres Row Level Security |
| `withUserContext` | RLS-enforcing Prisma transaction wrapper (`lib/db/withUserContext.ts`) |
| `prismaAdmin` | RLS-bypassing Prisma client for service paths (`lib/db/admin.ts`) |
| Tracked invoice | `TrackedInvoice` row for an overdue invoice being chased |
| Stage | Reminder step 1 (friendly) → 2 (firm) → 3 (final) |
| Catch-up scan | Cron-time Stripe poll for newly overdue invoices (`lib/email/catchup.ts`) |
| Connection | Linked Stripe Connect account (`InvoiceConnection`) |
| Tier / plan | Subscription level gating features and limits |
| Entitlement | A boolean plan feature checked via `requireFeature`/`hasPlanFeature` |
| `LIVE` | Env flag gating auth entry pre-launch (`lib/liveMode.ts`) |
| Provider | Invoice-source adapter implementing `InvoiceProvider` |
