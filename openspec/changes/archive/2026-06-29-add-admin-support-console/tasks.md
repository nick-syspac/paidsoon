# Tasks

## 1. OpenSpec validation
- [x] Confirm the change folder uses the repo’s spec-driven OpenSpec schema.
- [x] Validate the proposal, design, and specs against existing OpenSpec conventions.

## 2. Admin data model/audit model review
- [x] Review the current admin tables, audit event types, and tenant-scoped entities for coverage gaps.
- [x] Identify any missing audit actions or support-state fields needed by the console.

## 3. Admin auth and roles
- [x] Review the current admin guard and role model for support-console coverage.
- [x] Confirm least-privilege role boundaries for read-only and mutating support actions.

## 4. Tenant admin screens
- [x] Design the admin overview dashboard for platform-wide operational health.
- [x] Design tenant search and tenant detail screens with safe, masked data.

## 5. User support screens
- [x] Design user search, invite recovery, login recovery, and membership management flows.
- [x] Define safe ownership transfer, disable, and unlock actions.

## 6. Integration admin screens
- [x] Define MYOB and Xero inspection views for status, token state, cursor state, and failures.
- [x] Define retry, reprocess, and sync-reset actions with confirmation and audit logging.

## 7. Invoice/reminder support screens
- [x] Define invoice search and invoice detail views for reminder state and delivery history.
- [x] Define pause, resume, resync, dispute, and schedule-regeneration actions.

## 8. Email delivery admin
- [x] Define sent, queued, failed, bounced, and suppressed email views.
- [x] Define resend, retry, suppression, and sender-status actions.

## 9. Job queue admin
- [x] Define worker and queue inspection views, including failed and dead-letter jobs.
- [x] Define retry, cancel, requeue, and stuck-job remediation actions.

## 10. Billing admin
- [x] Define Stripe billing inspection views for plan, usage, events, and subscription status.
- [x] Define sync, portal-link, trial, coupon, and subscription transition actions.

## 11. Feature flags
- [x] Define tenant-level feature overrides and the administrative controls around them.
- [x] Specify audit and confirmation rules for feature-flag changes.

## 12. Audit timeline
- [x] Define the support timeline event sources and ordering rules.
- [x] Specify immutable audit requirements and tenant-scoped event presentation.

## 13. Security hardening
- [x] Specify admin session freshness, re-authentication, and break-glass handling.
- [x] Specify masking, tenant isolation, and no-unrestricted-editor boundaries.

## 14. Testing
- [x] Specify tests for authorization, masking, confirmation, and audit coverage.
- [x] Specify tests for retry and remediation flows across tenants, integrations, emails, jobs, and billing.

## 15. Documentation
- [x] Update the architecture docs with the admin support console surface and security model.
- [x] Update the runbook documentation for operational support workflows.

## 16. Rollout
- [x] Plan phased enablement for support modules and risky actions.
- [x] Define rollback and emergency-disable conditions.
