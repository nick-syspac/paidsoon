# Spec Delta

## ADDED Requirements

### Requirement: Public marketing MUST distinguish PaidSoon the platform from InvoiceGuard the invoice module
Public marketing content SHALL use PaidSoon for the platform, company, plans, and platform-wide legal content, and InvoiceGuard for the invoice follow-up module; internal identifiers MAY remain unchanged.

#### Scenario: Invoice follow-up module is introduced
- **WHEN** public marketing introduces the invoice follow-up capability
- **THEN** it identifies the module as “InvoiceGuard — automated invoice follow-ups to help you get paid sooner.”
- **AND** it does not use PaidSoon or “Invoice Chasing” as the customer-facing module name

#### Scenario: Platform brand appears beside a module name
- **WHEN** public copy describes the invoice module in relation to the platform
- **THEN** it uses wording such as “InvoiceGuard by PaidSoon” while retaining PaidSoon as the overall product and company brand

### Requirement: InvoiceGuard marketing claims MUST remain within verified invoice-follow-up behavior
Public InvoiceGuard copy SHALL describe only invoice-follow-up capabilities verified as implemented, and MUST NOT guarantee payment or imply unimplemented behavior.

#### Scenario: Visitor reads InvoiceGuard capabilities
- **WHEN** a visitor reads InvoiceGuard feature, comparison, pricing, FAQ, or structured-data content
- **THEN** claims about automated reminders, payment promises, or dispute handling match implemented product behavior and plan availability
- **AND** the copy does not guarantee that an invoice will be paid