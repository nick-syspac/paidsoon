## ADDED Requirements

### Requirement: System provides a default follow-up schedule
The system SHALL create a default `schedules` record for every new user with the following values: `email1DaysAfterDue: 3`, `email2DaysAfterDue: 10`, `email3DaysAfterDue: 21`. This default applies immediately upon account creation without any user action.

#### Scenario: Default schedule created on sign-up
- **WHEN** a new user account is created
- **THEN** a `schedules` record is created for that user with the default values (3, 10, 21 days)

---

### Requirement: Pro users can customize their follow-up schedule
On the Pro tier, the system SHALL allow a freelancer to modify their follow-up schedule by setting the number of days after the invoice due date for each of the 3 email stages. The system SHALL enforce that `email1DaysAfterDue < email2DaysAfterDue < email3DaysAfterDue` and all values are greater than 0.

#### Scenario: Pro user updates their schedule
- **WHEN** a Pro user submits valid updated schedule values
- **THEN** the `schedules` record is updated and the new values apply to all future `nextEmailAt` calculations for new overdue invoices

#### Scenario: Invalid schedule values rejected
- **WHEN** a user submits schedule values where email1 >= email2, or any value is <= 0
- **THEN** the system SHALL reject the update with a validation error describing the constraint

#### Scenario: Free user cannot access schedule customization
- **WHEN** a Free-tier user navigates to the schedule settings page
- **THEN** the system SHALL display the default schedule as read-only with an upgrade prompt

---

### Requirement: Schedule changes do not retroactively affect in-progress sequences
The system SHALL NOT recalculate `nextEmailAt` for invoices that are already in an active sequence when the user updates their schedule. New schedule values apply only to new overdue invoices detected after the change.

#### Scenario: Schedule updated while invoices are active
- **WHEN** a Pro user updates their schedule and they have pending tracked invoices
- **THEN** existing invoices retain their existing `nextEmailAt` values; only new invoices use the updated schedule
