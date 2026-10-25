# Spec Delta

## MODIFIED Requirements

### Requirement: Account page shows read-only user identity fields
The Account settings page SHALL display the user's email address, subscription tier, subscription status, and account creation date as read-only information.

#### Scenario: User views Account settings
- **WHEN** an authenticated user navigates to `/settings/account`
- **THEN** the page shows their email, subscription tier, subscription status, and the date their account was created

#### Scenario: Email field is not editable
- **WHEN** the user views the email field on the Account settings page
- **THEN** there is no input or edit control for the email address — it is display-only
