# user-nav-menu Specification

## Purpose
TBD - created by archiving change user-profile-menu. Update Purpose after archive.
## Requirements
### Requirement: Nav displays a user menu dropdown instead of a bare sign-out button
The system SHALL replace the standalone "Sign out" nav button with an interactive user menu dropdown that shows identity context and contains the sign-out action.

#### Scenario: User opens the menu
- **WHEN** an authenticated user clicks the user menu trigger in the nav
- **THEN** a dropdown opens showing: display name (or email if not set), email address, subscription tier badge, an "Account" link, a "Settings" link, and a "Sign out" action at the bottom

#### Scenario: User closes the menu by clicking outside
- **WHEN** the dropdown is open and the user clicks anywhere outside it
- **THEN** the dropdown closes

#### Scenario: Menu trigger shows initials
- **WHEN** an authenticated user views the dashboard nav
- **THEN** the menu trigger shows up to 2 initials derived from the display name (if set) or from the email address, inside a circular element

#### Scenario: Display name shown when set
- **WHEN** the user has a `displayName` set
- **THEN** the menu header shows the display name as the primary identity line

#### Scenario: Email shown as primary identity when no display name
- **WHEN** the user has no `displayName` set
- **THEN** the menu header shows the email address as the primary identity line

### Requirement: Sign out is accessible from the user menu
The system SHALL provide a sign-out action as the last item in the user menu dropdown.

#### Scenario: User signs out via the menu
- **WHEN** user clicks "Sign out" inside the user menu dropdown
- **THEN** the system clears the session and redirects to `/` (unchanged redirect behaviour)

