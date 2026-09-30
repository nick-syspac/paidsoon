## ADDED Requirements

### Requirement: Spend-side sync SHALL validate provider scope readiness
The system SHALL validate that connected provider grants include all required scopes for spend-side endpoints before treating spend ingestion as ready. If required scopes are missing, the system SHALL produce an explicit scope-upgrade-required state with retry-safe behavior and reconnect remediation guidance.

#### Scenario: MYOB spend ingestion encounters missing required scopes
- **WHEN** a MYOB spend-side sync attempt calls spend endpoints with a token grant that lacks one or more required spend scopes
- **THEN** the system records a spend-side partial failure classified as scope-upgrade-required
- **AND** it does not classify the connection as globally revoked based on that spend-side failure alone
- **AND** it surfaces reconnect guidance for obtaining the missing scopes

#### Scenario: MYOB spend ingestion resumes after reconnect with full scopes
- **WHEN** a tenant reconnects MYOB and grants the required spend-read scopes
- **THEN** subsequent spend-side sync attempts ingest bills, bank transactions, suppliers, and expense accounts normally
- **AND** previously reported scope-upgrade-required state is cleared after successful spend sync

#### Scenario: MYOB banking ingestion uses canonical transaction families
- **WHEN** spend-side sync retrieves MYOB banking transaction data
- **THEN** the system SHALL use documented MYOB Business banking endpoint families rather than non-canonical transaction endpoints
- **AND** it SHALL normalize endpoint-specific payload fields into the internal spend transaction model before persistence

#### Scenario: Unsupported MYOB purchase bill subtype does not cause perpetual partial failures
- **WHEN** a MYOB tenant does not support a purchase bill subtype path
- **THEN** spend bill ingestion SHALL avoid unsupported subtype requests in its contract
- **AND** bills ingestion SHALL continue for supported purchase bill subtypes without deterministic 404 failures on every sync
