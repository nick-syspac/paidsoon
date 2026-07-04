## MODIFIED Requirements

### Requirement: Client-initiated promise to pay via secure token

The system SHALL allow a client to self-commit to a payment date by visiting a unique token-based URL included in their follow-up email. The URL SHALL require no authentication. The token SHALL be a 32-byte cryptographically random hex string stored on the `TrackedInvoice` and generated on the first Business+ follow-up email sent for that invoice. The token SHALL remain stable for the lifetime of the invoice. The public promise flow SHALL be limited to a single invoice and SHALL not create partial-payment, instalment, or multi-invoice arrangements.

#### Scenario: Client visits promise page with valid token

- **WHEN** a client visits `/promise/[token]` with a valid token for an unpaid invoice
- **THEN** the system displays the invoice reference and a single-invoice commitment form

#### Scenario: Client visits promise page for already-paid invoice

- **WHEN** a client visits `/promise/[token]` and the invoice status is `paid` or `manually_resolved`
- **THEN** the system displays a message indicating the invoice is settled and no action is needed

#### Scenario: Client visits promise page with invalid or unknown token

- **WHEN** a client visits `/promise/[token]` with a token that does not exist in the database
- **THEN** the system displays a generic "link not found" message without exposing any invoice details

#### Scenario: Client submits a valid promise

- **WHEN** a client submits the promise form with a future date for the linked invoice
- **THEN** the system creates a `PromiseToPay` record with `status: 'active'`, supersedes any existing `active` promise on the same invoice (setting its status to `'superseded'`), and sends a notification email to the freelancer

#### Scenario: Client submits a past date

- **WHEN** a client submits the promise form with a date in the past
- **THEN** the system rejects the submission with a validation error and prompts the client to choose a future date

#### Scenario: Client attempts to negotiate broader arrangement

- **WHEN** a client uses the public promise flow to request a partial-payment, instalment, or multi-invoice commitment
- **THEN** the system rejects the request and does not create an arrangement agreement