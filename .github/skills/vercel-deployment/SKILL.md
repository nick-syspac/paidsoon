# Skill: Vercel Deployment — PaidSoon

## When to Use This Skill
Use when modifying deployment configuration, environment variables, cron jobs, or troubleshooting Vercel build/runtime issues in PaidSoon.

## Status
Confirmed implemented (Vercel hosting with Vercel Cron).

## Inputs Required
- What change is being made (build, env var, cron, runtime config)
- Target environment (preview, production)

## Files to Inspect
- `vercel.json` — cron config
- `next.config.ts` — Next.js build config, serverExternalPackages
- `package.json` — build scripts
- `docs/runbooks/README.md` — env var matrix
- `docs/runbooks/vercel.md` — Vercel runbook
- `middleware.ts` — edge middleware (LIVE gate)

## Key Configuration

### vercel.json
```json
{
  "crons": [
    { "path": "/api/cron/send-emails", "schedule": "0 9 * * *" }
  ]
}
```

### next.config.ts
```ts
const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
}
```
Do not remove `serverExternalPackages` — Prisma requires it.

### Build command
```
prisma generate && next build
```
Do not remove `prisma generate`.

## Environment Variables by Scope

| Prefix | Scope | Examples |
|---|---|---|
| `NEXT_PUBLIC_` | Browser + Server | `NEXT_PUBLIC_SUPABASE_URL` |
| (none) | Server only | `STRIPE_SECRET_KEY`, `DATABASE_URL` |

All env vars documented in `docs/runbooks/README.md`.

## Cron Job Rules
- Route: `/api/cron/send-emails`
- Schedule: `0 9 * * *` (daily 09:00 UTC)
- Auth: `Authorization: Bearer CRON_SECRET` — **must verify**
- Uses `prismaAdmin` (RLS bypass intentional — processes all users)
- To add a new cron: add entry to `vercel.json` + document in `docs/DDD.md`

## Runtime Considerations
- All routes use Node.js runtime (default)
- Do **not** set `export const runtime = "edge"` on any route using Prisma
- Middleware (`middleware.ts`) runs on Edge runtime — no Prisma there

## Preview vs Production
| Setting | Preview | Production |
|---|---|---|
| `LIVE` | `false` | `true` |
| Stripe keys | Test keys | Live keys |
| DB | Staging Supabase | Production Supabase |
| Webhook secrets | Test webhook secrets | Live webhook secrets |

## Rules to Follow
- Never use `DIRECT_URL` as `DATABASE_URL` in production
- `LIVE=true` only in production Vercel environment
- All new env vars must be added to `docs/runbooks/README.md`
- Build must succeed: `npm run build`

## Common Mistakes to Avoid
- Using `DATABASE_URL = DIRECT_URL` (bypasses connection pooler)
- Forgetting to set `LIVE=true` in production
- Missing `prisma generate` from build command
- Forgetting `serverExternalPackages` for Prisma
- Using Edge runtime on Prisma routes

## Output Format
- Updated `vercel.json` (if cron changed)
- Updated `next.config.ts` (if build config changed)
- `docs/runbooks/README.md` updated (if env vars changed)

## Acceptance Checklist
- [ ] Build command includes `prisma generate`
- [ ] `serverExternalPackages` present
- [ ] Cron authentication check present
- [ ] No server-only secrets exposed to browser
- [ ] `npm run build` passes
