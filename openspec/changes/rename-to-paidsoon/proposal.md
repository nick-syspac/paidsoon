## Why

The product is being rebranded from **Invoice Nudge** to **PaidSoon**. The workspace directory is already `paidsoon/`, but the user-visible product name, the npm package name, the system email domain, and several in-repo references still say "Invoice Nudge" / `invoicenudge.com`. Until those are aligned, every outbound email, every dashboard header, and every signed-up user will see the old brand.

This change is a coordinated rename across UI, configuration, email-sending identity, and documentation so the codebase, the running product, and the marketing surface all say the same thing.

## What Changes

- **User-visible UI**: marketing landing (`app/page.tsx`), dashboard chrome (`app/dashboard/layout.tsx`), auth pages (`app/(auth)/sign-in/page.tsx`), and component copy (`components/settings/StripeConnectionClient.tsx`) say "PaidSoon".
- **Email identity**: the system-domain `From` address moves from `billing@invoicenudge.com` to `billing@paidsoon.com`; `RESEND_FROM_NAME` defaults to `"PaidSoon"`. The fallback in `app/dashboard/settings/email/page.tsx` updates accordingly.
- **Package identity**: `package.json` and `package-lock.json` `name` field becomes `paidsoon`.
- **In-repo headers**: comment headers in `prisma/schema.prisma` and `prisma/rls-policies.sql` use "PaidSoon".
- **Setup docs**: `docs/SETUP.md` references and examples (project name, Stripe product name, Resend `FROM_NAME`, env values) reflect the new brand.
- **MODIFIED**: `email-settings` capability spec — the system-domain From address and brand string change from "Invoice Nudge / billing@invoicenudge.com" to "PaidSoon / billing@paidsoon.com".
- **Infra/runbook** (NOT code): register `paidsoon.com` as a Resend verified sending domain; update `RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` in Vercel + `.env.local`; update the Stripe product display name.

## Capabilities

### Modified Capabilities

- `email-settings`: the brand name and system-domain From address embedded in the Free-tier outbound email contract change.

### New Capabilities

None.

## Impact

- **Code touched**: ~7 source files (landing, dashboard layout, sign-in page, one settings component, one settings page fallback, two `package*.json`), 2 prisma comment headers, 1 docs file.
- **Spec touched**: `invoice-nudge-mvp/specs/email-settings/spec.md` (modified — From-header strings). The MVP change folder ID (`invoice-nudge-mvp/`) stays as-is — it is a historical change identifier, not user-facing.
- **Email deliverability**: outbound email sender identity changes. Until `paidsoon.com` is DNS-verified in Resend, sends will fail. The rollout sequence in `tasks.md` makes Resend domain verification a prerequisite for flipping the env vars.
- **Existing users**: any user already onboarded under the "Invoice Nudge" name will see "PaidSoon" on next page load. No data migration is needed; nothing about the brand name is persisted in the database.
- **Out of scope**: renaming the `invoice-nudge-mvp` openspec change folder; renaming the Git repo or GitHub project; logo / favicon / OG image assets; legal entity name. Those are separate decisions.
- **Risk**: low for the code rename itself (mechanical string replacement). The deliverability risk is real and gated by the runbook sequencing.
