## MODIFIED Requirements

### Requirement: Customer identity derives from canonical contacts
The system SHALL source debtor identity (email, display name) for the customer directory from
`FinancialContact` records rather than from identity fields duplicated on `Customer`. The
`Customer` record SHALL retain tenant-scoped chasing preferences (`neverAutoChase`,
`unsubscribed`, `cadenceOverride`) linked to the canonical contact. Uniqueness per tenant and
case-insensitive email SHALL be preserved through the canonical contact mapping.

#### Scenario: First invoice for a new debtor
- **WHEN** an invoice is ingested from any source for a debtor email not yet known to the tenant
- **THEN** a canonical contact is created (or matched) with provenance
- **THEN** a `Customer` preference record linked to that canonical contact is created

#### Scenario: Directory displays canonical identity
- **WHEN** a user views the customer directory
- **THEN** displayed names and emails come from the canonical contact record
- **THEN** chasing preferences continue to apply per customer as before
