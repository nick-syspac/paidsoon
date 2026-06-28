# turnstile-bot-protection Specification

## Purpose
TBD - created by archiving change cloudflare-turnstile-auth. Update Purpose after archive.
## Requirements
### Requirement: Turnstile token required before email/password sign-in
The system SHALL verify a valid Cloudflare Turnstile token server-side before processing any email/password sign-in request.

#### Scenario: Token present and valid — sign-in proceeds
- **WHEN** a user submits the sign-in form with a valid Turnstile token
- **THEN** the server verifies the token with Cloudflare Siteverify, then calls Supabase `signInWithPassword`, and on success sets session cookies and returns a 200 response

#### Scenario: Token missing — sign-in blocked
- **WHEN** a sign-in POST request is received without a Turnstile token
- **THEN** the server SHALL return a 400 error and the message "Security check failed. Please try again." without making any Supabase auth call

#### Scenario: Token invalid — sign-in blocked
- **WHEN** a sign-in POST request is received with a token that Cloudflare Siteverify rejects
- **THEN** the server SHALL return a 400 error and the message "Security check failed. Please try again." without making any Supabase auth call

#### Scenario: Cloudflare Siteverify unreachable or times out — sign-in blocked
- **WHEN** the Cloudflare Siteverify API does not respond within 5 seconds
- **THEN** the server SHALL return a 503 error and the message "Security check failed. Please try again." without making any Supabase auth call

#### Scenario: Wrong credentials after valid token — standard auth error returned
- **WHEN** the Turnstile token is valid but the email/password are incorrect
- **THEN** the server SHALL return the standard invalid credentials error to the client

### Requirement: Turnstile token required before email/password sign-up
The system SHALL verify a valid Cloudflare Turnstile token server-side before processing any email/password sign-up request.

#### Scenario: Token present and valid — sign-up proceeds
- **WHEN** a user submits the sign-up form with a valid Turnstile token
- **THEN** the server verifies the token with Cloudflare Siteverify, then calls Supabase `signUp`, and handles the response (session live or email confirmation needed)

#### Scenario: Token missing — sign-up blocked
- **WHEN** a sign-up POST request is received without a Turnstile token
- **THEN** the server SHALL return a 400 error and the message "Security check failed. Please try again." without making any Supabase auth call

#### Scenario: Token invalid — sign-up blocked
- **WHEN** a sign-up POST request is received with a token that Cloudflare Siteverify rejects
- **THEN** the server SHALL return a 400 error and the message "Security check failed. Please try again." without making any Supabase auth call

### Requirement: Invisible Turnstile widget on auth forms
The system SHALL render an invisible Cloudflare Turnstile widget on both the sign-in and sign-up pages and make the generated token available to the form submission handler.

#### Scenario: Token pre-generated on page load
- **WHEN** the sign-in or sign-up page loads
- **THEN** the Turnstile widget SHALL begin generating a token in the background without displaying any visible UI to the user

#### Scenario: Token expires and auto-refreshes
- **WHEN** a Turnstile token expires (after ~5 minutes of inactivity)
- **THEN** the widget SHALL automatically request a new token and update the component's token state

#### Scenario: Google OAuth button unaffected
- **WHEN** a user clicks "Continue with Google" on either auth page
- **THEN** the Google OAuth flow SHALL proceed without any Turnstile involvement

