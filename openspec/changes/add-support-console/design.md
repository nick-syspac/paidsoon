## Context

Support requires the ability to troubleshoot customer issues without screen sharing. The operator needs to search for customer accounts, view their data, and make changes on their behalf—all while maintaining a complete audit trail for compliance (7-year retention) and incident investigation.

The system uses `prismaAdmin` (blanket database access bypassing RLS) as the data access layer. Rather than enforce row-level isolation for support queries, the design relies on audit logging as the primary control: every search, impersonation, and action is logged with who did it, when, why, and what changed.

Key stakeholders: solo operator (initially you), future support team members, customers (indirectly—they can request audit logs to see what support accessed).

## Goals / Non-Goals

**Goals:**
- Enable one-person support operations (troubleshooting, account recovery, schedule adjustments)
- Maintain full audit transparency: every support action is logged, traceable, and explainable to customers
- Support future multi-seat support teams (role-based access, per-person action logs)
- Comply with 7-year log retention requirements (cold archival strategy)
- Minimize performance impact on production (archival doesn't slow down active queries)

**Non-Goals:**
- Implement per-customer support queues or ticket assignment
- Build customer-facing audit log export (internal only for now)
- Support role-based permission granularity within support staff (all support staff see all data initially)
- Real-time streaming of support activity (batch logging is acceptable)

## Decisions

### 1. Data Access: Blanket `prismaAdmin` for Support Queries

**Decision:** Support console queries use `prismaAdmin` (bypass RLS), not user-scoped `withUserContext`.

**Rationale:**
- Support needs to search across all customers quickly without N queries
- RLS policies designed for tenant isolation, not support workflows
- Audit trail is the actual safety control, not RLS

**Alternatives:**
- Use `withUserContext` per customer: requires separate query per customer, slower, undermines RLS design
- Implement support-specific RLS policies: adds schema complexity, doesn't solve the need

**Tradeoffs:**
- Increased trust required: support staff can see all data, but it's all logged
- Simplifies code: no need for filtered queries, no n+1 loops
- Clear intent: `prismaAdmin` usage in support features is obviously elevated and auditable

### 2. Impersonation: Read-Only Redirect to Customer Dashboard

**Decision:** Impersonation redirects support staff to customer's `/dashboard` with a read-only overlay banner, preventing clicks on action buttons.

**Rationale:**
- Customers see exactly what we see (builds trust)
- Read-only guarantee (can't accidentally modify during troubleshooting)
- Clear separation: diagnosis (impersonation) vs. fixes (admin actions)

**Alternatives:**
- Show data in admin console (not their dashboard): decoupled from customer UX, harder to diagnose
- Allow modifications during impersonation: audit trail still works, but dangerous (easy to forget you're support)

**Tradeoffs:**
- Redirects break admin session flow (need "back" button)
- Read-only limits quick fixes (must exit impersonation to modify)
- Customers could theoretically detect impersonation (session starts/stops), but benefit is transparency

### 3. Admin Actions: Separate from Impersonation, Logged Independently

**Decision:** Modifications happen in the admin console after exiting impersonation. Each action requires a reason/note and is logged separately.

**Rationale:**
- Prevents accidental modifications while viewing customer data
- Required notes create habit of explaining changes (better support hygiene)
- Clearer audit trail: "support searched → impersonated → exited → modified schedule with reason"

**Alternatives:**
- Allow modifications during impersonation: simpler flow, riskier
- No reason field: faster, but hard to justify actions retroactively

**Tradeoffs:**
- Extra clicks (exit impersonation, fill reason, execute)
- Reason field is friction, but intentional (forces thoughtfulness)

### 4. Audit Logging: Link Sessions to Events

**Decision:** Each `AdminSession` (impersonation) can have multiple `AdminAuditEvent` rows linked via `adminSessionId`. Separate "customer search" audit events before impersonation starts.

**Rationale:**
- Coherent context: "here's the impersonation session, here are the 4 actions taken during it"
- Supports compliance queries: "what did support do in customer X's account on date Y?"
- Scales to multi-person teams (each person's session/actions are isolated)

**Alternatives:**
- Flat event log with user/customer/time: loose coupling, harder to reconstruct workflows
- Session-only logging (no per-action events): can't see what happened within the session

**Tradeoffs:**
- One more relation to manage in schema
- Requires cleanup: end `AdminSession` to finalize audit context

### 5. Audit Retention & Archival: Three Tiers with S3 Cold Storage

**Decision:**
- **Active** (0–90 days): Full Postgres table, indexed for fast UI queries
- **Warm** (90 days–2 years): Still in Postgres, optimized queries only
- **Cold** (2–7 years): S3 (Parquet format, compressed), no real-time access
- **Auto-delete** (>7 years): Scheduled purge from S3

**Rationale:**
- Compliance: 7-year retention is legally required
- Performance: Active logs stay fast; old data doesn't bloat the database
- Cost: S3 storage ~$0.05/GB/month; cheaper than 7 years of Postgres
- Automation: Cron job handles migration daily, no manual intervention

**Alternatives:**
- Keep all 7 years in Postgres: database bloat, increasing query slowness over time
- Aggregate/summarize old logs: lose detail needed for incident investigation
- Delete after 2 years: legal/compliance risk

**Tradeoffs:**
- Operational overhead: cron job, S3 bucket management
- Cold data isn't queryable (export and load into temp table if needed)
- Archival adds latency (daily job moves data, not instant)

### 6. Optional Customer Notification on Impersonation

**Decision:** Each impersonation has a checkbox "Notify customer of this access?" If checked, transactional email is sent after session ends.

**Rationale:**
- Transparency for routine troubleshooting (customer consent)
- Audit: "I told the customer I accessed their account"
- Optional: not all access needs notification (internal investigation, obvious customer is aware)

**Alternatives:**
- Always notify: customer email fatigue, support overhead
- Never notify: loses transparency benefit
- Notify on first access only: incomplete audit trail

**Tradeoffs:**
- Email template must be clear and non-alarming
- Could enable customer to detect patterns of support access (security pro/con)
- Adds email volume (not huge, but real)

### 7. Staff Roles: platform_support Has Blanket Search/Impersonate, platform_admin Does Everything

**Decision:**
- `platform_support`: Can search customers, impersonate (read-only), view audit logs
- `platform_admin`: Can do all of above + perform admin actions (schedule changes, force emails, etc.)
- `platform_owner`: Can do all of above + manage staff roles

**Rationale:**
- Scales to multi-person teams: junior support staff (read-only), senior support + admin actions
- `platform_owner` remains apex role for access control

**Alternatives:**
- All support roles equal: doesn't scale, no privilege separation
- Granular permissions per action: over-engineered for MVP (only you)

**Tradeoffs:**
- Role-based checks add minor complexity
- Future proof for scaling (ready for team expansion)

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| **Support account compromise exposes all customer data** | IP logging in audit events; email notifications on access; device registration (future); device anomaly detection |
| **Audit log table grows unbounded (Postgres bloat)** | Archival strategy moves old data off; warm archive retention policy (2 years max) |
| **S3 archival fails silently; data lost** | Archival job logs results to Slack/email; verify record count before deleting from Postgres; archive integrity checks (checksums) |
| **Customer notification emails leak account details** | Email template carefully worded; no sensitive data in subject; only email address / timestamp in body |
| **Support staff forget to set impersonation notification**| Default to "notify" (safer default); can disable for specific access reasons |
| **Performance: searching 100k+ customers is slow** | Full-text search on email; index on (userId, createdAt) for audit queries |
| **Archival cron job misses runs (server downtime)** | Cron job idempotent (safe to re-run); monitor job success; alert on miss |

## Migration Plan

**Phase 1: Database Schema (Day 1)**
- Add `adminSessionId`, `targetUserId`, `reason`, `resourceId`, `details` to `AdminAuditEvent`
- Add `impersonatedUserId`, `notificationSent` to `AdminSession`
- Create migration, deploy, verify RLS policies (new fields must be audit-only, not RLS-governed)

**Phase 2: Audit Middleware (Day 2–3)**
- Wrap support queries in logging: record search, user, timestamp
- Wrap admin actions in logging: record action type, target, changes, reason
- Unit tests for audit trail capture

**Phase 3: Customer Search UI (Day 4–5)**
- Create `/admin/customers` page
- Search form (email input, debounced query)
- Results list (email, tier, subscription status, invoices, last activity)
- Impersonate + Audit Log buttons per result

**Phase 4: Impersonation System (Day 6–7)**
- Create `/api/admin/impersonation/start` endpoint (creates `AdminSession`)
- Redirect to customer dashboard with "Support Mode" banner
- Create `/api/admin/impersonation/end` endpoint (closes session)
- Test read-only: button clicks disable/log in UI

**Phase 5: Admin Quick-Actions (Day 8–10)**
- Create `/api/admin/customers/[userId]/actions/*` endpoints (edit schedule, pause/resume, trigger emails)
- Add reason field to action forms (required)
- Quick-actions sidebar in `/admin/customers` detail view
- Audit logging on each action

**Phase 6: Audit Archival Infrastructure (Day 11–13)**
- Set up S3 bucket (versioning enabled, lifecycle rules)
- Write archival cron job: query old events, export to Parquet, upload to S3, verify, delete from Postgres
- Deploy job to Vercel Cron
- Test with dummy data: archival → cold storage → retrieval

**Phase 7: Optional Features (Day 14+)**
- Customer notification emails (audit event type, delivery tracking)
- Staff activity feed on admin dashboard
- Advanced search filters (date range, action type, staff member)

**Rollback Strategy:**
- Archival cron: disable job, re-import Parquet from S3 back to Postgres (idempotent merge)
- UI changes: revert to previous version (no schema dependencies)
- Schema: if critical bug, rollback migration (preserve audit data, disable new fields)

## Open Questions

1. **S3 Bucket Setup**: Who owns the AWS account? Is it in the PaidSoon infrastructure, or your personal account? Bucket name, access control?

2. **Customer Notification Email**: Should notification happen immediately after impersonation ends, or batch nightly? Template content?

3. **Audit Log Search in UI**: Phase 6 doesn't include a searchable audit log viewer—is that needed for MVP, or Phase 7?

4. **Staff Device Registration**: Decision notes say "not needed initially," but should support staff set up SSH keys for elevated sessions (like for admin features)? Or is email-based challenge sufficient?

5. **Archival Performance**: What's the acceptable query latency for cold archive retrieval? If customer requests 3-year-old audit log, acceptable to wait 5 minutes for export?

6. **Role Hierarchy**: Should `platform_admin` be able to revoke/downgrade `platform_owner`, or only within support roles?
