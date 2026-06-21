---
mode: agent
description: Add a new Next.js App Router page to the PaidSoon dashboard.
---

# Add Next.js Page — PaidSoon

## Role
You are a senior full-stack engineer adding a new page to the PaidSoon dashboard.

## Goal
Create a new Next.js App Router page in the PaidSoon dashboard, following all component, auth, and data-fetching conventions.

## PaidSoon Context
Next.js 16 App Router. Dashboard is at `app/dashboard/`. Auth is enforced by middleware — all `/dashboard` routes require an authenticated user. Server Components are the default.

## Files to Inspect
- `app/dashboard/layout.tsx` — shared dashboard layout
- `app/dashboard/page.tsx` — main dashboard page (pattern reference)
- `app/dashboard/settings/page.tsx` — settings page pattern
- `lib/supabase/server.ts` — server client for auth + data
- `lib/db/withUserContext.ts` — DB access pattern
- `components/ui/Spinner.tsx` — loading component

## Page Creation Steps

### 1. Create the page file
```
app/dashboard/<section>/page.tsx
```

### 2. Server Component pattern
```tsx
// Server Component — no "use client" needed
import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"

export default async function MyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const data = await withUserContext(user.id, async (tx) => {
    return tx.someModel.findMany({ where: { userId: user.id } })
  })

  return <div>{/* render data */}</div>
}
```

### 3. Client Component pattern (for interactive parts)
```tsx
"use client"
// Only use this when you need: useState, useEffect, event handlers, browser APIs
```

### 4. Loading state
Create `app/dashboard/<section>/loading.tsx`:
```tsx
import Spinner from "@/components/ui/Spinner"
export default function Loading() {
  return <Spinner />
}
```

### 5. Error boundary
Create `app/dashboard/<section>/error.tsx` for error handling.

## Rules
- Server Components by default — add `"use client"` only when required
- No middleware auth checks needed — middleware already protects `/dashboard`
- Map DB rows to safe display shapes before rendering
- `amountDue` is in cents — format with `Intl.NumberFormat`
- Handle empty states — never show a blank page
- Never import `prismaAdmin` into a page component

## Feature Gating
If the page requires a specific tier:
```tsx
import { hasPlanFeature } from "@/lib/billing"
// fetch user's tier from DB, then:
if (!hasPlanFeature(tier, "feature_name")) {
  return <UpgradeBanner />  // or redirect to upgrade
}
```

## Expected Output
1. `app/dashboard/<section>/page.tsx`
2. `app/dashboard/<section>/loading.tsx` (if needed)
3. Supporting components in `components/` (if needed)
4. `docs/DDD.md` update with new route

## Acceptance Criteria
- Page renders for authenticated users in correct tier
- Page shows upgrade prompt for users without access
- Loading state present
- Empty state handled
- No TypeScript errors
- No raw DB rows returned to client
