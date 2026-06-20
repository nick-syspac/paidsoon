# Skill: Next.js App Router — PaidSoon

## When to Use This Skill
Use when building, modifying, or debugging any Next.js App Router page, layout, API route, or component in PaidSoon.

## Status
Confirmed implemented in this codebase (Next.js 16.2.6 App Router).

## Inputs Required
- Description of the page or route to create/modify
- Required data (DB tables, user fields)
- Feature tier requirement (if any)

## Files to Inspect
- `next.config.ts` — server external packages, runtime config
- `app/dashboard/page.tsx` — Server Component data-fetching pattern
- `app/dashboard/layout.tsx` — shared layout pattern
- `app/api/settings/schedule/route.ts` — GET + PUT route pattern
- `components/ui/Spinner.tsx` — loading component
- `middleware.ts` — auth gate
- `tsconfig.json` — path aliases

## Rules to Follow

### Server vs Client Components
- Server Components are the default — no `"use client"` unless needed
- `"use client"` required when: `useState`, `useEffect`, event handlers, browser APIs
- Never import `withUserContext`, `prismaAdmin`, or `createClient` from `lib/supabase/server.ts` in Client Components

### Route File Naming
- `page.tsx` — rendered page (UI)
- `route.ts` — API route handler (no JSX)
- `layout.tsx` — shared layout
- `loading.tsx` — Suspense fallback
- `error.tsx` — error boundary

### API Route Pattern
```ts
export async function GET(req: Request) { ... }
export async function POST(req: Request) { ... }
```

### Data Fetching
- Server Components fetch directly in the component body (async function)
- Client Components receive pre-fetched data as props or fetch via `fetch()`
- Never use `getServerSideProps` or `getStaticProps` (Pages Router only)

### Path Aliases
- All imports use `@/` prefix mapping to repo root
- Example: `import { createClient } from "@/lib/supabase/server"`

## Common Mistakes to Avoid
- Using `getSession()` instead of `getUser()` for server auth
- Importing server-side utilities into Client Components
- Forgetting `await` on `createClient()` (it's async)
- Missing `loading.tsx` for async pages
- Not handling empty/null states in Server Components
- Using Edge runtime on Prisma-dependent routes

## Output Format
- Route file at correct App Router path
- Full TypeScript implementation with proper types
- Loading and error states handled
- Auth check present (if user-facing route)

## Acceptance Checklist
- [ ] No `"use client"` in server-only components
- [ ] `supabase.auth.getUser()` used (not `getSession()`)
- [ ] `withUserContext` used for DB queries in routes
- [ ] Loading state present
- [ ] TypeScript strict — no `any`
- [ ] `npm run build` passes
