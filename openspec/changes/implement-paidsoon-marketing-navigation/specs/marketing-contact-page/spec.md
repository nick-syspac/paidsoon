## ADDED Requirements

### Requirement: Contact page SHALL render a contact form
The `/contact` page SHALL render a form with fields for: name, email address, enquiry type (Sales, Support, Accountant Partnership), and message. The form SHALL include a submit button.

#### Scenario: Contact form fields are present
- **WHEN** a visitor loads `/contact`
- **THEN** fields for name, email, enquiry type, and message are visible

### Requirement: Contact form SHALL support multiple enquiry types
The enquiry type field SHALL offer at least three options: Sales, Support, and Accountant Partnership.

#### Scenario: Enquiry type options are selectable
- **WHEN** a visitor interacts with the enquiry type field
- **THEN** at least Sales, Support, and Accountant Partnership options are available

### Requirement: Contact form submission SHALL display a placeholder response
The contact form's submit action SHALL call the `/api/contact` endpoint. If the endpoint returns a non-success response (e.g., `501 Not Implemented`), the form SHALL display a fallback message with a direct contact email address. If the endpoint succeeds (future implementation), the form SHALL display a confirmation message.

#### Scenario: Form shows fallback on 501 response
- **WHEN** a visitor submits the contact form and the API returns 501
- **THEN** a message is displayed advising the visitor to contact support@paidsoon.com.au directly

### Requirement: Contact page SHALL include a demo request CTA
The `/contact` page SHALL include a visible "Request a Demo" or equivalent CTA alongside the contact form.

#### Scenario: Demo CTA is present
- **WHEN** a visitor views `/contact`
- **THEN** a demo request option or link is visible

### Requirement: Contact page SHALL have unique page metadata
The `/contact` page SHALL export `generateMetadata` returning a unique `title` and `description`.

#### Scenario: Metadata is set
- **WHEN** the contact page is rendered server-side
- **THEN** the `<title>` tag contains a contact-specific title
