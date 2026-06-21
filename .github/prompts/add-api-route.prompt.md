---
mode: agent
description: Add a new API route to PaidSoon following all conventions.
---

# Add API Route — PaidSoon

## Role
You are a senior full-stack engineer adding a new API route to PaidSoon.

## Goal
Implement a new route handler in `app/api/` that follows all PaidSoon conventions for auth, input validation, error handling, DB access, and security.

## PaidSoon Context
Next.js 16 App Router. All API routes export named HTTP method handlers. Server-side only — do not use client-side patterns.

## Files to Inspect
- `app/api/invoices/[id]/pause/route.ts` — simple route example
- `app/api/settings/schedule/route.ts` — GET + PUT pattern example
- `lib/db/withUserContext.ts` — DB access pattern
- `lib/supabase/server.ts` — server Supabase client
- `lib/billing.ts` — `requireFeature` for feature gating

## Required Checklist for Every New Route

```ts
// 1. Auth check
const supabase = await createClient()  // from lib/supabase/server.ts
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

// 2. Input validation (for POST/PUT/PATCH)
const schema = z.object({ ... })
const parsed = schema.safeParse(await req.json())
if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

// 3. Feature gate (if applicable)
await requireFeature(user.id, "feature_name")  // throws 403 if not entitled

// 4. DB access via withUserContext
const result = await withUserContext(user.id, async (tx) => {
  return tx.someModel.findMany({ where: { userId: user.id } })
})

// 5. Safe response (never return raw DB row)
return NextResponse.json({ data: mapToSafeShape(result) })
```

## Error Response Conventions

| Situation | Status | Body |
|---|---|---|
| No session | 401 | `{ error: "Unauthorized" }` |
| Invalid input | 400 | `{ error: <Zod flatten> }` |
| Not found | 404 | `{ error: "Not found" }` |
| Feature not in tier | 403 | `{ error: "Upgrade required" }` |
| Server error | 500 | `{ error: "Internal server error" }` |

## Implementation Rules
- File path: `app/api/<resource>/[id]?/<action>/route.ts`
- Never accept `userId` from request body — always from `supabase.auth.getUser()`
- Use `withUserContext` for all user-scoped DB queries
- Map DB results to safe response shapes before returning
- Never return raw error messages or stack traces to clients
- Add the route to `docs/DDD.md` API routes table

## Expected Output
1. Route file `app/api/<path>/route.ts`
2. Zod input schema (if mutating)
3. Tests in `tests/`
4. `docs/DDD.md` updated

## Acceptance Criteria
- Auth check present
- Input validation present (if applicable)
- DB access uses `withUserContext`
- Safe response shape returned
- Tests cover happy path and 401/400/403/404 cases
- `npm run test` passes
- No TypeScript errors
