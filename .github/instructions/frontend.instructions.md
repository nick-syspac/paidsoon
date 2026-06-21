---
applyTo: "**/*.tsx,**/*.ts,**/components/**,**/app/**"
---

# Frontend Development Instructions — PaidSoon

## Next.js App Router Conventions

- App Router only. No `pages/` directory exists.
- Page files: `page.tsx`. Layout files: `layout.tsx`. API routes: `route.ts`.
- Server Components are the default. Only add `"use client"` when the component requires browser APIs, event handlers, or React hooks (useState, useEffect, etc.).
- All `/dashboard` routes are protected by middleware — no need for client-side auth guards.
- Use `loading.tsx` files or `<Suspense>` for async data fetching states.
- Use `error.tsx` files for error boundaries.
- The `Spinner` component lives at `components/ui/Spinner.tsx` — use it for loading states.

## TypeScript Standards

- Strict mode is enforced (`tsconfig.json`). All imports use `@/` alias (maps to repo root).
- Never use `any`. Use `unknown` + type narrowing, or define a proper interface.
- All component props must be explicitly typed.
- Return types on exported functions should be explicit.

## React Component Standards

- Components live in `components/`. Subdirectories: `components/dashboard/`, `components/settings/`, `components/ui/`.
- Keep components focused on presentation. Move business logic into `lib/`.
- Server Components fetch their own data directly. Do not pass large data blobs via props.
- Client Components receive only the data they need — map DB rows to safe display shapes before passing.
- Never import `withUserContext`, `prismaAdmin`, or `createClient` from `lib/supabase/server.ts` in a `"use client"` component. These are server-only.

## Form Handling

- Validate with Zod at the API boundary, not just in the form.
- Show inline validation errors next to each field.
- Disable submit buttons while requests are in flight.
- After a successful mutation, reflect the change in the UI without a full page reload where possible.

## Loading, Error, and Empty States

- Every data-fetching component must handle three states: loading, error, empty.
- Use the shared `Spinner` component for loading.
- Empty states (no invoices, no connections) should explain what to do next — do not show a blank table.
- Never show raw error messages to the user. Log to console and show a safe, user-friendly message.

## Dashboard UX Rules

- The `InvoiceTable` component renders tracked invoices. Invoice actions (pause, resume, snooze, resolve) call API routes.
- Show overdue days prominently. Format `amountDue` (stored in cents) using `Intl.NumberFormat` for display.
- `UpgradeBanner` and `LockedDashboardPreview` are used for upsell. Do not remove or bypass tier checks.
- Feature-gated sections must be visually distinct from available features (lock icon, greyed out, upgrade prompt).
- Query param `intent=<feature>` on `/dashboard` triggers upsell prompts — preserve this pattern.

## Accessibility

- All interactive elements must be keyboard-accessible.
- Buttons must have descriptive `aria-label` attributes when the label is not visible text.
- Forms must use `<label>` with `htmlFor` matching input `id`.
- Avoid `tabindex` values above `0`.

## Mobile Responsiveness

- All pages must be usable on screens ≥ 375px wide.
- Use Tailwind CSS responsive prefixes (`sm:`, `md:`, `lg:`) consistently.
- Tables should degrade gracefully on small screens (horizontal scroll or card layout).

## API Client Usage

- Fetch data from API routes using `fetch` in Client Components.
- Handle `4xx` and `5xx` responses explicitly — check `response.ok` before parsing JSON.
- Do not call Prisma, `withUserContext`, or Supabase admin clients from Client Components.
- For server-side data fetching in Server Components, call `createClient()` from `lib/supabase/server.ts` and use `withUserContext`.

## Auth-Aware Rendering

- Use the server-side `createClient()` from `lib/supabase/server.ts` and `supabase.auth.getUser()` to determine auth state in Server Components.
- Never rely on `getSession()` for server-side identity — use `getUser()`.
- Dashboard layout already enforces authentication via middleware. Component-level auth checks are redundant unless you have specific per-route requirements.
