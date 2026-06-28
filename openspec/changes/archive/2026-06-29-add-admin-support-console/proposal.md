# add-admin-support-console

## Why
PaidSoon already has a secure platform admin shell, audit logging, and a limited diagnostics workflow, but operators still need to jump between the database, deployment logs, and external consoles to resolve common support issues. That creates slow incident handling and unnecessary operational risk. This change expands the existing admin area into a controlled support console so the platform owner and delegated staff can diagnose and remediate tenant issues safely inside the application.

## What Changes
The admin area becomes a broader operational console with distinct modules for platform health, tenant search and detail, user support, accounting integration review, invoice and reminder support, email delivery inspection, job queue review, billing state, feature flags, support timeline, and safe data corrections. The proposal keeps the console strictly scoped to audited support actions and reuses the current `/admin` and `/api/admin/*` structure rather than introducing a separate backdoor path.

Key changes include:
- Expand the admin overview into a platform-wide health dashboard with urgent issue surfacing.
- Extend tenant and user support views so an operator can inspect identity, membership, subscription, automation, and error history in one place.
- Add operational actions for safe retries, pausing/resuming automation, reprocessing syncs, resending invites, and correcting supported data fields.
- Add admin inspection for accounting integrations, invoices, reminders, email delivery, jobs, and billing state with masked sensitive values.
- Add tenant-level feature override controls and an immutable support timeline built from audited events.
- Keep impersonation, if used, explicit and time-limited, with a visible support banner and no access to secrets or payment-sensitive data.
- Maintain strict access controls, strong re-authentication for risky operations, and immutable audit logging for every admin action.

## Impact
This change broadens the existing admin console, admin APIs, and audit model. It will likely require new or expanded server-rendered admin pages, additional `/api/admin/*` endpoints, richer tenant snapshot queries, more audit event types, and updated documentation and tests. It does not add a general-purpose database editor and it does not weaken tenant isolation.

## Out of Scope
- No unrestricted SQL editor.
- No raw secret, API key, or OAuth token exposure.
- No silent impersonation.
- No bypass of tenant RLS or cross-tenant access.
- No replacement of Stripe, Supabase, or accounting provider admin consoles.
- No implementation of unrelated product features.

## Security Considerations
The support console MUST remain a controlled operational surface. Admin access MUST require the existing layered admin guard, strong authentication, and role-based authorization. Sensitive actions SHOULD require re-authentication and a reason. Every action MUST be audited. The console MUST NOT expose plaintext OAuth tokens, payment card data, or raw credentials. Any support-session or impersonation capability MUST be visible in the UI and time-limited.

## Risks
- The console could become a de facto back office if scope expands without control boundaries.
- Additional admin actions increase the blast radius of operator mistakes.
- More aggregate reads may increase load on the primary database.
- Any new correction workflow risks accidental data mutation if confirmation and validation are weak.
- If support actions are not consistently audited, incident review becomes unreliable.

## Rollout Plan
1. Land the proposal and specs first, without implementing new runtime behavior.
2. Review the existing admin data model, audit model, and guard boundaries against the proposed support actions.
3. Implement backend support endpoints before exposing UI affordances for risky actions.
4. Add the tenant, invoice, integration, email, job, billing, and timeline pages in phases.
5. Enable feature flags or route gating for any especially risky support actions during rollout.
6. Validate access control, masking, audit logging, and support-state recovery in tests before broad use.

## Acceptance Criteria
- Admins can diagnose tenant sync, email, billing, and automation issues without database access.
- Admins can retry failed syncs, jobs, and emails from the UI.
- Admins can pause and resume reminder automation safely.
- Admins can inspect invoice and debtor reminder state without exposing raw secrets.
- Admins can resolve common login and invite problems from the UI.
- Admins can inspect Stripe billing state and reconcile it with support actions.
- Every admin action is audited with actor, target, reason, and request correlation details.
- Sensitive actions require confirmation and a reason.
- Admin access is protected by strong authentication and role checks.
- No unrestricted SQL or database editor is exposed.
- Tests cover role boundaries, masking, confirmations, and audit logging.
