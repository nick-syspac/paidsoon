## 1. Database Schema

- [x] 1.1 Add `displayName String?` field to `UserProfile` model in `prisma/schema.prisma`
- [x] 1.2 Run `npx prisma migrate dev --name add-user-profile-display-name` to generate migration
- [x] 1.3 Verify `prisma/rls-policies.sql` — confirm existing `user_profiles` RLS policy covers the new column (no new policy needed)
- [x] 1.4 Run `npm run verify-rls` to confirm RLS isolation is intact after migration

## 2. Profile API Route

- [x] 2.1 Create `app/api/settings/profile/route.ts` with a `PATCH` handler
- [x] 2.2 Authenticate request via `supabase.auth.getUser()`; return 401 if unauthenticated
- [x] 2.3 Validate request body with Zod: `displayName` required, string, 1–100 characters
- [x] 2.4 Persist display name via `withUserContext(userId, tx => tx.userProfile.update(...))`
- [x] 2.5 Return the updated `displayName` in the response

## 3. Account Settings Page

- [x] 3.1 Create `app/dashboard/settings/account/page.tsx` — server component that fetches user email (Supabase) and profile fields (Prisma)
- [x] 3.2 Fetch: `user.email`, `profile.displayName`, `profile.subscriptionTier`, `profile.subscriptionStatus`, `profile.createdAt`
- [x] 3.3 Create `components/settings/AccountSettingsClient.tsx` — client component receiving fetched props
- [x] 3.4 Render display name text input pre-filled with current value; Save button calls `PATCH /api/settings/profile`
- [x] 3.5 Render email as read-only (no input element)
- [x] 3.6 Render plan, status, and account creation date as read-only info
- [x] 3.7 Show inline success/error feedback after save

## 4. Settings Navigation

- [x] 4.1 Add `{ href: "/dashboard/settings/account", label: "Account" }` as the first entry in the `TABS` array in `app/dashboard/settings/layout.tsx`
- [x] 4.2 Update `app/dashboard/settings/page.tsx` — change redirect from `/stripe` to `/account`

## 5. User Menu Component

- [x] 5.1 Create `components/dashboard/UserMenu.tsx` as a `"use client"` component
- [x] 5.2 Accept props: `email: string`, `displayName: string | null`, `tier: string`, `status: string`
- [x] 5.3 Derive initials: up to 2 chars from `displayName` words (if set) or from email prefix
- [x] 5.4 Implement open/close dropdown state with click-outside close (`useEffect` + `ref`)
- [x] 5.5 Render menu header: primary line (displayName if set, else email), secondary line (email if displayName shown), tier badge
- [x] 5.6 Render "Account" link → `/dashboard/settings/account`
- [x] 5.7 Render "Settings" link → `/dashboard/settings`
- [x] 5.8 Render sign-out `<form action="/auth/sign-out" method="POST">` button as the last menu item

## 6. Dashboard Layout Integration

- [x] 6.1 In `app/dashboard/layout.tsx`, add `displayName` to the existing `userProfile.findUnique` select
- [x] 6.2 Replace the `<form action="/auth/sign-out">` sign-out button in the nav with `<UserMenu email={user.email} displayName={profile.displayName} tier={tier} status={profile.subscriptionStatus} />`

## 7. Cron — Display Name Fallback

- [x] 7.1 In `app/api/cron/send-emails/route.ts`, add `displayName: true` to the `userProfile` select in `pendingInvoices` query
- [x] 7.2 Update `freelancerName` derivation: use `invoice.userProfile.displayName` first, then `user_metadata.full_name`, then email prefix

## 8. Tests

- [x] 8.1 Add unit test in `tests/` verifying display name fallback chain logic (displayName → user_metadata → email prefix)
- [x] 8.2 Add test for `PATCH /api/settings/profile` Zod validation: empty string rejected, >100 chars rejected, valid string accepted

## 9. Documentation

- [x] 9.1 Update `docs/DDD.md` — add `displayName` to the `UserProfile` schema table
- [x] 9.2 Update `docs/DDD.md` — add `PATCH /api/settings/profile` to the API routes section
