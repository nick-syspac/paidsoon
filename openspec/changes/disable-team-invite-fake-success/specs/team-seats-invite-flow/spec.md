## Purpose

The team-seats invite flow capability defines the expected behavior for settings and API actions when the team seats feature is either unavailable or operational. It ensures the product never claims an invite was sent when no invite was created, and it keeps the plan's seat context visible without exposing a fake success path.

## ADDED Requirements

### Requirement: Team invite actions are truthful
The system SHALL only return a success response for Team invite actions when the invite is actually created and persisted, or when a valid implemented workflow exists that performs the action.

#### Scenario: Invite is attempted while the feature is unimplemented
- **WHEN** a user submits a Team invite request while `team_seats` is marked unimplemented
- **THEN** the API returns a feature-unavailable status and does not claim success

#### Scenario: Invite is attempted when the feature is implemented
- **WHEN** the Team invite workflow is implemented and the request is valid
- **THEN** the API returns a success response only after the invite has actually been created

### Requirement: Team settings display a truthful state
The system SHALL show Team settings as either actionable or unavailable, but SHALL NOT display a successful completion state when the backend has not created an invite.

#### Scenario: Settings state is shown before implementation
- **WHEN** the feature is unimplemented
- **THEN** the UI shows the seat context and a coming-soon state without an action success message

#### Scenario: Settings state is shown after implementation
- **WHEN** the feature is implemented and a valid invite is created
- **THEN** the UI reflects that real success state and the invite is visible to the user
