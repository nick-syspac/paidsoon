## Context
PaidSoon currently has an admin shell at `/admin`, layered admin guards, audit logging, and several operational pages and APIs. This change extends that foundation into a controlled support console. The design must stay aligned with the repository’s current patterns: App Router server pages, `/api/admin/*` route handlers, Prisma-backed admin data access, and immutable audit events.

## Goals
- Give the platform owner and delegated staff a safe way to resolve common support issues inside the app.
- Keep all support actions tenant-scoped, validated, and auditable.
- Preserve tenant isolation and avoid exposing secrets or unrestricted write paths.
- Reuse the existing admin guard, audit log, and route conventions where possible.

## Non-Goals
- General-purpose database browsing or SQL execution.
- A replacement for external provider admin consoles.
- Broad platform automation beyond support-oriented actions.
- Unrestricted impersonation or destructive tenant access without confirmation.

## Current Repository Surface
The repo already contains:
- A protected admin area under `/admin`.
- A layered admin guard in `lib/admin/guard.ts`.
- Immutable admin audit logging in `lib/admin/audit.ts` and `app/api/admin/audit-events/route.ts`.
- Existing admin routes for tenants, users, integrations, subscriptions, email jobs, staff, devices, and impersonation.
- Existing operational context in cron routes, accounting sync code, email dispatch, billing helpers, and support runbooks.

This change formalizes those surfaces into a support console with a broader operational scope.

## Admin Routing and Navigation
The console SHOULD keep `/admin` as the root and organize the UI by operational concern rather than by internal storage model. A practical structure is:
- `/admin/overview` for platform health.
- `/admin/tenants` and `/admin/tenants/[tenantId]` for tenant search and detail.
- `/admin/users` for user support.
- `/admin/integrations` for accounting sync review.
- `/admin/invoices` and invoice drill-down pages for debtor support.
- `/admin/reminders` for automation and queue inspection.
- `/admin/email-events` for delivery review.
- `/admin/jobs` for worker and queue state.
- `/admin/billing` or `/admin/billing/[tenantId]` for Stripe state.
- `/admin/audit-events` for audit review.
- `/admin/feature-flags` or a tenant override section where appropriate.

The existing admin layout SHOULD continue to show role, session status, and a visible support-session banner when impersonation is active.

## Backend API Design
Admin support endpoints SHOULD stay under `/api/admin/*` and continue to require layered auth. Suggested areas are:
- Tenant and user search endpoints for safe discovery.
- Tenant action endpoints for pause, resume, retry, reprocess, and export actions.
- Support endpoints for invites, password resets, user disablement, and ownership transfer.
- Integration endpoints for retry sync, reset cursor, reconnect review, and duplicate handling.
- Invoice and reminder endpoints for pause, resume, re-schedule, and preview actions.
- Email delivery endpoints for retry, resend, suppression review, and sender status.
- Job endpoints for retry, cancel, requeue, and stuck-job remediation.
- Billing endpoints for sync, trial extension, subscription changes, and portal link resend.
- Feature-override endpoints for tenant-scoped toggles.

The APIs MUST validate input with Zod, MUST return safe error messages, and MUST never return raw credentials or unmasked secrets.

## Permission Model
Role scope SHOULD be explicit and least-privilege. A reasonable model is:
- Support Viewer: read-only access to dashboards, timeline, search, and masked details.
- Support Operator: read access plus safe support actions such as retry, pause, resume, resend, and export.
- Billing Admin: Support Operator access plus billing-specific actions.
- Integration Admin: Support Operator access plus integration and sync repair actions.
- Platform Admin: broader access across all support modules, including feature flags.
- Super Admin / Break Glass: emergency recovery access with additional scrutiny and logging.

Role checks SHOULD be enforced server-side for every route and action. Risky actions SHOULD require a second confirmation step or re-authentication, depending on severity.

## Support Action Pattern
High-risk actions SHOULD follow a consistent pattern:
1. Fetch tenant-scoped context.
2. Validate the action payload.
3. Require re-authentication or session freshness for risky mutations.
4. Ask for a reason string and optional support note.
5. Execute the minimal corrective mutation.
6. Write an immutable audit event.
7. Return a safe, structured result with the new state.

Actions that change billing, automation, ownership, or feature flags MUST require a reason. Actions that can affect message delivery or subscription state SHOULD also require confirmation.

## Tenant-Scoped Data Access
All tenant operations SHOULD be scoped to a specific tenant identifier. The admin console MAY aggregate related data from multiple tables, but it MUST not bypass tenant boundaries in a way that lets support see another tenant’s raw business data. Support pages SHOULD select only the fields needed for the UI. Sensitive fields, especially tokens, secrets, and payment details, MUST be masked or omitted.

## Support Session and Impersonation
If support-session or impersonation is used, it SHOULD be explicit, time-limited, and recorded in the audit log. The UI MUST display a visible banner. Destructive actions during impersonation SHOULD require extra confirmation. The session MUST NOT expose secrets, raw payment information, or plaintext OAuth tokens. If impersonation is not needed for a specific action, the design SHOULD prefer direct tenant-scoped support actions instead.

## Integration Retry and Reprocess Approach
Accounting support SHOULD focus on safe state transitions and idempotent retries. The console SHOULD expose last sync time, last result, cursor state, and failure history, along with a controlled retry action. Cursor resets and full resyncs MUST require confirmation and a reason. Duplicate invoice handling SHOULD be treated as a controlled support correction with audit trails.

## Job Retry and Cancellation Approach
Queue operations SHOULD distinguish between retry, requeue, cancel, ignore, and clear-stuck actions. The UI SHOULD show job type, tenant, retry count, and last error. Cancelling or clearing a job SHOULD require confirmation. The design SHOULD assume that job control is an operational tool, not a debugging shell.

## Email Delivery Inspection
Email support SHOULD show sent, queued, failed, bounced, and suppressed events, plus sender-domain health where available. The console MUST not expose recipient PII beyond what is needed for support. Retry and resend actions SHOULD verify that the target is still eligible to receive mail.

## Stripe Billing Sync
Billing support SHOULD show plan, subscription state, customer and subscription IDs, usage, and recent Stripe events. Billing actions MUST create audit events and SHOULD require a reason. The console SHOULD prefer syncing from Stripe over manual state edits, and manual overrides SHOULD be narrowly constrained.

## Security Boundaries
- Admin access MUST stay behind the existing layered admin guard.
- Sensitive actions MUST require reason capture and strong auth freshness.
- The console MUST NOT expose raw secrets, plaintext OAuth tokens, or unrestricted SQL.
- The console MUST NOT allow silent impersonation.
- Audit events MUST be immutable and retained for incident review.
- Tenant isolation MUST remain enforced by application logic and database policy.

## Observability and Logging
Support actions SHOULD emit audit events and, where useful, structured server logs. Logs MUST avoid PII and secrets. The support timeline SHOULD be built from audit events plus operational records such as sync runs, email logs, billing transitions, and invite events.

## Testing Strategy
The implementation SHOULD be covered by tests for:
- route-level authentication and authorization,
- audit event creation,
- confirmation and reason requirements,
- sensitive-field masking,
- tenant scoping,
- retry and pause/resume flows,
- billing and integration action boundaries,
- and UI visibility of support state.

## Open Questions
- Whether support-session/impersonation should be required for all read-only tenant inspection or limited to a subset of actions.
- Whether feature flags should live in a dedicated admin table or reuse existing tenant settings with admin overrides.
- Whether invoice correction actions should operate on imported records only or also on derived reminder state.
