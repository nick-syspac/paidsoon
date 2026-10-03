# owners-digest-email-delivery

## Purpose

Define how Owner's Digest is generated and delivered by email so owners receive a concise, action-oriented summary on the configured cadence without introducing duplicate mail paths or non-deterministic financial content.

## ADDED Requirements

### Requirement: Owner's Digest SHALL deliver email through the existing mail infrastructure

The system SHALL send Owner's Digest emails through the application's existing email delivery architecture and SHALL NOT introduce a separate mail subsystem for digest delivery.

#### Scenario: Weekly digest email is due

- **WHEN** a tenant has Owner's Digest email enabled and the configured delivery window is reached
- **THEN** the system generates or loads the tenant's canonical digest for that reporting period and sends the email through the existing delivery provider path

#### Scenario: Email delivery is disabled

- **WHEN** a tenant disables digest emails while leaving the dashboard digest enabled
- **THEN** the digest remains available in the product
- **AND** no email is sent for that tenant

### Requirement: Owner's Digest email SHALL reflect deterministic digest content

Email content SHALL be derived from the persisted digest snapshot and SHALL preserve the same status, top-ranked issues, opportunities, and deep links as the in-product digest. Optional narrative enhancement SHALL fall back to deterministic copy when unavailable.

#### Scenario: AI summary enhancement is unavailable

- **WHEN** optional summary-enhancement services fail or are disabled
- **THEN** the email still sends with deterministic summary text generated from the structured digest data
- **AND** monetary values, rankings, and status remain unchanged

#### Scenario: User opens an email-linked digest

- **WHEN** a recipient selects the full-digest link from the email
- **THEN** the application opens the matching in-product digest snapshot for that period

### Requirement: Owner's Digest email delivery SHALL be retry-safe and auditable

The system SHALL prevent duplicate sends for the same tenant, reporting period, and recipient scope, and it SHALL record delivery success or failure for operational follow-up.

#### Scenario: Scheduler retries an already-sent digest email

- **WHEN** a retry occurs after the digest email has already been delivered for that tenant-period recipient scope
- **THEN** the system suppresses the duplicate send
- **AND** the digest remains marked as already delivered

#### Scenario: Delivery provider returns an error

- **WHEN** the delivery provider rejects or fails an Owner's Digest email send
- **THEN** the system records the failure for retry and operational visibility
- **AND** the digest snapshot itself remains persisted
