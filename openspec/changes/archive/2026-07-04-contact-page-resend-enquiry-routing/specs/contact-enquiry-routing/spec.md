## ADDED Requirements

### Requirement: Route contact enquiries by type
The system SHALL route each accepted contact enquiry to the configured internal mailbox for its enquiry type when sending via Resend.

#### Scenario: Route sales enquiry
- **WHEN** a contact submission is received with enquiry type `Sales`
- **THEN** the system SHALL send the enquiry through Resend to `sales@paidsoon.com.au`

#### Scenario: Route support enquiry
- **WHEN** a contact submission is received with enquiry type `Support`
- **THEN** the system SHALL send the enquiry through Resend to `support@paidsoon.com.au`

#### Scenario: Route accounting partnerships enquiry
- **WHEN** a contact submission is received with enquiry type `Accounting Partnerships`
- **THEN** the system SHALL send the enquiry through Resend to `partnerships@padisoon.com.au`

### Requirement: Reject unsupported enquiry types
The system MUST reject contact submissions that include an unsupported enquiry type value and MUST NOT attempt to send an email.

#### Scenario: Unsupported enquiry type provided
- **WHEN** a contact submission includes an enquiry type outside the supported set (`Sales`, `Support`, `Accounting Partnerships`)
- **THEN** the system MUST return a validation error and skip Resend delivery

### Requirement: Surface delivery failure outcomes
The system MUST return an explicit failure response when Resend delivery fails so the caller can communicate that the enquiry was not sent.

#### Scenario: Resend send call fails
- **WHEN** the system attempts to send a routed contact enquiry and Resend returns an error
- **THEN** the system MUST return a server error response indicating delivery failure
