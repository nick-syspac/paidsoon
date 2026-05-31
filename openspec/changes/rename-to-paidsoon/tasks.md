## 1. Prerequisites (RUNBOOK — operator decisions before code merge)

- [ ] 1.1 Confirm `paidsoon.com` is registered to the project (or register it)
- [ ] 1.2 Add `paidsoon.com` as a sending domain in Resend and complete DNS verification (SPF, DKIM, return-path)
- [ ] 1.3 Decide disposition of the legacy `invoicenudge.com` domain (park / redirect / release) — tracked separately, does not block this change

## 2. User-visible UI rename

- [x] 2.1 `app/page.tsx`: replace `Invoice Nudge` (header, body copy, footer) with `PaidSoon`
- [x] 2.2 `app/dashboard/layout.tsx`: replace dashboard chrome `Invoice Nudge` with `PaidSoon`
- [x] 2.3 `app/(auth)/sign-in/page.tsx`: update `Welcome back to Invoice Nudge.` to `Welcome back to PaidSoon.`
- [x] 2.4 `components/settings/StripeConnectionClient.tsx`: update the "Invoice Nudge can detect overdue invoices" copy to use `PaidSoon`
- [x] 2.5 Update document `<title>` / `metadata` in `app/layout.tsx` to `PaidSoon` (was the Next.js default `"Create Next App"`)

## 3. Email identity (code)

- [x] 3.1 `app/dashboard/settings/email/page.tsx`: change the `systemEmail` fallback from `"billing@invoicenudge.com"` to `"billing@paidsoon.com"`
- [x] 3.2 Grep `lib/email/` for any hard-coded brand string or domain — none found; all brand/domain values come from `RESEND_FROM_NAME` / `RESEND_FROM_EMAIL` env vars

## 4. Package & in-repo identifiers

- [x] 4.1 `package.json`: change `"name": "invoice-nudge"` to `"name": "paidsoon"`
- [x] 4.2 `package-lock.json`: `name` fields hand-edited to `paidsoon`. Operator should run `npm install` to fully regenerate the lockfile (no package manager available in this environment)
- [x] 4.3 `prisma/schema.prisma`: header comment updated to `// PaidSoon — Prisma Schema`
- [x] 4.4 `prisma/rls-policies.sql`: header comment updated to `-- PaidSoon — Supabase Row Level Security Policies`

## 5. Setup docs

- [x] 5.1 `docs/SETUP.md` title and intro: `Invoice Nudge — Setup Guide` → `PaidSoon — Setup Guide`
- [x] 5.2 `docs/SETUP.md` Supabase section: example project name `invoice-nudge-dev` → `paidsoon-dev`
- [x] 5.3 `docs/SETUP.md` Stripe section: example product name `Invoice Nudge Pro` → `PaidSoon Pro`
- [x] 5.4 `docs/SETUP.md` Resend section: `RESEND_FROM_NAME="Invoice Nudge"` → `RESEND_FROM_NAME="PaidSoon"`
- [x] 5.5 `docs/SETUP.md` "further reading" link to `openspec/changes/invoice-nudge-mvp/proposal.md` — path left as-is (per design D3); surrounding sentence reworded to note the rename

## 6. Spec update

- [x] 6.1 Created `openspec/changes/rename-to-paidsoon/specs/email-settings/spec.md` with `## MODIFIED Requirements` restating the Free-tier From-header requirement as `PaidSoon <billing@paidsoon.com>` and updating the Scenarios

## 7. Verification

- [x] 7.1 Ran grep for `Invoice Nudge|invoice-nudge|invoicenudge` across the workspace — every remaining hit is in `openspec/changes/invoice-nudge-mvp/` (historical), `openspec/changes/enforce-rls-via-prisma/` (cross-references), or `openspec/changes/rename-to-paidsoon/` (this change's own artifacts). No application code or live docs still contain the old brand.
- [ ] 7.2 `npm run build` succeeds — pending operator (no Node/npm available in this environment)
- [ ] 7.3 Manual smoke: `npm run dev`, load `/`, `/sign-in`, `/dashboard`, `/dashboard/settings/email` — every visible brand string reads `PaidSoon` — pending operator

## 8. Rollout (RUNBOOK — env-var flip, decoupled from code merge per design D2)

- [ ] 8.1 Merge code changes to `main` — outbound email still goes from `invoicenudge.com` because env vars haven't flipped
- [ ] 8.2 In Vercel project settings, update `RESEND_FROM_EMAIL` to `billing@paidsoon.com` and `RESEND_FROM_NAME` to `PaidSoon` (production + preview environments)
- [ ] 8.3 In local `.env.local`, mirror the same env-var changes
- [ ] 8.4 Trigger one real follow-up send (or use the cron worker against a seeded invoice) and inspect the received email's `From` header in an inbox you control
- [ ] 8.5 Confirm Resend dashboard shows the send under the `paidsoon.com` domain with no deliverability warnings
