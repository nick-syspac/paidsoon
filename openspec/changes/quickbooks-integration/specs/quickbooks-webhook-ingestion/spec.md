# QuickBooks Webhook Ingestion Spec

## Purpose

Define how PaidSoon accepts, verifies, persists, and reconciles QuickBooks webhook deliveries so provider-side invoice and customer changes are processed reliably and replay safely.

## ADDED Requirements

### Requirement: System verifies QuickBooks webhook authenticity before processing

The system SHALL require every QuickBooks webhook delivery to pass signature verification before it can affect application state.

#### Scenario: Signed webhook delivery is received

- **WHEN** QuickBooks posts a webhook request with a valid signature for the configured shared secret
- **THEN** the system accepts the delivery for persistence and downstream processing

#### Scenario: Webhook signature is invalid

- **WHEN** a webhook request arrives with a missing or invalid signature
- **THEN** the system rejects the request and does not persist or process its business events

### Requirement: System persists webhook deliveries for audit and retry handling

The system SHALL persist each accepted QuickBooks webhook delivery with its provider, delivery state, and replay-safe identity so failed processing can be retried without losing the original payload.

#### Scenario: Accepted webhook is stored before reconciliation

- **WHEN** a signed QuickBooks webhook delivery is accepted
- **THEN** the system stores the raw delivery payload, provider event metadata, and an initial pending status in persistent event storage before applying reconciliation logic

#### Scenario: Duplicate webhook delivery is received

- **WHEN** the same QuickBooks webhook delivery is posted more than once
- **THEN** the system recognises the duplicate by delivery identity or equivalent idempotency signal and does not process the same logical delivery twice

### Requirement: Webhook events reconcile affected invoices and customers idempotently

The system SHALL process supported QuickBooks invoice and customer events by reconciling the affected entities through the same canonical sync or mapping logic used by pull-based imports.

#### Scenario: Invoice event is received for a connected QuickBooks company

- **WHEN** a QuickBooks webhook indicates that an invoice was created, updated, or paid for a company currently connected to a PaidSoon user
- **THEN** the system reconciles that invoice through the shared QuickBooks sync mapping logic so tracked-invoice state matches the provider

#### Scenario: Customer event is received for a connected QuickBooks company

- **WHEN** a QuickBooks webhook indicates that a customer was created or updated for a connected company
- **THEN** the system refreshes the related customer mapping and preserves idempotent contact state for subsequent invoice imports

#### Scenario: Webhook references an unconnected company

- **WHEN** a valid QuickBooks webhook references a company that is not currently connected in PaidSoon
- **THEN** the system records the delivery outcome without mutating tenant invoice data

### Requirement: Failed webhook processing remains recoverable

The system SHALL classify accepted webhook deliveries as pending, processed, or failed, and SHALL support safe retry of failed deliveries after transient errors are resolved.

#### Scenario: Webhook processing succeeds

- **WHEN** all affected entities are reconciled successfully for an accepted webhook delivery
- **THEN** the system marks the persisted delivery record processed with a completion timestamp

#### Scenario: Webhook processing fails transiently

- **WHEN** an accepted webhook delivery cannot be fully processed because of a transient upstream or internal failure
- **THEN** the system marks the delivery failed, preserves the payload for retry, and records a sanitised error summary

#### Scenario: Failed delivery is retried

- **WHEN** an operator or background retry worker reprocesses a previously failed QuickBooks webhook delivery
- **THEN** the system reuses the stored payload and processes it idempotently without duplicating prior successful mutations
