# customer-password-recovery Specification

## Purpose
The customer password recovery capability lets a user regain access to their account without support intervention, while preserving the product's privacy and safety guarantees before launch. It covers the full self-service recovery flow from reset request through verification and password update.
## Requirements
### Requirement: Customer can request a password reset
The system SHALL allow a user to request a password reset for their account from the recovery-entry page and SHALL show a generic confirmation message regardless of whether the email matches an existing account.

#### Scenario: Reset request succeeds for a known user
- **WHEN** a user enters an email address that matches an existing account
- **THEN** the system sends a valid reset link to that address
- **AND** shows the same generic success message as for unknown addresses

#### Scenario: Reset request does not leak account existence
- **WHEN** a user enters an email address that is not associated with an account
- **THEN** the system does not reveal that the address is unknown
- **AND** returns the same confirmation message as a valid reset request

### Requirement: Customer can complete password recovery safely
The system SHALL allow a user to set a new password only when the reset token is valid and unexpired, and SHALL reject invalid, expired, or replayed recovery attempts safely.

#### Scenario: Valid recovery link is used
- **WHEN** a user opens a valid reset link and submits a new password
- **THEN** the password is updated
- **AND** the user can sign in with the new password

#### Scenario: Invalid or expired reset link is used
- **WHEN** a user submits an invalid, expired, or otherwise unusable recovery token
- **THEN** the system rejects the update
- **AND** tells the user to request a new reset email without disclosing account status

### Requirement: Recovery flow is gated consistently before launch
The system SHALL keep the recovery entry point unavailable while the public launch gate is disabled, matching the existing pre-launch behavior for sign-in and sign-up.

#### Scenario: Recovery page is requested during pre-launch mode
- **WHEN** the product is not in live mode
- **THEN** the password recovery entry page is not publicly accessible
- **AND** the user is redirected to the public homepage as with other gated auth routes

