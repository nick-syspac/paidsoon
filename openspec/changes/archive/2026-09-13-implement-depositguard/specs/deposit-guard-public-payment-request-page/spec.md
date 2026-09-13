## Purpose

Define a secure public customer payment-request experience for DepositGuard that reveals only required payment details and supports view/payment state tracking.

## ADDED Requirements

### Requirement: Public payment requests SHALL use unguessable token access
The system SHALL expose customer payment-request pages through cryptographically strong public tokens and SHALL avoid exposing internal sequential identifiers.

#### Scenario: Valid token is opened
- **WHEN** a customer opens a valid public payment-request link
- **THEN** the system serves only the corresponding request details needed for payment
- **AND** it does not include unrelated tenant, customer, or internal notes data

#### Scenario: Invalid, expired, or revoked token is opened
- **WHEN** a customer opens a token that is unknown, expired, or revoked
- **THEN** the system returns a non-disclosing unavailable response

### Requirement: Public page views SHALL be recorded idempotently
The system SHALL record first-view and subsequent-view timestamps for each request without duplicating side effects under retries.

#### Scenario: First page view occurs
- **WHEN** the first valid request-page view is processed
- **THEN** the system stores first-view and last-view timestamps
- **AND** emits one request-viewed event for that first view transition

#### Scenario: Repeated page loads occur
- **WHEN** the same request page is opened again
- **THEN** the system updates last-view timestamp
- **AND** does not duplicate first-view transition effects

### Requirement: Public pages SHALL prevent accidental indexing and abuse
The system SHALL prevent search indexing of public payment pages and SHALL apply request-rate controls to reduce token probing risk.

#### Scenario: Search crawler accesses a payment page
- **WHEN** an automated crawler requests a public payment URL
- **THEN** the response includes no-index directives

#### Scenario: Burst token probing is detected
- **WHEN** repeated public token lookups exceed configured rate limits
- **THEN** the system throttles further attempts for the requester window
