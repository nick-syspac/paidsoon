## Why

The MVP launched with a basic admin dashboard that supports platform-level role management but no customer support tooling. As the solo operator, you need to troubleshoot customer issues without screen sharing—searching for accounts, viewing their data, and making changes on their behalf, all with complete audit transparency.

This change introduces a customer support console that enables you to diagnose and resolve customer issues directly by searching accounts, impersonating (read-only to their dashboard), and performing administrative actions (schedule adjustments, email triggers, invoice management) with full logging.

## What Changes

- **NEW**: Customer search and lookup interface accessible from admin dashboard
- **NEW**: Read-only impersonation that redirects support staff to customer's `/dashboard`
- **NEW**: Admin quick-actions panel for direct modifications (with required reason/note)
- **NEW**: Enhanced audit logging linking impersonation sessions to individual actions
- **NEW**: Optional customer notification when support staff access their account
- **NEW**: 7-year audit log retention with automated archival to S3 (cold storage after 2 years)
- **NEW**: Staff activity feed showing recent impersonations and actions
- **MODIFIED**: `AdminSession` to track which customer is being impersonated
- **MODIFIED**: `AdminAuditEvent` to link to impersonation session and capture action reason

## Capabilities

### New Capabilities

- `customer-search`: Search for customer accounts by email; display tier, subscription status, invoice count, and last activity
- `staff-impersonation`: Read-only impersonation redirecting to customer dashboard; all views are audit-logged with duration and optional customer notification
- `admin-quick-actions`: Direct modification actions (edit schedule, pause/resume, trigger emails, mark invoices paid) with required reason field; each action audit-logged separately
- `audit-session-linking`: Link individual audit events to impersonation sessions for coherent troubleshooting context
- `audit-log-retention`: 7-year retention policy with automated archival: active in Postgres (0-90 days), warm archive in Postgres (90 days - 2 years), cold archive in S3 (2-7 years)
- `staff-activity-feed`: Display recent support actions and impersonations with timestamps, customer, and actions taken

### Modified Capabilities

- `admin-audit-logging`: Enhanced to track reason/note on all admin actions, link sessions to events, and capture modification target details

## Impact

- **Schema**: Add fields to `AdminAuditEvent` (`adminSessionId`, `targetUserId`, `reason`, `resourceId`, `details`); add field to `AdminSession` (`impersonatedUserId`); optional notification flag
- **Infrastructure**: New cron job for daily audit log archival to S3 (Vercel Cron)
- **API**: New endpoints under `/api/admin/customers/*` for search, impersonation control
- **UI**: New `/admin/customers` page with search interface; staff activity feed widget; quick-actions sidebar
- **Permissions**: `platform_admin` and `platform_support` roles can search and impersonate; `platform_owner` can also perform admin actions (initially); actions logged per-user
- **Email**: Optional transactional email sent to customer when impersonation occurs (if flag set)
- **Audit trail**: Every search, impersonation, and action logged with staff user ID, timestamp, reason, and resource details
