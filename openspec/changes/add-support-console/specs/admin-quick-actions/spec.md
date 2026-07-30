## ADDED Requirements

### Requirement: Support staff can perform admin actions with a required reason field

The system SHALL provide endpoints under `/api/admin/customers/[userId]/actions/*` that allow `platform_admin` and `platform_owner` to modify customer data: edit invoice schedule, pause/resume all invoices, trigger manual email sends, and mark invoices as paid. Each endpoint SHALL require a `reason` field (text, max 500 characters) in the request body. The reason SHALL be stored in the `AdminAuditEvent` record in the `reason` field. These endpoints do NOT require an active impersonation session.

#### Scenario: Support staff edits customer's email schedule with required reason
- **WHEN** a `platform_admin` POSTs to `/api/admin/customers/[userId]/actions/edit-schedule` with:
  ```json
  {
    "email1DaysAfterDue": 5,
    "email2DaysAfterDue": 12,
    "email3DaysAfterDue": 25,
    "reason": "Customer reported emails arriving too late; adjusted per support ticket #1234"
  }
  ```
- **THEN** the system updates the `Schedule` record
- **AND** an `AdminAuditEvent` is created with:
  - `action`: `update_schedule`
  - `targetUserId`: the customer's userId
  - `reason`: the provided reason
  - `details`: old and new values (e.g., `{old: [3,10,21], new: [5,12,25]}`)
  - `resourceId`: the Schedule ID

#### Scenario: Support staff pauses all invoices for a customer
- **WHEN** a `platform_admin` POSTs to `/api/admin/customers/[userId]/actions/pause-invoices` with:
  ```json
  {
    "reason": "Customer cashflow issue; pausing until further notice"
  }
  ```
- **THEN** the system updates all `TrackedInvoice` records with `status: 'paused'`
- **AND** an `AdminAuditEvent` is logged with action `pause_invoices`, target customer, and reason
- **AND** the `details` field includes the count of invoices paused (e.g., `{count: 14}`)

#### Scenario: Support staff triggers a manual email send
- **WHEN** a `platform_admin` POSTs to `/api/admin/customers/[userId]/actions/send-email` with:
  ```json
  {
    "invoiceId": "inv-4521",
    "stage": 1,
    "reason": "Initial email failed to deliver; resending Stage 1"
  }
  ```
- **THEN** the system calls `sendFollowUpEmail(invoiceId, stage)`
- **AND** an `AdminAuditEvent` is logged with action `trigger_email`, targetUserId, invoiceId, and reason
- **AND** if the email send fails, the audit event captures the error in `details.error`

#### Scenario: Support staff marks an invoice as paid
- **WHEN** a `platform_admin` POSTs to `/api/admin/customers/[userId]/actions/mark-invoice-paid` with:
  ```json
  {
    "invoiceId": "inv-4521",
    "reason": "Customer confirmed payment received; marked as resolved"
  }
  ```
- **THEN** the system updates `TrackedInvoice.status = 'paid'`
- **AND** an `AdminAuditEvent` is logged with action `mark_invoice_paid`, targetUserId, invoiceId, and reason
- **AND** the invoice email sequence is stopped (no more emails for this invoice)

#### Scenario: Reason field is required and validated
- **WHEN** a `platform_admin` POSTs to `/api/admin/customers/[userId]/actions/*` without a `reason` field
- **THEN** the system returns 400 Bad Request with error: "reason field is required"
- **AND** no modification is made
- **AND** no `AdminAuditEvent` is created

#### Scenario: Reason must be at least 10 characters
- **WHEN** a `platform_admin` POSTs with `reason: "fix"`
- **THEN** the system returns 400 Bad Request with error: "reason must be at least 10 characters"
- **AND** no change is made
- **AND** no `AdminAuditEvent` is created

### Requirement: Admin actions panel is visible in customer profile view

The system SHALL display a "Quick Actions" panel on `/admin/customers/[userId]` with buttons for: [Edit Schedule], [Pause All Invoices], [Resume All Invoices], [Send Email Stage 1/2/3], [Mark as Paid (per invoice)]. Each action SHALL open a confirmation modal with the reason field pre-focused.

#### Scenario: Support staff modifies customer schedule from UI
- **WHEN** a `platform_admin` navigates to `/admin/customers/[userId]` and clicks [Edit Schedule]
- **THEN** a modal opens with fields: email1DaysAfterDue, email2DaysAfterDue, email3DaysAfterDue, and a required `reason` text area
- **AND** clicking [Confirm] submits the action with the reason
- **AND** the modal shows a success message: "Schedule updated"
- **AND** the customer profile refreshes with the new schedule values
