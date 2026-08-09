## ADDED Requirements

### Requirement: Published guides support mixed audience visibility

Published guides SHALL declare an audience classification. Initial supported audiences SHALL be `public` and `signed_in`.

#### Scenario: Public guide is visible without authentication
- **WHEN** a published guide audience is `public`
- **THEN** the guide can be read without sign-in

#### Scenario: Signed-in guide requires authentication
- **WHEN** a published guide audience is `signed_in`
- **THEN** unauthenticated requests are denied or redirected per help access policy
- **AND** authenticated users can read the guide

### Requirement: Audience filtering is server-enforced

Audience visibility checks SHALL be enforced by server-side read and search endpoints.

#### Scenario: Unauthenticated search excludes signed-in guides
- **WHEN** an unauthenticated user performs help search
- **THEN** results include only guides with `public` audience

#### Scenario: Authenticated search includes signed-in guides
- **WHEN** an authenticated user performs help search
- **THEN** results may include both `public` and `signed_in` guides, subject to publication state
