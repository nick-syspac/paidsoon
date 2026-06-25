## ADDED Requirements

### Requirement: User can set a display name
The system SHALL allow an authenticated user to set a display name via the Account settings page. The display name SHALL be used as the `{{yourName}}` token in automated reminder emails.

#### Scenario: User saves a display name for the first time
- **WHEN** user enters a non-empty display name on the Account settings page and clicks Save
- **THEN** the system persists the display name to `UserProfile.displayName` and shows a success confirmation

#### Scenario: User updates an existing display name
- **WHEN** user changes their display name and saves
- **THEN** the system overwrites the previous value and the new name is reflected immediately

#### Scenario: User submits an empty display name
- **WHEN** user clears the display name field and saves
- **THEN** the system rejects the request with a validation error

#### Scenario: Display name exceeds maximum length
- **WHEN** user submits a display name longer than 100 characters
- **THEN** the system rejects the request with a validation error

### Requirement: Display name is used in reminder emails
The cron system SHALL use `UserProfile.displayName` as the primary source for `freelancerName` when sending reminder emails.

#### Scenario: User has set a display name
- **WHEN** the cron sends a reminder email for a user who has a `displayName` set
- **THEN** the email uses `displayName` as `{{yourName}}`

#### Scenario: User has not set a display name (fallback chain)
- **WHEN** the cron sends a reminder email for a user with no `displayName`
- **THEN** the system falls back to `user_metadata.full_name`, then to the email username prefix

### Requirement: Account page shows read-only user identity fields
The Account settings page SHALL display the user's email address, subscription tier, subscription status, and account creation date as read-only information.

#### Scenario: User views Account settings
- **WHEN** an authenticated user navigates to `/dashboard/settings/account`
- **THEN** the page shows their email, subscription tier, subscription status, and the date their account was created

#### Scenario: Email field is not editable
- **WHEN** the user views the email field on the Account settings page
- **THEN** there is no input or edit control for the email address — it is display-only
