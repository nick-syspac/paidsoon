## MODIFIED Requirements

### Requirement: Unimplemented feature APIs return deterministic unavailability
APIs backing entitled but unimplemented feature workflows SHALL return a deterministic unavailable response with a machine-readable reason code and SHALL NOT return a success response implying completed work. This requirement applies to Team invite actions while `team_seats` is not implemented.

#### Scenario: Client submits an action for an unimplemented feature
- **WHEN** a client sends a request to execute an unimplemented feature workflow
- **THEN** the API response indicates feature unavailable and includes a stable reason code usable by the client UI

#### Scenario: Team invite API is called while Team seats are unimplemented
- **WHEN** a request is made to execute Team invite actions while `team_seats` is unimplemented
- **THEN** the system returns a feature-unavailable response rather than a success response

#### Scenario: Repeated unimplemented requests do not vary
- **WHEN** repeated requests are made to the Team invite endpoint while the feature is unimplemented
- **THEN** each response remains consistently unavailable with the same reason code semantics
