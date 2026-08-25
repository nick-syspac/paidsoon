## Purpose

The invoice reminder delivery capability ensures that every reminder email contains a working payment action when the invoice has a known payment URL, and stays cleanly without a CTA when no URL is available. It protects the customer-facing trust signal in the invoice chase flow without changing unrelated reminder logic.

## ADDED Requirements

### Requirement: Reminder email includes a customer-facing payment action when available
The system SHALL include a pay-invoice link in reminder emails whenever a tracked invoice has a non-empty payment URL and SHALL omit that link when no valid URL is present.

#### Scenario: Invoice has a hosted payment URL
- **WHEN** a tracked invoice has a populated `paymentUrl`
- **THEN** the reminder email includes a visible payment CTA pointing to that URL

#### Scenario: Invoice has no payment URL
- **WHEN** a tracked invoice has no valid `paymentUrl`
- **THEN** the reminder email omits the payment CTA without breaking the email body

### Requirement: Reminder rendering is safe for both HTML and text output
The system SHALL render the payment CTA consistently in the HTML and text variants of the reminder email without injecting unsafe or malformed content.

#### Scenario: Reminder email is rendered in both formats
- **WHEN** the reminder template is rendered for a customer email
- **THEN** both the HTML and text outputs reflect the same pay-link availability logic
