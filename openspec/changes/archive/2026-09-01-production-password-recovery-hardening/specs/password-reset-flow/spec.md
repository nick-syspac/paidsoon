## MODIFIED Requirements

### Requirement: Request a password reset email
The system SHALL allow a user to request a password-reset email by submitting their account email address on a `/forgot-password` page, and SHALL respond identically whether or not that email address has an associated account, to avoid revealing account existence. The recovery flow SHALL be treated as a supported production customer workflow once tested in a live environment, not simply as a helper function.

#### Scenario: Known email address
- **WHEN** a user submits an email address that has an associated account on `/forgot-password`
- **THEN** a password-reset email is sent to that address and the page shows a generic confirmation message

#### Scenario: Unknown email address
- **WHEN** a user submits an email address with no associated account on `/forgot-password`
- **THEN** no email is sent, and the page shows the same generic confirmation message as for a known address

### Requirement: Complete a password reset
The system SHALL allow a user who followed a valid, unexpired password-reset link to set a new password on a `/reset-password` page, and SHALL reject the attempt if the recovery link/session is invalid or expired. The system SHALL fail closed and redirect the user to a safe re-entry path when the recovery state cannot be verified.

#### Scenario: Valid reset link
- **WHEN** a user opens `/reset-password` via a valid, unexpired password-reset link and submits a new password
- **THEN** the account's password is updated and the user can subsequently sign in with the new password

#### Scenario: Invalid or expired reset link
- **WHEN** a user opens `/reset-password` with an invalid or expired recovery link
- **THEN** the system rejects the password update and prompts the user to request a new reset email

#### Scenario: Recovery session fails validation
- **WHEN** the reset token or recovery context cannot be verified for any reason
- **THEN** the system prevents password mutation
- **AND** preserves the safe, non-enumerating error flow used by the app

### Requirement: Pre-launch gating of the reset-request entry point
The system SHALL block access to `/forgot-password` before public launch, consistent with how `/sign-in` and `/sign-up` are blocked while `LIVE` is not enabled. This applies to both the route and any customer-facing entry point that would let a user initiate a recovery flow before launch approval.

#### Scenario: Pre-launch access attempt
- **WHEN** a request is made to `/forgot-password` while `LIVE` is not enabled
- **THEN** the request is redirected to `/`, matching the existing `/sign-in`/`/sign-up` behavior
