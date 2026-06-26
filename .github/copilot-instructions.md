# PaidSoon — GitHub Copilot Instructions

## What PaidSoon Does

PaidSoon is a micro-SaaS product that helps freelancers and small businesses improve cash
flow by automating invoice follow-ups. It connects to Stripe (via Stripe Connect OAuth),
reads overdue invoices, and sends a three-stage sequence of reminder emails on behalf of the
user. Users can pause, snooze, resume, or manually resolve invoices. Subscription tiers
(Starter / Solo / Small Business) gate features and usage limits.

---

## Confirmed Architecture

| Concern          | Technology                                    |
|------------------|-----------------------------------------------|
| Framework        | Next.js 16.2.6 — App Router                   |
| Language         | TypeScript 5 (strict)                         |
| Styling          | Tailwind CSS 4 + PostCSS                      |
| Database ORM     | Prisma 7.8.0 with `@prisma/adapter-pg`        |
| Database         | Supabase Postgres                             |
| Auth             | Supabase Auth via `@supabase/ssr@0.10.3`      |
| Email            | Resend (`resend@6.12.3`)                      |
| Billing          | Stripe (`stripe@22.1.1`, API `2026-05-27.dahlia`) |
| Invoice source   | Stripe Connect OAuth                          |
| Hosting          | Vercel (with Vercel Cron)                     |
| Validation       | Zod 4                                         |
| Testing          | Node built-in `test` module + `tsx` loader    |
| Linting          | ESLint 9 + `eslint-config-next`               |
| Package manager  | npm                                           |

---

## Source-of-Truth Hierarchy

1. `prisma/schema.prisma` — canonical data model
2. `prisma/rls-policies.sql` — canonical RLS rules
3. `prisma/migrations/` — historical schema state
4. `lib/subscriptionPlans.ts` — canonical plan catalog
5. `docs/DDD.md` and `docs/HLD.md` — architecture narrative
6. `docs/runbooks/README.md` — canonical environment variable matrix
7. Route handler files in `app/api/` — API contracts
8. This file and files under `.github/instructions/`

---

## Coding Standards

- TypeScript strict mode is required (`tsconfig.json`).
- All `import` paths use the `@/` alias (maps to repo root).
- Never use `any` unless absolutely unavoidable; prefer `unknown` and narrow.
- Prefer `async/await` over promise chains.
- Use Zod for all external input validation at route boundaries.
- Keep components in `components/`, business logic in `lib/`, routes in `app/api/`.
- No default `prisma` export. Use `withUserContext` or `prismaAdmin` explicitly.
- Prefer small, composable files over monoliths.
- Format: Prettier defaults (no config file present — do not add one unless asked).

---

## Next.js Conventions

- App Router only. No `pages/` directory.
- Route files: `route.ts` (API), `page.tsx` (UI), `layout.tsx` (layout).
- Server Components are the default. Add `"use client"` only when required (interactivity, hooks, browser APIs).
- Use `cookies()` from `next/headers` in server components/routes (already done via `lib/supabase/server.ts`).
- API routes export named HTTP method handlers: `export async function GET(...)`, `export async function POST(...)`.
- `serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"]` is set in `next.config.ts`.
- Never import `withUserContext` or `prismaAdmin` in a `"use client"` component.
- Loading states: use Suspense or `loading.tsx` files. The `Spinner` component is at `components/ui/Spinner.tsx`.
- Error boundaries: use `error.tsx` files.

---

## Supabase Conventions

- Browser client: `createClient()` from `lib/supabase/client.ts` — uses `NEXT_PUBLIC_*` keys.
- Server client: `createClient()` from `lib/supabase/server.ts` — uses cookies; never call in `"use client"` components.
- Auth state: use `supabase.auth.getUser()` (not `getSession()`) for server-side user identity.
- Never pass Supabase credentials to Prisma. Prisma uses its own `DATABASE_URL` / `DIRECT_URL`.
- `DIRECT_URL` is for Prisma migrations only. Never use it in application code.

---

## Auth and Session Rules

- All `/dashboard` routes require an authenticated user. Middleware enforces this redirect.
- After sign-out, users are redirected to `/` (homepage), not `/sign-in`.
- The pre-launch gate (`LIVE` env var) disables sign-in and sign-up pages. See `lib/liveMode.ts`.
- OAuth callback is at `/auth/callback/route.ts` — it exchanges the code for a session and redirects to `/dashboard`.
- On first sign-in, `lib/actions/auth.ts` bootstraps a `UserProfile` + `Schedule` record via `prismaAdmin`.
- Never expose user IDs in client-side URLs or response bodies unless absolutely necessary.

---

## RLS Rules

**Critical:** All user-facing database operations MUST use `withUserContext(userId, async (tx) => { ... })` from `lib/db/withUserContext.ts`. This sets `auth.uid()` inside the transaction so RLS policies apply correctly.

**`prismaAdmin`** (from `lib/db/admin.ts`) bypasses RLS. Only use it in:
- The cron job (`app/api/cron/send-emails/route.ts`)
- Stripe webhook handlers (`app/api/webhooks/`)
- Post-signup profile bootstrap (`lib/actions/auth.ts`)

Never use `prismaAdmin` in user-facing route handlers or server components. If you do, document the explicit reason with a comment.

Proof of RLS isolation is in `scripts/verify-rls.ts`. Run `npm run verify-rls` after any schema or policy change.

---

## Database Migration Rules

- Never edit `prisma/migrations/` files directly.
- Schema changes go into `prisma/schema.prisma` first.
- Run `npx prisma migrate dev --name <name>` locally to generate a new migration.
- Run `npx prisma migrate deploy` in CI/CD (not `migrate dev` in production).
- After any schema change, update `prisma/rls-policies.sql` with matching RLS policies.
- Always test RLS isolation after a migration: `npm run verify-rls`.
- The `DIRECT_URL` (non-pooled) must be set for Prisma migrations. `DATABASE_URL` (pooler) is for runtime queries.

---

## Email Sending Rules

- Email is sent via Resend. The `RESEND_API_KEY` environment variable is required.
- All sending goes through `lib/email/send.ts` → `sendFollowUpEmail()`.
- Never call `resend.emails.send()` directly from a route handler or component. Always go through `sendFollowUpEmail`.
- Custom "From" addresses require: Solo+ tier AND `EmailSettings.resendVerified = true` for that user.
- If neither is true, fall back to the system domain from `RESEND_FROM_EMAIL`.
- Never send real emails from tests. Use mock or stub the Resend client in tests.
- Every sent email is logged to the `email_logs` table via `prismaAdmin` (cron context).
- Avoid duplicate sends: check `EmailLog` for `(trackedInvoiceId, stage)` before sending.

---

## Invoice and Customer Data Rules

- Invoice data is strictly per-user. `withUserContext` + RLS enforces this at DB level.
- Never query `tracked_invoices` or `email_logs` without `withUserContext` (in user-facing code).
- `amountDue` is always stored in **cents** (integer). Format for display using `Intl.NumberFormat`.
- `externalId` + `provider` + `userId` form the idempotency key on `TrackedInvoice`.
- Never return raw DB rows to the client. Map to a safe response shape.
- `clientEmail` in `TrackedInvoice` is personally identifiable data — do not log it to stdout/stderr.

---

## Billing and Subscription Rules

- Three tiers: `starter` (A$9/mo), `solo` (A$19/mo), `small_business` (A$39/mo).
- Legacy tier names: `free` → `starter`, `pro` → `solo`. Supported via backward-compat mapping in `lib/subscriptionPlans.ts`.
- All feature checks use `hasPlanFeature(tier, feature)` or `requireFeature(userId, feature)` from `lib/billing.ts`.
- Stripe Price IDs are stored in env vars: `STRIPE_STARTER_PRICE_ID`, `STRIPE_SOLO_PRICE_ID`, `STRIPE_SMALL_BUSINESS_PRICE_ID`.
- Stripe API version is `"2026-05-27.dahlia"` — do not change this.
- Billing webhooks (`/api/webhooks/stripe-billing`) MUST verify `STRIPE_BILLING_WEBHOOK_SECRET`.
- Connect webhooks (`/api/webhooks/stripe-connect`) MUST verify `STRIPE_CONNECT_WEBHOOK_SECRET`.
- Never add, change, or remove plan features without updating `lib/subscriptionPlans.ts`.
- Never downgrade a user's subscription without an explicit event from Stripe (webhook).

---

## Vercel Deployment Rules

- The cron job `/api/cron/send-emails` runs daily at `0 9 * * *` (09:00 UTC) via `vercel.json`.
- Cron requests are authenticated with `Authorization: Bearer CRON_SECRET`. Never skip this check.
- All environment variables are documented in `docs/runbooks/README.md` with per-environment values.
- `LIVE=true` must be set in Vercel production to enable sign-in/sign-up.
- Never use `DIRECT_URL` as `DATABASE_URL` in production — it bypasses the connection pooler.
- Build command: `prisma generate && next build`. Do not remove `prisma generate`.

---

## Testing Expectations

- Test runner: `node --import tsx --test tests/**/*.test.ts` (`npm run test`).
- Tests live in `tests/` and use Node's built-in `assert` and `test` APIs.
- No test framework (Jest/Vitest) is installed. Do not add one without explicit discussion.
- Tests must not hit a real database, Resend API, or Stripe API.
- Tests must not send real emails.
- After new business logic is added, add a corresponding test in `tests/`.
- RLS integration test: `scripts/verify-rls.ts` (`npm run verify-rls`) — requires a live DB.

---

## Documentation Expectations

- All new env vars must be added to `docs/runbooks/README.md` (env matrix section).
- All schema changes must be reflected in `docs/DDD.md` (database model section).
- All new API routes must be listed in `docs/DDD.md` (API routes section).
- All new features must be documented as implemented (not planned) only after they are merged.
- Architecture decisions must be recorded in `docs/` with an ADR prefix or inline in DDD.md.

---

## Security Rules

- Never hardcode secrets, keys, tokens, or connection strings.
- Never commit `.env`, `.env.local`, `.env.production`, or any file with real credentials.
- Never expose `DIRECT_URL`, `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, or `RESEND_API_KEY` to the browser.
- All webhook endpoints must verify their respective signatures before processing.
- Validate all user input at route boundaries with Zod schemas.
- Sanitize all values before inserting into email templates.
- Never trust `userId` from request bodies. Always derive it from `supabase.auth.getUser()`.
- Never bypass RLS without an explicit, documented reason in the code.
- Rate limiting on auth and API routes is expected at the Vercel edge level.
- Report security issues privately. Do not commit fixes that expose the vulnerability surface.

---

## Scaffolded Features (Not Fully Implemented)

The following features have route/component scaffolding but are **not** fully functional:

- **AI rewrite / tone settings** — routes return placeholder strings
- **Custom email templates** — routes exist, data is not persisted
- **Team seats / invites** — invite route exists, non-persistent

Do not present these as implemented. When building on them, clearly document the gap between the scaffold and working functionality.

---

## Never Do These Things

- Never bypass Supabase RLS without explicit justification and a code comment.
- Never hardcode secrets, API keys, connection strings, or tokens.
- Never send real emails from tests or CI.
- Never run destructive migrations without explicit review.
- Never assume production data shape from mock or seed data.
- Never introduce a new provider or package without documenting why.
- Never add unapproved billing behaviour or change plan pricing.
- Never expose customer invoice data (`clientEmail`, `amountDue`, `clientName`) across user accounts.
- Never document planned integrations as implemented ones.
- Never use `prismaAdmin` in user-facing code without a documented reason.
- Never use `DIRECT_URL` as the runtime database connection.
- Never skip webhook signature verification.
- Never import server-side code (`withUserContext`, `prismaAdmin`, `createClient` from `lib/supabase/server.ts`) into `"use client"` components.
- Never change the Stripe API version string without verifying type compatibility.
