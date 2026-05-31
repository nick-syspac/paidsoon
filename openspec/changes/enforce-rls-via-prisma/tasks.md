## 1. Database roles & connection strings (RUNBOOK — manual, requires Supabase access)

- [ ] 1.1 In Supabase dashboard, retrieve the password for the built-in `authenticator` role (Project Settings → Database). Under option A no custom role is needed: `authenticator` already lacks BYPASSRLS and can `SET ROLE authenticated`.
- [ ] 1.2 ~~Grant `app_user` permissions~~ — not needed under option A
- [ ] 1.3 ~~Grant `app_user` ability to `SET ROLE authenticated`~~ — built in for `authenticator`
- [ ] 1.4 ~~Add `prisma/grants.sql`~~ — not needed under option A
- [ ] 1.5 In Vercel + local `.env.local`, set `DATABASE_URL` to the pgBouncer pooler URL using `authenticator` credentials (NOT `postgres`)
- [ ] 1.6 In Vercel + local `.env.local`, set `DIRECT_URL` to the direct-connection URL using the owner / `postgres` role; update `prisma.config.ts` to use `DIRECT_URL` for migrations (currently reads `DATABASE_URL`)
- [ ] 1.7 Run `prisma migrate status` and `prisma migrate deploy` against `DIRECT_URL` to confirm migrations still work

## 2. `withUserContext` helper and split clients

- [x] 2.1 Create `lib/db/admin.ts` exporting `prismaAdmin`
- [x] 2.2 Create `lib/db/withUserContext.ts` exporting `withUserContext<T>(userId, fn)`
- [x] 2.3 Remove the default `prisma` export from `lib/prisma.ts` (file deleted)
- [x] 2.4 JSDoc on `prismaAdmin` warning about RLS bypass

## 3. Migrate user-request call sites

- [x] 3.1 Enumerated all `@/lib/prisma` imports (21 files)
- [x] 3.2 Migrated user-request call sites to `withUserContext(user.id, (tx) => tx.x.foo(...))`, keeping existing `where: { userId }` predicates as belt-and-suspenders
- [x] 3.3 Multi-query handlers (dashboard, schedule/email settings pages, disconnect, email PUT, Stripe connect callback) grouped inside a single `withUserContext` callback so they share a transaction
- [x] 3.4 Verified no user-request code path imports `prismaAdmin`

## 4. Service-role call sites

- [x] 4.1 `app/api/cron/send-emails/route.ts` → `prismaAdmin`
- [x] 4.2 `app/api/webhooks/stripe-billing/route.ts` → `prismaAdmin`
- [x] 4.3 `app/api/webhooks/stripe-connect/route.ts` → `prismaAdmin`
- [x] 4.4 `lib/actions/auth.ts` (post-signup bootstrap), `lib/email/catchup.ts`, `lib/email/send.ts` → `prismaAdmin`

## 5. Verification test

- [x] 5.1 Test harness written: `scripts/verify-rls.ts` seeds two users + one tracked_invoice each via `prismaAdmin`
- [x] 5.2 Check: `withUserContext(userA.id)` sees exactly user A's row
- [x] 5.3 Check: `withUserContext(userB.id)` sees exactly user B's row
- [x] 5.4 Check: a transaction that switches to `authenticated` without setting `request.jwt.claims` sees zero rows
- [ ] 5.5 Run the script against a configured Supabase preview DB (requires section 1 complete)

## 6. Spec & docs

- [x] 6.1 Updated `invoice-nudge-mvp/design.md` D1 with an implementation note referencing this change
- [x] 6.2 Updated `prisma/rls-policies.sql` header to describe the role / `SET LOCAL` enforcement model
- [ ] 6.3 Optional: add a note to `README.md` documenting the `withUserContext` / `prismaAdmin` split

## 7. Rollout (RUNBOOK)

- [ ] 7.1 Deploy to a Vercel preview with the new `DATABASE_URL` / `DIRECT_URL`; run `scripts/verify-rls.ts` against the preview DB
- [ ] 7.2 Manually click through dashboard, settings, and one invoice action as two different users in two browsers
- [ ] 7.3 Promote to production; rotate the old `postgres`-role DB password since it is no longer the runtime credential
