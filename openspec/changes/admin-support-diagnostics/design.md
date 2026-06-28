## Context

The platform admin section (`/admin`) has a working three-layer auth guard (Supabase session → PlatformRole → AdminSession via SSH challenge) and a set of read-only list pages. The pages display top-50 results with no search, no detail view, and no actions.

Operators currently resolve support issues by manually querying the database or navigating Stripe/Resend dashboards. There is no structured way to diagnose why a user is experiencing problems.

The goal is to turn the admin section into a lightweight support tool: find a user, see their full health picture, understand what's wrong, and take a safe corrective action — all in one flow.

## Goals / Non-Goals

**Goals:**
- Single searchable tenant list replacing both `/admin/tenants` and `/admin/users`
- Tenant detail view that surfaces all relevant state in one page (subscription, connections, invoice counts, email log, settings)
- Server-side diagnostic engine that flags unhealthy states with structured issues
- Safe corrective actions (reset email From, extend trial, trigger resync) with mandatory audit logging
- Runbook prose linked from each diagnostic issue card

**Non-Goals:**
- Real-time monitoring or webhook-driven alerts — diagnostics are on-demand per page load only
- Impersonation / "view as tenant" (route exists, UI deferred)
- Direct Stripe subscription mutation (tier changes, refunds) — Stripe dashboard link only
- Deleting or anonymising user data
- Any form of bulk operations across tenants

## Decisions

### D1: Diagnostics run server-side on every page load, not on-demand

**Decision:** Evaluate all diagnostic checks during the server component render of `/admin/tenants/[userId]`, not behind a "Run diagnostics" button.

**Rationale:** The tenant detail page is already a deliberate navigation — anyone loading it wants the full picture immediately. The diagnostic checks are pure functions over a single `TenantSnapshot` DB fetch; they add no meaningful latency. An on-demand button would add a UX step for no real benefit.

**Alternatives considered:** Client-side fetch after load — rejected because it would flash the page and requires additional API surface.

---

### D2: Single TenantSnapshot fetch, pure check functions

**Decision:** One aggregated Prisma query fetches the `TenantSnapshot` at the top of the page. All diagnostic checks receive this snapshot as a plain object and return `Diagnostic | null`. No check makes its own DB call.

```
TenantSnapshot = {
  profile:            UserProfile
  schedule:           Schedule | null
  emailSettings:      EmailSettings | null
  accountingConns:    AccountingConnection[]
  invoiceCounts:      { open, paused, snoozed, resolved, sequenceComplete }
  recentEmailLogs:    EmailLog[]   // last 30 days, no clientEmail
  supabaseEmail:      string       // from Supabase admin API
  supabaseLastSignIn: DateTime | null
}
```

**Rationale:** Keeps checks as pure, unit-testable functions with no side effects. Prevents N+1 queries. Makes it trivial to add new checks without touching data fetching.

**Alternatives considered:** Per-check lazy queries — rejected due to unpredictable latency and harder testing.

---

### D3: Corrective actions as dedicated API route segments

**Decision:** Each action is a named `POST` endpoint under `/api/admin/tenants/[id]/actions/[action]` (e.g., `reset-email-from`, `extend-trial`, `trigger-resync`).

**Rationale:** Keeps actions discoverable and individually auditable. Each endpoint enforces full admin guard, validates inputs with Zod, writes an `AdminAuditEvent` with `tenantId`, and returns a consistent `{ success, message }` shape. Avoids a single generic "mutation" endpoint that would be harder to audit and test.

**Alternatives considered:** A single PATCH endpoint with an `action` body field — rejected because it conflates unrelated operations and makes per-action audit logs messier.

---

### D4: Runbooks as static Next.js pages, not a CMS

**Decision:** Runbook content lives as TypeScript objects (title, slug, markdown body) in `lib/admin/runbooks/index.ts`. Pages at `/admin/runbooks/[slug]` render them with a simple markdown renderer (`react-markdown` is already indirectly available; if not, use a plain pre-formatted string approach).

**Rationale:** Runbooks are operator documentation, not user-facing content. They change infrequently and only with code changes anyway. A CMS would be over-engineering for this audience and scale. Keeping them in code means they are version-controlled alongside the diagnostic checks they document.

**Alternatives considered:** MDX files in `content/runbooks/` — considered, but adds build complexity. Docs markdown in `docs/runbooks/` — not surfaced in the admin UI. Static TS objects are the simplest correct approach.

---

### D5: User email comes from Supabase admin API, not duplicated in UserProfile

**Decision:** Fetch the user's email via `supabase.auth.admin.getUserById(userId)` in the tenant detail server component. Do not add an `email` column to `UserProfile`.

**Rationale:** Email is an auth concern and already in Supabase. Duplicating it into `UserProfile` would require a sync mechanism and could drift. One extra Supabase API call per page load is acceptable for an admin-only view. The call is made with `SUPABASE_SECRET_KEY` (already used in cron/seed contexts).

**Search implication:** The tenant list `?search=` query will search `UserProfile.displayName` only. Email-based search requires a separate Supabase `listUsers` call with email filter, which is paginated and slow. For MVP, name search is sufficient; a support operator can ask the user for their display name or look up in Stripe first.

---

### D6: Severity model — three levels, only two rendered prominently

**Decision:** Diagnostics have severity `error | warning | info`. In the UI, `error` items render as red cards at the top, `warning` items as amber cards below. `info` items render as a subtle list (no card, no action). No `info`-level items are implemented in MVP.

**Rationale:** Keeps the UI focused. If everything is highlighted, nothing is.

## Risks / Trade-offs

- **Supabase admin API latency** — `getUserById` adds ~200–400ms per tenant page load. Acceptable for an admin-only view; not acceptable for user-facing pages. Risk: Supabase rate-limits admin API calls under high load. Mitigation: admin section is low-traffic by nature; no caching needed for MVP.

- **Diagnostic false positives** — Some checks (e.g., "no invoices tracked after 7 days") could flag users who signed up very recently or are legitimately not using the feature. Mitigation: add a grace period (e.g., `profile.createdAt < 7 days ago` → suppress). Document edge cases in runbook prose.

- **Trial extension bypasses Stripe** — Extending `trialEndsAt` directly in the DB does not create a corresponding Stripe subscription schedule extension. If Stripe later fires a `customer.subscription.trial_will_end` event with a different date, the DB and Stripe will diverge. Mitigation: the action is explicitly scoped to users who are in `trialing` status with no active Stripe subscription yet (pre-payment). Document this constraint in the runbook.

- **Actions without undo** — Resetting `fromEmail` to null clears the user's custom setting permanently (they can re-enter it, but the old value is gone). Mitigation: log the old value in `AdminAuditEvent.metadata` so it can be manually restored.

## Open Questions

- **react-markdown vs plain pre block** — Check if `react-markdown` is available or needs adding for the runbook renderer. If not already in `package.json`, use a pre-formatted string approach or a minimal inline renderer to avoid adding a dependency.
- **Accounting resync API** — The trigger-resync action calls the provider's sync function. Verify the Xero/MYOB sync entrypoint is exposed as a callable server function (not just triggered by cron) before implementing the action endpoint.
