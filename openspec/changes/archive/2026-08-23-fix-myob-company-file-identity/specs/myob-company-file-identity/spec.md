## ADDED Requirements

### Requirement: MYOB company-file identity is resolved directly from the OAuth callback
The system SHALL identify the connected MYOB company file using the `businessId` and `businessName` values returned directly on the OAuth callback query string. The system SHALL NOT call a company-file discovery or listing endpoint to identify the company file.

#### Scenario: Callback includes businessId and businessName
- **WHEN** MYOB redirects back to the callback with a valid `code`, a valid `state`, and a `businessId` query parameter
- **THEN** the system uses `businessId` as the basis for the connection's stable identifier without calling any company-file discovery endpoint

#### Scenario: Callback is missing businessId
- **WHEN** MYOB redirects back to the callback without a `businessId` query parameter
- **THEN** the system treats the callback as invalid and redirects to the connections page with a diagnostic error code, without attempting a company-file discovery endpoint as a fallback

### Requirement: MYOB organisation identifier is a directly callable company-file URI
The system SHALL store `AccountingConnection.organisationId` for MYOB as a fully-qualified, directly callable company-file URI (cf_uri) derived from `businessId` and the known MYOB online API host, not as a bare identifier.

#### Scenario: Connection is persisted after callback
- **WHEN** the system persists a new or updated MYOB `AccountingConnection` after a successful callback
- **THEN** `organisationId` is stored as a URI that can be used directly as the base for subsequent MYOB API calls (e.g. appending `/Sale/Invoice/{type}` or `/Contact/Customer`) without further transformation

### Requirement: MYOB organisation display name has a deterministic fallback
The system SHALL store the callback's `businessName` value as `AccountingConnection.organisationName` when present and non-blank. When `businessName` is absent or blank, the system SHALL fall back to a deterministic, recognizable label derived from `businessId`.

#### Scenario: businessName is present
- **WHEN** the callback includes a non-blank `businessName` value
- **THEN** the system stores that value as the connection's `organisationName`

#### Scenario: businessName is absent
- **WHEN** the callback does not include a `businessName` value, or it is blank
- **THEN** the system stores a deterministic fallback name derived from `businessId` as the connection's `organisationName`, without making an additional network call to resolve a name

### Requirement: MYOB connect flow does not present a company-file selection step
The system SHALL NOT present a company-file selection UI or intermediate pending-selection state for MYOB connections. Each MYOB OAuth callback SHALL resolve directly to a single `AccountingConnection` upsert.

#### Scenario: User completes MYOB OAuth authorisation
- **WHEN** a user completes the MYOB OAuth consent flow and is redirected to the callback
- **THEN** the system stores the resulting connection directly and redirects to the connections page with a success or error outcome, without redirecting to a company-file selection page
