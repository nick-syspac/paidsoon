# email-delivery-tracking Specification

## Purpose
Tracks what actually happened to each reminder email after it was sent, so a bounced or failed-delivery email is visible and actionable instead of looking identical to a successful send.
## Requirements
### Requirement: Delivery status is updated from Resend webhook events
The system SHALL receive Resend delivery-event webhooks and update the corresponding `EmailLog` record's status to `delivered`, `bounced`, or `complained` based on the event type, matched by the stored `resendMessageId`.

#### Scenario: Delivery confirmed
- **WHEN** a Resend webhook reports a delivered event for a message ID matching an `EmailLog` record
- **THEN** that record's status becomes `delivered`

#### Scenario: Bounce reported
- **WHEN** a Resend webhook reports a bounce event for a message ID matching an `EmailLog` record
- **THEN** that record's status becomes `bounced`

### Requirement: Webhook signature is verified before processing
The system SHALL verify the Resend webhook signature on every incoming request and reject any request that fails verification without updating any `EmailLog` record.

#### Scenario: Invalid signature
- **WHEN** a webhook request arrives with a signature that does not match the configured webhook secret
- **THEN** the request is rejected and no `EmailLog` record is modified

### Requirement: Unmatched webhook events are ignored safely
The system SHALL ignore (without erroring) any webhook event whose message ID does not match a known `EmailLog` record.

#### Scenario: Event for an unknown message
- **WHEN** a webhook event references a message ID with no matching `EmailLog` record
- **THEN** the webhook responds successfully and no record is created or modified

