---
mode: agent
description: Diagnose and fix a frontend issue in PaidSoon.
---

# Fix Frontend Issue — PaidSoon

## Role
You are a senior frontend engineer diagnosing and fixing a UI/UX issue in PaidSoon.

## Goal
Identify the root cause of a frontend issue and implement a targeted fix without over-engineering.

## PaidSoon Context
Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4. Server Components by default. Client Components only for interactivity.

## Files to Inspect
- The specific component file mentioned in the issue
- `app/dashboard/page.tsx` — main dashboard
- `app/dashboard/layout.tsx` — shared layout
- `components/dashboard/InvoiceTable.tsx` — invoice display
- `components/ui/Spinner.tsx` — loading states
- `proxy.ts` — auth redirects

## Diagnostic Checklist

### Rendering Issues
- [ ] Is the component a Server Component when it needs to be a Client Component?
- [ ] Is `"use client"` missing but `useState`/`useEffect`/browser APIs are used?
- [ ] Is `"use client"` present but server-only imports used (prisma, supabase server)?
- [ ] Is data fetched asynchronously without a `loading.tsx` or Suspense boundary?

### Auth Issues
- [ ] Does the page assume `user` is always defined without a null check?
- [ ] Is `supabase.auth.getUser()` used on the server (not `getSession()`)?
- [ ] Is the browser client accidentally used in a server component?

### Data Display Issues
- [ ] Is `amountDue` displayed in cents without dividing by 100?
- [ ] Is a date shown as a raw ISO string instead of a formatted date?
- [ ] Is `null` or `undefined` rendered as the string "null" or "undefined"?

### Type Issues
- [ ] Are there TypeScript errors in the component file?
- [ ] Is `any` used to bypass type checks?

## Fix Rules
- Make the minimum change needed to fix the issue
- Do not refactor unrelated code
- Do not add features beyond what is needed to fix the bug
- If the fix changes data flow, update the affected component only

## Expected Output
1. File path of the fix
2. Description of root cause
3. Targeted code change
4. Confirmation of no TypeScript errors after fix

## Acceptance Criteria
- Issue is resolved
- No new TypeScript errors: `npm run build`
- No regressions in auth or data display
- `npm run lint` passes
