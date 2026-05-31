This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Database access: `withUserContext` vs `prismaAdmin`

Tenant isolation is enforced at the database layer via Supabase Row Level Security. To make RLS actually fire under Prisma, the codebase exposes two entry points and no default `prisma` client:

- `withUserContext(userId, (tx) => ...)` from [lib/db/withUserContext.ts](lib/db/withUserContext.ts) — the default for any code path serving a user request (server components, server actions, route handlers). It opens a Prisma `$transaction`, sets `request.jwt.claims` and `SET LOCAL ROLE authenticated`, then runs the callback. Inside the callback, `auth.uid()` resolves to `userId` and RLS policies apply.
- `prismaAdmin` from [lib/db/admin.ts](lib/db/admin.ts) — connects as the owner role and **bypasses RLS**. Use only from cron jobs, webhook handlers, and the post-signup profile bootstrap. Every import is a deliberate, reviewable escalation.

Two database URLs are required:

- `DATABASE_URL` — pgBouncer pooler connection as a non-owner role (e.g. Supabase's built-in `authenticator`). Used by Prisma at runtime.
- `DIRECT_URL` — direct connection as the owner / `postgres` role. Used by `prisma migrate` (see [prisma.config.ts](prisma.config.ts)).

A verification script lives at [scripts/verify-rls.ts](scripts/verify-rls.ts) and proves cross-tenant isolation holds at the DB layer.
