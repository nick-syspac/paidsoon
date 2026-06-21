## ADDED Requirements

### Requirement: Spinner shown during sign-in submission
The system SHALL display an animated spinning circle inside the sign-in submit button while the authentication request is in progress.

#### Scenario: Spinner appears on submit
- **WHEN** the user submits the sign-in form
- **THEN** an animated spinner is visible inside the submit button alongside a loading label

#### Scenario: Spinner disappears on success
- **WHEN** the authentication request completes successfully
- **THEN** the spinner is no longer visible and the user is redirected to the dashboard

#### Scenario: Spinner disappears on error
- **WHEN** the authentication request returns an error
- **THEN** the spinner is no longer visible and an error message is displayed

#### Scenario: Button disabled while loading
- **WHEN** the spinner is visible
- **THEN** the submit button SHALL be disabled to prevent duplicate submissions

### Requirement: Spinner shown during sign-up submission
The system SHALL display an animated spinning circle inside the sign-up submit button while the account creation request is in progress.

#### Scenario: Spinner appears on submit
- **WHEN** the user submits the sign-up form
- **THEN** an animated spinner is visible inside the submit button alongside a loading label

#### Scenario: Spinner disappears on completion
- **WHEN** the sign-up request completes (success or error)
- **THEN** the spinner is no longer visible
