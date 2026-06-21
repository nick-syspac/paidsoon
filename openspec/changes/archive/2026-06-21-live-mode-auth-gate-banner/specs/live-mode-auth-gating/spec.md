## ADDED Requirements

### Requirement: Launch mode SHALL be controlled by LIVE environment variable
The system SHALL derive launch mode from the `LIVE` environment variable using a centralized parser.
`LIVE=true` MUST evaluate to live mode, while any missing or malformed value MUST evaluate to not-live mode.

#### Scenario: LIVE is true
- **WHEN** the application starts with `LIVE=true`
- **THEN** the system evaluates launch mode as live
- **THEN** sign-in and sign-up behavior remains available as normal

#### Scenario: LIVE is false
- **WHEN** the application starts with `LIVE=false`
- **THEN** the system evaluates launch mode as not-live

#### Scenario: LIVE is missing or malformed
- **WHEN** the application starts with `LIVE` unset or with a non-boolean-like value
- **THEN** the system evaluates launch mode as not-live

### Requirement: Authentication entry points SHALL be unavailable in not-live mode
When launch mode is not-live, the system SHALL prevent user access to sign-in and sign-up entry points.

#### Scenario: User requests sign-in while not-live
- **WHEN** launch mode is not-live and a user navigates to sign-in
- **THEN** the system denies normal sign-in flow access
- **THEN** the response presents a non-auth path (for example redirect or unavailable view) per implementation policy

#### Scenario: User requests sign-up while not-live
- **WHEN** launch mode is not-live and a user navigates to sign-up
- **THEN** the system denies normal sign-up flow access
- **THEN** the response presents a non-auth path (for example redirect or unavailable view) per implementation policy

### Requirement: Not-live banner SHALL be displayed in not-live mode
The system SHALL render a prominent top-of-page banner indicating the site is not live whenever launch mode is not-live.

#### Scenario: Not-live banner visible
- **WHEN** launch mode is not-live and a user loads the app
- **THEN** a top banner is shown with messaging that the site is not live

#### Scenario: Not-live banner hidden in live mode
- **WHEN** launch mode is live and a user loads the app
- **THEN** no not-live banner is rendered
