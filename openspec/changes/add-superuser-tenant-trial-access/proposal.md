# Proposal

## Why

PaidSoon needs a safe, accountable way for its platform owner to extend evaluation access or restore it after expiry without incidentally charging customers or changing paid subscriptions. The existing Stripe-only trial extension lacks required reasons, owner-only authorization, retry safety, temporary access grants, and consistent entitlement enforcement.

## What Changes

- **Approved owner-internal-access follow-up (2026-10-18):** After real Stripe, eligible grant and bounded onboarding access, allow only an existing `active`, recognized-tier, unlinked profile whose own freshly database-verified platform role is exactly active `platform_owner`, with no blocking or unknown risk. Expose `platform_owner` as application access only, with no expiry or purchased/trial claim. Preserve catalog limits, customer behavior, auth/elevation guards and all provider/operation contracts. A narrow server-only privileged role-fact read is required because tenant roles cannot SELECT `platform_roles`; tenant data remains RLS-scoped. No database/provider access or mutation is authorized for this follow-up.
- Add “Manage trial access” to the existing tenant detail subscription section, with 7/14/30-day extensions, explicit expiry, required reason, optional notification defaulting off, granted-plan selection, and grant revocation.
- Use the existing single-owner tenant (`UserProfile.userId`) as the customer organisation, as confirmed by the user. Preserve tenant isolation and do not introduce organisation memberships. Only elevated `platform_owner` is the superuser.
- Extend suitable still-trialing Stripe subscriptions through the pinned server integration. Separately persist explicit PaidSoon-only grants for expired or otherwise eligible non-paid tenants; never fabricate Stripe trial dates or create/restart subscriptions.
- Centralize effective access, source, plan, expiry, feature and quota decisions across pages, API routes, and scheduled/internal jobs. Grants expire at read/execution time, without cleanup. Paid access wins; delinquency and billing disputes cannot be bypassed.
- Persist operation idempotency, optimistic concurrency, mandatory append-only audit records, and independently retryable notification delivery. Reconcile delayed, failed, duplicate, and out-of-order Stripe webhooks.
- **Approved planning extension (2026-10-15):** Add a distinct durable `TenantBillingMutation` journal and customer-mutation reservation to make task 3.6 safe before provider calls, not merely during projection. Coordinate customer creation, Checkout/session creation, upgrades, local onboarding cancellation, downgrade schedule creation/update/release and portal-session creation with owner trial reservations. Preserve unknown outcomes across crashes and expose authenticated, tenant-scoped status/recovery without arbitrary provider requests.
- **BREAKING (privileged API only):** Replace the existing unrestricted elevated-role extension contract with owner-only authorization and required reason, operation key, and state version. Keep its URL as a compatibility adapter to the safe Stripe-extension service; unsafe legacy payloads are rejected.

### Explicit non-scope

No Django/new backend framework, shared organisation/team rollout, public plan/pricing changes, hidden Accountant Partner grants, unrestricted entitlements, new automatic trial signups, incidental checkout/charges, subscription cancellation/resumption, debt forgiveness, or general-purpose support-console rewrite. Existing billing resolution and `past_due` grace behavior remain available, but grants cannot enhance or replace delinquent access. Existing Stripe-backed checkout remains authoritative for Stripe trials.

The extension hardens existing customer billing flows; it does not add cancellation/resumption behavior, change pricing/proration/trial offers, or make customers administrative trial actors. Customer mutation requests acquire an operation UUID/version safety envelope; successful result shapes remain compatible, while unknown outcomes return 202 and conflicts return 409. Session creation completion is not subscription completion and does not reserve a tenant throughout the hosted flow.

## Capabilities

### New Capabilities

- `admin-trial-access`: Tenant-scoped superuser trial management, eligibility, time-based grants, safe operations, mandatory audit and optional notifications.

### Modified Capabilities

- `admin-corrective-actions`: Replace diagnostic-only trial extension with owner-only safe management; preserve unrelated corrective actions.
- `admin-tenant-detail`: Add grant/effective-access information and source-aware management to the tenant detail surface.
- `stripe-status-based-access-control`: Recognize explicitly granted application access separately from Stripe billing status, consistently applying its plan and expiry.
- `stripe-billing-state-reconciliation`: Coordinate lifecycle reconciliation with administrative and durable customer mutations, scoped recovery and delayed hosted-flow completion; preserve grants without allowing obsolete snapshots to undo extensions.
- `chase-volume-entitlement`: Use effective granted plans and stable grant windows; expired access stops sending even for sequences already underway, while capacity alone still does not interrupt them.

## Impact

- Admin: existing protected tenant page, subscription/diagnostic action components, tenant snapshot, elevation guard, and audit helper. All trial endpoints must enforce owner role, including the old extension URL.
- Billing: `lib/billing.ts`, subscription presentation, dashboard profile/layout and settings, direct tier/limit consumers, Stripe subscription helper, checkout-success reconciliation and billing webhook. Current status-only access baseline is intentionally extended with an explicit grant source; grants do not rewrite Stripe-synchronized fields.
- Jobs/email: Vercel reminder/summary/digest and financial-module jobs, internal execution routes, email sending/AI quota helpers, and Railway worker selection SQL. Broad candidate selection plus authoritative execution-time checks prevents granted tenants being skipped or expired grants being used.
- Database: additive Prisma models for grants, owner operation journal, distinct customer billing-mutation journal, notification delivery and billing-risk reconciliation, tenant state version and mutually exclusive reservations, matching RLS/grants and generated migration. Customer ownership/access reads use `withUserContext`; verified customer billing writes use a narrowly justified server-only service, not a fabricated admin session. Both journals remain server-only. Audit remains in `AdminAuditEvent` for owner actions, with a mandatory transactional path rather than the current error-suppressing helper.
- Validation: mocked Node tests, UI verification, type/lint checks, and explicit live-development RLS isolation verification; unit tests never call real Stripe, Resend or databases.
- Risks: external Stripe mutation and database commits are not atomic; durable pre-call reservations, immutable per-step requests/keys, fencing and provider evidence must protect both customer and owner operations. Stripe keys may expire after 24 hours; unknowable creates must remain blocked rather than recreated blindly. Delayed Checkout/portal lifecycle state may reconcile without clearing another unresolved operation or replacing a newer binding. Original webhook/risk baseline gaps are addressed by tasks 3.1–3.5; task 3.6 still lacks the approved customer journal and pre-call protection.
- Compatibility/deployment: no data-owner migration or new secrets/frameworks expected. Existing signup creates local pre-checkout trial dates despite the Stripe-first spec; retain that legacy onboarding trial as a separate bounded source, not a Stripe trial. Document the coexistence explicitly and prevent stale/default status from granting unbounded access.
- Approval boundary: the 2026-10-15 follow-up authorizes the task-3.8 offline schema-to-schema Prisma migration generation alternative, separate supplemental CHECK SQL, static contract tests and documentation only. Leave all SQL unapplied; no database connection, `migrate dev`, install or shared application is authorized. Isolated migration/constraint/RLS validation remains pending rather than waived. Any future database-backed generation requires confirmed isolated scratch/shadow targets through the canonical adapter, never shared development/Preview/production. Review generated SQL, supplemental CHECKs, RLS and deployment order before separately authorizing shared-environment application.
