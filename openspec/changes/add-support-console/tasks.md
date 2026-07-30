## 1. Database Schema & Migrations

- [x] 1.1 Update Prisma schema: add `adminSessionId`, `targetUserId`, `resourceId`, `details`, `reason` to `AdminAuditEvent`
- [x] 1.2 Update Prisma schema: add `impersonatedUserId`, `notifyCustomer`, `duration`, `actionCount` to `AdminSession`
- [x] 1.3 Create Prisma migration: `npx prisma migrate dev --name "add_support_console_fields"`
- [x] 1.4 Update `prisma/rls-policies.sql`: add RLS rules for new fields (audit-only, no SELECT on new columns for authenticated users)
- [x] 1.5 Run `npm run verify-rls` to confirm RLS policies apply correctly
- [x] 1.6 Generate Prisma types: `npx prisma generate`
- [x] 1.7 Create `AuditRetentionLog` model: id, timestamp, records_archived, s3_path, success, error_message

## 2. Audit Logging Infrastructure

- [x] 2.1 Create `lib/admin/audit.ts`: helper functions to create audit events (capture IP, user agent, actor context)
- [x] 2.2 Export audit creation functions for use in route handlers
- [x] 2.3 Add new action enum values to Zod schema: customer_search, impersonate_start, impersonate_end, trigger_email, etc.
- [ ] 2.4 Create middleware/interceptor to auto-log failed admin API calls (401/403 responses)
- [ ] 2.5 Update `lib/admin/session.ts` to create `impersonate_start` event when session starts
- [ ] 2.6 Update `lib/admin/session.ts` to create `impersonate_end` event when session ends
- [ ] 2.7 Add automatic `adminSessionId` context propagation (thread-local or request-scoped) during impersonation

## 3. Customer Search Endpoints & UI

- [x] 3.1 Create `app/api/admin/customers/search/route.ts` GET handler: query UserProfile by email, return paginated results with audit logging
- [x] 3.2 Add Zod schema for search query validation: `q` (min 3 chars), pagination
- [x] 3.3 Create `app/admin/(protected)/customers/page.tsx`: search UI with input field (debounced), results list, pagination
- [x] 3.4 Create `app/admin/(protected)/customers/[userId]/page.tsx`: customer detail view with profile summary, invoice list, impersonation/audit buttons
- [x] 3.5 Style: match admin dark theme (dark background, gray/white text, blue accent buttons)
- [x] 3.6 Add [Impersonate] and [View Audit Log] buttons to customer detail view
- [x] 3.7 Add quick stats: subscription tier, status, invoice count, last activity date
- [x] 3.8 Create `app/admin/(protected)/customers/[userId]/audit/page.tsx`: paginated full audit trail for a customer
- [ ] 3.9 Test: search by partial email, verify pagination works, verify audit events created for searches

## 4. Impersonation System

- [x] 4.1 Extend `app/api/admin/impersonation/start/route.ts` POST handler: accept `userId` + `notifyCustomer`, create `AdminSession.impersonatedUserId`, return redirectUrl
- [x] 4.2 Add Zod schema for impersonation start: `userId`, `notifyCustomer` (boolean, optional, default false)
- [x] 4.3 Create impersonation redirect URL: `/dashboard?support_view=true&support_session=<sessionId>`
- [x] 4.4 Extend `app/api/admin/impersonation/end/route.ts` POST handler: close support session, calculate duration/actionCount, return redirectUrl
- [x] 4.5 Create `components/admin/ImpersonateButton.tsx` client component: calls start API, follows redirectUrl
- [x] 4.6 Add [End Support Session] button via `components/dashboard/SupportBanner.tsx` client component
- [x] 4.7 Add support banner to `/dashboard` layout: displayed when `support_view=true` query param is present
- [ ] 4.8 Disable all action buttons (UI-level) during support mode (check `support_view` query param in each action component)
- [ ] 4.9 Add automatic session timeout: 60-min inactivity timer on support banner, calls end API and logs `impersonate_timeout`
- [ ] 4.10 Test: start impersonation, verify read-only banner, end session, verify redirected back to admin customer profile
- [ ] 4.11 Test: verify audit events linked to impersonation session (impersonate_start → impersonate_end)

## 5. Admin Quick-Actions & Modifications

- [ ] 5.1 Create `app/api/admin/customers/[userId]/actions/edit-schedule/route.ts` POST: update Schedule with reason validation
- [ ] 5.2 Create `app/api/admin/customers/[userId]/actions/pause-invoices/route.ts` POST: pause all TrackedInvoices with reason
- [ ] 5.3 Create `app/api/admin/customers/[userId]/actions/resume-invoices/route.ts` POST: resume all TrackedInvoices with reason
- [ ] 5.4 Create `app/api/admin/customers/[userId]/actions/trigger-email/route.ts` POST: send email for specific invoice/stage with reason
- [ ] 5.5 Create `app/api/admin/customers/[userId]/actions/mark-invoice-paid/route.ts` POST: mark invoice as paid with reason
- [ ] 5.6 Add Zod schema for all action endpoints: validate `reason` (required, min 10 chars)
- [ ] 5.7 Add audit logging to each action endpoint: capture old/new values in `details`, action type, targetUserId, resourceId, reason
- [ ] 5.8 Ensure all actions use `prismaAdmin` (blanket access, no RLS)
- [ ] 5.9 Create UI modals for each action: confirmation dialog with reason text area (pre-focused), submit button
- [ ] 5.10 Add Quick Actions sidebar to `/admin/customers/[userId]`: buttons for each action
- [ ] 5.11 Add current schedule display: shows email1, email2, email3 days with [Edit] button
- [ ] 5.12 Add invoice list with per-invoice action buttons: [Mark as Paid], [Pause], [Resume], [Force Send Email]
- [ ] 5.13 Test: perform each action, verify reason is required and validated, verify audit events created with correct details

## 6. Customer Notification on Impersonation

- [ ] 6.1 Update impersonation start endpoint: if `notifyCustomer = true`, queue email for sending after session ends
- [ ] 6.2 Update impersonation end endpoint: check if notification is queued and send via Resend
- [ ] 6.3 Create email template: "Support Access Notification" with customer-friendly wording
- [ ] 6.4 Add notification flag to `AdminAuditEvent.details` (track whether customer was notified)
- [ ] 6.5 Test: send impersonation notification, verify email received, verify audit trail captures notification

## 7. Staff Activity Feed

- [ ] 7.1 Create `app/api/admin/activity-feed/route.ts` GET handler: return recent audit events (last 48 hours) grouped by session
- [ ] 7.2 Add pagination and filtering: `days` (default 2), `limit` (default 20)
- [ ] 7.3 Create activity feed component: `components/admin/StaffActivityFeed.tsx`
- [ ] 7.4 Display impersonation sessions: customer name, duration, action count, timestamp
- [ ] 7.5 Display direct admin actions: action type, customer, reason, timestamp
- [ ] 7.6 Display customer searches: count, query, timestamp
- [ ] 7.7 Add summary stats: "You've worked with X customers today (Y searches, Z impersonations, W actions)"
- [ ] 7.8 Add grouping by day: "Today", "Yesterday", etc.
- [ ] 7.9 Make each entry clickable to view full audit details: `/admin/audit-log/[sessionId]` or `/admin/audit-log/[eventId]`
- [ ] 7.10 Create `/admin/audit-log/[sessionId]/page.tsx`: show all events within a session, with linked session context
- [ ] 7.11 Create `/admin/audit-log/[eventId]/page.tsx`: show single event with full details (changes, reason, target, resources)
- [ ] 7.12 Add the activity feed widget to `/admin` dashboard overview
- [ ] 7.13 Test: verify activity feed populated after impersonations and actions, verify linking to detail views

## 8. Audit Log Retention & Archival

- [ ] 8.1 Create S3 bucket (if not existing): enable versioning, set lifecycle rules (delete after 7 years)
- [ ] 8.2 Create IAM policy for Vercel Cron job: allow PutObject, GetObject, DeleteObject on S3 audit logs path
- [ ] 8.3 Create archival cron job: `app/api/cron/archive-audit-logs/route.ts`
- [ ] 8.4 Implement archival logic:
  - Query `AdminAuditEvent` with `createdAt < now() - 90 days`
  - Export to Parquet format (use `parquetjs` or similar)
  - Upload to S3: `s3://paidsoon-audit-logs/YYYY/MM/DD-audit.parquet`
  - Verify record count matches (integrity check)
  - Delete from warm archive table
  - Log results to `AuditRetentionLog`
- [ ] 8.5 Make archival job idempotent: check if file exists, skip if already archived
- [ ] 8.6 Add error handling and retry logic: log failures, do NOT delete if archival failed
- [ ] 8.7 Register cron job in `vercel.json`: daily at 23:00 UTC
- [ ] 8.8 Create monitoring: alert if archival job fails on retry
- [ ] 8.9 Create `app/api/admin/audit-log/export/route.ts` GET handler: fetch cold archive from S3, return as downloadable file
- [ ] 8.10 Test locally: mock archival, verify Parquet file created, verify record integrity

## 9. Audit Log Querying & Viewing

- [ ] 9.1 Create `app/api/admin/audit-log/route.ts` GET handler: query audit events with filtering (targetUserId, action, sessionId, date range)
- [ ] 9.2 Add pagination support: cursor-based or offset-based
- [ ] 9.3 Add sorting: by timestamp (desc default)
- [ ] 9.4 Create `/admin/audit-log` page: searchable audit log viewer with filters
- [ ] 9.5 Implement session grouping: show sessions with child events collapsible
- [ ] 9.6 Test: query by customer, verify all sessions and actions returned; query by session, verify only that session's events returned

## 10. Integration Testing

- [ ] 10.1 Write integration test: customer search → impersonate → view dashboard → end impersonation → verify audit trail complete
- [ ] 10.2 Write integration test: admin actions (edit schedule, pause) → verify reason required → verify audit events created
- [ ] 10.3 Write integration test: archival job runs → verify events exported to S3 → verify deleted from warm archive
- [ ] 10.4 Write integration test: cold archive retrieval → verify export endpoint works
- [ ] 10.5 Test permission boundaries: `platform_support` can search/impersonate, cannot perform admin actions; `platform_admin` can do all
- [ ] 10.6 Test that impersonation is read-only: disable buttons, verify no modification possible via UI
- [ ] 10.7 Test session timeout: leave impersonation idle for 60+ minutes → verify auto-close and audit log

## 11. Documentation & Deployment

- [ ] 11.1 Document new admin API endpoints in `docs/DDD.md`: search, impersonation, quick-actions
- [ ] 11.2 Document audit log schema and fields in `docs/DDD.md`
- [ ] 11.3 Document archival strategy in `docs/runbooks/README.md`: retention tiers, S3 setup, manual export
- [ ] 11.4 Document support console workflows in `docs/admin-security.md` or new `docs/support-operations.md`
- [ ] 11.5 Update `docs/runbooks/README.md` with new environment variables (S3 bucket, archival settings)
- [ ] 11.6 Create runbook for manual archival recovery (if needed)
- [ ] 11.7 Test deployment to staging: verify archival cron runs, verify customer notification sends, verify audit logging works
- [ ] 11.8 Merge to production: verify all specs are implemented, all tests pass, all docs are updated
