## Purpose

Defines how the Resend delivery-status webhook route verifies inbound event
signatures, including the required fail-closed behavior when the signing
secret is not configured.

## ADDED Requirements

### Requirement: Fail closed when the webhook secret is not configured
The system SHALL reject all Resend webhook requests with a non-2xx response
when `RESEND_WEBHOOK_SECRET` is unset or an empty string, and SHALL NOT
attempt signature verification against an empty or missing secret.

#### Scenario: Secret is unset at request time
- **WHEN** a Resend webhook request is received and `RESEND_WEBHOOK_SECRET`
  is unset
- **THEN** the route returns a non-2xx response and does not update any
  `EmailLog` row

#### Scenario: Secret is an empty string at request time
- **WHEN** a Resend webhook request is received and `RESEND_WEBHOOK_SECRET`
  is set to an empty string
- **THEN** the route returns a non-2xx response and does not update any
  `EmailLog` row

### Requirement: Verify signature before processing events
The system SHALL verify the `svix-signature` header against the configured
secret before parsing or acting on the event payload, and SHALL reject the
request if verification fails.

#### Scenario: Invalid signature
- **WHEN** a Resend webhook request is received with a signature that does
  not match the configured secret
- **THEN** the route returns a 400 response and does not update any
  `EmailLog` row

#### Scenario: Valid signature
- **WHEN** a Resend webhook request is received with a signature that
  matches the configured secret
- **THEN** the route processes the event and returns a 200 response
