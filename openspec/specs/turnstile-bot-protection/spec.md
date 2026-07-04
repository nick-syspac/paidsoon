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

### Requirement: Turnstile token required before public contact submission
The system SHALL verify a valid Cloudflare Turnstile token server-side before processing any `POST /api/contact` submission.

#### Scenario: Token present and valid -> contact submission proceeds
- **WHEN** a contact form submission includes a valid Turnstile token
- **THEN** the server SHALL verify the token with Cloudflare Siteverify and continue existing contact enquiry validation and delivery flow

#### Scenario: Token missing -> contact submission blocked
- **WHEN** a contact form submission is received without a Turnstile token
- **THEN** the server SHALL return a 400 response with the message "Security check failed. Please try again." and MUST NOT attempt to send a contact enquiry email

#### Scenario: Token invalid -> contact submission blocked
- **WHEN** a contact form submission is received with a Turnstile token rejected by Cloudflare Siteverify
- **THEN** the server SHALL return a 400 response with the message "Security check failed. Please try again." and MUST NOT attempt to send a contact enquiry email

#### Scenario: Siteverify unavailable or times out -> contact submission blocked
- **WHEN** Cloudflare Siteverify fails, is unreachable, or does not respond within the verification timeout
- **THEN** the server SHALL return a 503 response with the message "Security check failed. Please try again." and MUST NOT attempt to send a contact enquiry email

### Requirement: Contact form renders Turnstile above submit action
The system SHALL render a visible Turnstile widget on the contact form immediately above the submit button.

#### Scenario: Contact form initial render
- **WHEN** a user opens the marketing contact page
- **THEN** the contact form SHALL display the Turnstile widget above the submit button

#### Scenario: Submit disabled until token available
- **WHEN** no valid Turnstile token is currently available in form state
- **THEN** the contact form submit action SHALL remain disabled

#### Scenario: Token expires or widget errors before submit
- **WHEN** the Turnstile token expires or widget emits an error before submission
- **THEN** the form SHALL clear the cached token and require completion of a fresh Turnstile challenge before submit is enabled

