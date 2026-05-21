## ADDED Requirements

### Requirement: Freelancer can create an account
The system SHALL allow a freelancer to register with an email address and password, or via Google OAuth, using Supabase Auth. Upon registration, a `user_profiles` record SHALL be created with `subscriptionTier: 'free'`.

#### Scenario: Register with email and password
- **WHEN** a visitor submits a valid email and password on the sign-up page
- **THEN** Supabase creates an auth user, sends a confirmation email, and the system creates a `user_profiles` record for that user

#### Scenario: Register with Google OAuth
- **WHEN** a visitor clicks "Continue with Google" and completes the OAuth flow
- **THEN** Supabase creates or links the auth user, and the system creates a `user_profiles` record if one does not already exist

#### Scenario: Duplicate email registration
- **WHEN** a visitor attempts to register with an email address already associated with an account
- **THEN** the system SHALL display an error message and SHALL NOT create a duplicate account

---

### Requirement: Freelancer can sign in
The system SHALL allow a registered freelancer to sign in with email/password or Google OAuth. Authenticated sessions SHALL be managed by Supabase Auth using JWT tokens.

#### Scenario: Successful email sign-in
- **WHEN** a registered user submits correct credentials on the sign-in page
- **THEN** the system creates a session and redirects to the dashboard

#### Scenario: Failed sign-in with wrong password
- **WHEN** a user submits an incorrect password
- **THEN** the system SHALL display a generic error ("Invalid email or password") and SHALL NOT indicate which field was wrong

#### Scenario: Sign in via Google
- **WHEN** a registered user clicks "Continue with Google" and completes the OAuth flow
- **THEN** the system creates a session and redirects to the dashboard

---

### Requirement: Freelancer can sign out
The system SHALL allow an authenticated user to sign out, invalidating their session.

#### Scenario: Sign out
- **WHEN** an authenticated user clicks "Sign out"
- **THEN** the session is destroyed and the user is redirected to the sign-in page

---

### Requirement: Protected routes require authentication
The system SHALL redirect unauthenticated users to the sign-in page when they attempt to access any route under `/dashboard`.

#### Scenario: Unauthenticated access to dashboard
- **WHEN** a visitor navigates directly to `/dashboard`
- **THEN** the system SHALL redirect them to `/sign-in`

---

### Requirement: Row Level Security enforces tenant isolation
The system SHALL enforce Supabase Row Level Security policies on all application tables so that a user can only read and write rows where `userId = auth.uid()`.

#### Scenario: User cannot access another user's data
- **WHEN** an authenticated user makes any database query
- **THEN** the RLS policy SHALL ensure only rows belonging to that user are returned, regardless of application-level filters
