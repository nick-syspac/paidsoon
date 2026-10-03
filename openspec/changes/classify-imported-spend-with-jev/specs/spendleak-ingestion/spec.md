# Spec Delta

## ADDED Requirements

### Requirement: Imported spend classification is retryable and does not block ingestion
The system SHALL persist unresolved classification work independently of provider import success and SHALL expose pending or failed classification state without marking source data as failed.

#### Scenario: Provider import succeeds while Jev is unavailable
- **WHEN** an accounting-provider import succeeds but the classification provider times out or is unavailable
- **THEN** the imported source record remains persisted and the classification remains pending or reviewable for a later retry

#### Scenario: Classification work is retried
- **WHEN** a retryable classification request fails
- **THEN** the system retries within a bounded policy and avoids creating duplicate assignments or events for the same completed attempt

### Requirement: Provider spend fields remain distinct from PaidSoon categories
The system SHALL retain provider-specific account, tax, contact, and transaction facts as imported and SHALL NOT use a cash/bank account field as an expense category mapping unless the provider field is explicitly normalized as expense coding.

#### Scenario: Provider account field is a cash account
- **WHEN** an imported bank transaction exposes only its cash or bank account as an account field
- **THEN** that field is preserved as source data and is not treated as an expense-account category mapping

### Requirement: Imported transaction direction is provider-independent
The system SHALL expose normalized inflow, outflow, or unknown direction independently from the imported amount value and SHALL preserve the original amount and provider representation.

#### Scenario: Provider spend transaction uses a positive amount
- **WHEN** an accounting provider represents a spend transaction with a positive amount
- **THEN** the normalized transaction direction is outflow while the imported amount remains unchanged

#### Scenario: Transaction direction cannot be established
- **WHEN** a source record does not provide enough reliable information to determine inflow or outflow
- **THEN** the normalized direction is unknown and the record is excluded from confirmed spend totals until reviewed