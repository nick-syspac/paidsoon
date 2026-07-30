## Why

PaidSoon has no UI for users to set their display name — the name that appears as `{{yourName}}` in every automated client reminder email. The cron job falls back to the email prefix (e.g. `"jane"` from `jane@example.com`), which looks unprofessional. There is also no user menu in the nav; sign-out is a bare button with no identity context. This change fixes both gaps.

## What Changes

- **New**: User menu dropdown in the dashboard nav replaces the bare "Sign out" button
- **New**: Menu header displays the user's display name + email + subscription tier
- **New**: Menu links to Account settings and Settings; Sign out anchors the bottom
- **New**: `/dashboard/settings/account` tab — view and edit display name; view email (read-only), plan, and account age
- **New**: `displayName` field added to the `UserProfile` Prisma model (nullable `String`)
- **Modified**: Cron job (`send-emails`) reads `UserProfile.displayName` first, falls back to `user_metadata.full_name`, then email prefix
- **New**: `PATCH /api/settings/profile` route to update display name

## Capabilities

### New Capabilities

- `user-profile-display-name`: User can set and persist a display name that is used as `{{yourName}}` in automated reminder emails and shown in the nav user menu
- `user-nav-menu`: Nav sign-out button replaced with an identity-aware dropdown menu showing name, email, tier, and links to account settings and sign-out

### Modified Capabilities

- `logout-redirect-home`: Sign-out action moves from a standalone nav button to inside the user menu — the redirect behaviour (`/`) is unchanged but the trigger location and UI changes

## Impact

- `prisma/schema.prisma` — add `displayName String?` to `UserProfile`
- `prisma/rls-policies.sql` — no new table, existing `user_profiles` policy covers the new field
- `prisma/migrations/` — new migration for `displayName` column
- `app/dashboard/layout.tsx` — replace sign-out button with `<UserMenu>` client component; pass email, displayName, tier, status as props
- `components/dashboard/UserMenu.tsx` — new client component (dropdown)
- `app/dashboard/settings/account/page.tsx` — new settings tab (Account)
- `app/dashboard/settings/layout.tsx` — add Account tab to nav
- `app/api/settings/profile/route.ts` — new PATCH handler for display name
- `app/api/cron/send-emails/route.ts` — read `displayName` from `UserProfile` in existing query
- `docs/DDD.md` — update schema section and API routes section
