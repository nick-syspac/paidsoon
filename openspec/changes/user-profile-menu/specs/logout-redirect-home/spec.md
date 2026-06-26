## MODIFIED Requirements

### Requirement: User is redirected to homepage after logout
The system SHALL redirect an authenticated user to the main homepage (`/`) when they initiate logout via the user menu or endpoint. The sign-out trigger SHALL be located inside the user menu dropdown (not as a standalone nav button).

#### Scenario: User logs out via user menu
- **WHEN** a user clicks "Sign out" in the user menu dropdown in the authenticated dashboard
- **THEN** the system clears their session and redirects them to the main homepage (`/`)

#### Scenario: User accesses logout endpoint directly
- **WHEN** a user navigates to `/auth/sign-out` while authenticated
- **THEN** the system clears their session and redirects them to the main homepage (`/`)

#### Scenario: User is no longer authenticated after logout
- **WHEN** a user is redirected to the homepage after logout
- **THEN** they cannot access protected routes (e.g., `/dashboard`) without signing in again
