## ADDED Requirements

### Requirement: Staff activity feed displays recent support actions

The system SHALL display a "Staff Activity" widget on the admin dashboard (`/admin` overview) showing recent support actions from the last 48 hours. The feed SHALL include: impersonation sessions (customer name, duration, timestamp), direct admin actions (type, customer, reason, timestamp), and customer searches (count, query, timestamp). Each entry SHALL link to full audit details.

#### Scenario: Activity feed shows recent impersonations
- **WHEN** support staff navigates to `/admin`
- **THEN** the "Staff Activity" widget displays:
  ```
  2026-06-30 14:32 – Impersonated: Sarah Chen (sarah@acme.com)
  Duration: 12 min | Actions: 3 | [View Details]
  
  2026-06-30 10:15 – Impersonated: Acme Inc (acme@company.com)
  Duration: 5 min | Actions: 1 | [View Details]
  ```
- **AND** each entry is clickable to expand full session details

#### Scenario: Activity feed shows recent admin actions
- **WHEN** support staff has performed direct actions
- **THEN** the feed also displays:
  ```
  2026-06-30 15:00 – Updated schedule for: Tech Startup Inc
  Reason: "Customer requested faster email reminders"
  
  2026-06-29 16:44 – Paused invoices for: SaaS Corp
  Reason: "Cashflow issue; customer requested pause"
  ```
- **AND** each action is clickable to view full audit trail (changes, timestamp, reason)

#### Scenario: Activity feed is grouped by day
- **WHEN** there are activities from today and yesterday
- **THEN** the feed displays section headers: "Today", "Yesterday", "Jun 28"
- **AND** activities are shown in reverse chronological order within each section

#### Scenario: Activity feed shows summary statistics
- **WHEN** the activity widget is loaded
- **THEN** a summary line shows: "You've worked with 7 customers today (3 searches, 2 impersonations, 2 actions)"

#### Scenario: Activity feed respects role permissions
- **WHEN** a `platform_support` user views the activity feed
- **THEN** they see only their own actions (not other staff actions, if multi-person in future)
- **AND** they cannot see audit details for customers they don't have access to (though today all support roles have access)

### Requirement: Audit details view shows linked session context

When a support staff member clicks on an audit event or session, they navigate to `/admin/audit-log/[sessionId]` or `/admin/audit-log/[eventId]`, which displays full details: all linked events within the session, duration, reason field, target customer, changes made, and timestamps.

#### Scenario: Clicking an impersonation shows all linked actions
- **WHEN** support staff clicks "View Details" on an impersonation session
- **THEN** the system navigates to `/admin/audit-log/session-123`
- **AND** displays:
  ```
  Session: 2026-06-30 14:32 – 14:44 (12 minutes)
  Staff: you (user-xyz)
  Customer: Sarah Chen (sarah@acme.com)
  
  Actions within session:
  ├─ 14:32:15 – impersonate_start (Notified customer)
  ├─ 14:32:40 – view_dashboard
  ├─ 14:33:10 – view_invoices
  ├─ 14:34:20 – view_settings
  └─ 14:44:00 – impersonate_end (Duration: 12 min)
  ```
- **AND** clicking on any action shows full details (resource ID, changes, etc.)

#### Scenario: Clicking a direct action shows context
- **WHEN** support staff clicks on a "Updated schedule" action
- **THEN** the system displays:
  ```
  Action: update_schedule
  Timestamp: 2026-06-30 15:00
  Staff: you (user-xyz)
  Customer: Tech Startup Inc (user-abc)
  Reason: "Customer requested faster email reminders"
  
  Changes:
  ├─ email1DaysAfterDue: 3 → 5
  ├─ email2DaysAfterDue: 10 → 8
  └─ email3DaysAfterDue: 21 → 18
  ```
