# user-profile-bootstrap Specification

## Purpose
Guarantees that every authenticated Supabase session — however it was
established — has a corresponding `user_profiles` row before the user reaches
any part of the app that depends on one, so that a valid session can never
point at a missing profile.
## Requirements
### Requirement: Profile bootstrap on immediate-session sign-up
The system SHALL create a `user_profiles` row for a new account before
returning a successful response when `supabase.auth.signUp()` returns a live
session immediately (email confirmation disabled or auto-confirmed).

#### Scenario: Sign-up returns an immediate session
- **WHEN** a user submits the sign-up form and Supabase returns a session
  without requiring email confirmation
- **THEN** a `user_profiles` row for that user exists before the sign-up
  response is returned to the client

### Requirement: Profile bootstrap on password sign-in
The system SHALL ensure a `user_profiles` row exists for the authenticating
user on every successful password sign-in, creating one if it is missing.

#### Scenario: Sign-in for an account with an existing profile
- **WHEN** a user successfully signs in with email and password and a
  `user_profiles` row already exists for their account
- **THEN** the existing row is left unchanged and the sign-in completes
  normally

#### Scenario: Sign-in for a session whose profile is missing
- **WHEN** a user successfully signs in with email and password but no
  `user_profiles` row exists for their account
- **THEN** a `user_profiles` row is created for that user before the sign-in
  response is returned to the client

### Requirement: Profile bootstrap is idempotent
The system SHALL treat profile bootstrap as safe to invoke multiple times for
the same user without creating duplicate rows or overwriting existing profile
data.

#### Scenario: Bootstrap invoked for an account that already has a profile
- **WHEN** profile bootstrap runs for a user who already has a `user_profiles`
  row
- **THEN** no duplicate row is created and the existing row's fields are not
  modified

