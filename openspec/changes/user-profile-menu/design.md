## Context

The dashboard nav currently has a bare `<form action="/auth/sign-out" method="POST">` button — no user identity is surfaced anywhere in the app shell. The `sendFollowUpEmail` cron job derives `freelancerName` (used as `{{yourName}}` in client reminder emails) from `user_metadata.full_name` with a fallback to the email username prefix. No UI exists to set or update this name, so most users will have an unprofessional fallback name in their client-facing emails.

`app/dashboard/layout.tsx` is a **server component** that already fetches `user` (Supabase auth) and `profile` (UserProfile from Prisma). The nav sign-out sits at the end of the flex row.

## Goals / Non-Goals

**Goals:**
- Surface user identity (name, email, tier) in the nav via a dropdown user menu
- Allow users to set a display name that flows into `{{yourName}}` in reminder emails
- Add a `/dashboard/settings/account` tab as the canonical home for identity/profile settings
- Keep the sign-out action accessible at the bottom of the menu

**Non-Goals:**
- Changing email address (Supabase auth controls this; out of scope)
- Profile photos / avatars (text initials only for the menu trigger)
- `businessName` field (can be added in a future change if needed for a `{{businessName}}` token)
- Password management (Supabase handles this)
- Team/multi-user profiles (separate change)

## Decisions

### D1: Store `displayName` in `UserProfile` (Postgres), not `user_metadata` (Supabase auth)

**Chosen:** Add `displayName String?` to `UserProfile` via Prisma migration.

**Alternatives considered:**
- `user_metadata` (Supabase): No migration needed, but mixes product data into auth layer. Updating requires calling `supabase.auth.updateUser()` client-side, which can't be done inside a `withUserContext` transaction. RLS doesn't apply to `user_metadata`.
- Separate `UserProfileExtended` table: Unnecessary indirection for a single field.

**Rationale:** Consistent with all other user-level product data. Easy to read in cron (already selects from `user_profiles`). RLS-protected.

### D2: `UserMenu` is a `"use client"` component receiving scalar props from the server layout

**Chosen:** Extract `<UserMenu email tier displayName status />` as a client component. The server layout passes down only the scalar data it already fetches.

**Alternatives considered:**
- CSS-only `<details>/<summary>`: No JS needed, but no click-outside close, limited accessibility, harder to style to match the design system.
- Full server component with `<form>` actions only: Can't manage open/close dropdown state.

**Rationale:** Minimal client boundary. No additional data fetching in the component — all props come from the server layout's existing queries.

### D3: Account settings at `/dashboard/settings/account` as a new tab alongside existing settings tabs

**Chosen:** Add "Account" as the first tab in `SettingsLayout`.

**Alternatives considered:**
- Dedicated `/dashboard/account` page outside settings: Creates two separate navigation paradigms for user configuration.
- Inline edit inside the dropdown menu: Too cramped; settings UI needs label/input/save flow.

**Rationale:** Consistent with the existing settings tab pattern. Users already navigate to settings for email, schedule, templates — account belongs there.

### D4: Cron reads `UserProfile.displayName` first, falls back to `user_metadata.full_name`

**Chosen:** In `send-emails/route.ts`, add `displayName` to the existing `UserProfile` select. Use it as the primary name source; keep existing `user_metadata.full_name` as a secondary fallback, then email prefix.

**Rationale:** Zero-downtime migration path. Existing users who haven't set a `displayName` yet continue to behave exactly as before. No data migration needed.

### D5: Menu trigger shows initials avatar (2 chars from name or email)

**Chosen:** A small circle with up to 2 initials derived from `displayName` (if set) or email. No profile photo upload in this change.

**Rationale:** Immediately recognisable identity signal without requiring file upload infrastructure.

## Risks / Trade-offs

- **Schema migration on a live DB** → Migration adds a nullable column with no default — safe, no table lock on Postgres for `ADD COLUMN … NULL`.
- **Cron fallback chain** → Three-level fallback (`displayName` → `user_metadata.full_name` → email prefix) is slightly more logic, but each level is a simple null-check. Low risk.
- **Client component hydration** → `UserMenu` adds a small JS bundle. Acceptable given it replaces an existing `<form>` in the nav.
- **Display name is user-supplied text** → Must be sanitised before use in email templates. Interpolation already runs through `sanitizeHtml` in `send.ts`; display name flows through `freelancerName` → `{{yourName}}` which is in the text body (not HTML injection risk), but validation at the API boundary is still required.

## Migration Plan

1. Add `displayName String?` to `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name add-user-profile-display-name`
3. Deploy — nullable column, zero downtime
4. No data backfill needed (fallback chain handles existing users)
5. Rollback: remove column migration; revert cron to previous fallback logic

## Open Questions

- None blocking. `businessName` deferred to a future change.
