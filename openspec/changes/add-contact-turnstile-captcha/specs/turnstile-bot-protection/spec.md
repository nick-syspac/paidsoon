## ADDED Requirements

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
