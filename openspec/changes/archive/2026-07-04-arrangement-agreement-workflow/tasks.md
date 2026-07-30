## 1. Domain and Data Model

- [x] 1.1 Add arrangement persistence models (arrangement header plus invoice coverage) and generate Prisma client updates
- [x] 1.2 Define arrangement lifecycle and type fields needed for full-payment, partial-payment, and instalment-plan agreements
- [x] 1.3 Add tenant-safe constraints so one arrangement cannot mix invoices from different debtors or different users
- [x] 1.4 Add migration and RLS policy updates for new arrangement tables and relationships

## 2. Arrangement APIs and Validation

- [x] 2.1 Add authenticated dashboard API endpoint(s) to create single-invoice and multi-invoice freelancer-managed arrangements
- [x] 2.2 Add server-side validation for allowed arrangement structures (full, partial, instalment) and debtor-consistency rules
- [x] 2.3 Add arrangement update endpoints for lifecycle transitions (active, broken, fulfilled, expired)
- [x] 2.4 Keep public promise endpoint limited to single-invoice commitments and reject partial, instalment, or multi-invoice arrangement attempts

## 3. Reminder Engine Integration

- [x] 3.1 Update reminder eligibility logic to suppress scheduled sends for invoices covered by active arrangements
- [x] 3.2 Add breach/expiry detection logic so arrangement-covered invoices resume reminder eligibility automatically
- [x] 3.3 Ensure reminder stage progression is preserved when arrangement suppression ends
- [x] 3.4 Align payment reconciliation/webhook handling so arrangement status can move to fulfilled when obligations are satisfied

## 4. Dashboard Workflow and Visibility

- [x] 4.1 Add dashboard actions and UI to create freelancer-managed arrangements from overdue invoices
- [x] 4.2 Add arrangement indicators on invoice rows for active, broken, and fulfilled arrangement states
- [x] 4.3 Show arrangement coverage details (single vs multi-invoice scope and repayment summary) in expanded invoice context
- [x] 4.4 Add arrangement breach priority cues so follow-up triage is clear in the dashboard

## 5. Testing

- [x] 5.1 Add unit tests for arrangement validation rules (same debtor, arrangement type constraints, separation from public promise flow)
- [x] 5.2 Add reminder-engine tests verifying suppression during active arrangement and auto-resume after breach or expiry
- [x] 5.3 Add API tests for arrangement creation, rejection cases, and lifecycle transitions
- [x] 5.4 Add dashboard-facing data-shape tests for arrangement status and priority indicators

## 6. Verification and Documentation

- [x] 6.1 Update architecture and domain documentation for arrangement models, lifecycle, and API routes
- [x] 6.2 Run targeted test suites for invoice routes, promise flow boundaries, and reminder scheduling behavior
- [x] 6.3 Run OpenSpec validation and confirm this change is ready for implementation apply flow