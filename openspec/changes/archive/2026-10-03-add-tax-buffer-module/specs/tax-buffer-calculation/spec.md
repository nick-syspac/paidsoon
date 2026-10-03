## Purpose

Define deterministic Tax Buffer calculations that combine available financial inputs into explainable reserve requirements, confidence indicators, reserve gaps, and safe-to-spend outputs.

## ADDED Requirements

### Requirement: Tax Buffer SHALL compute category-level reserve estimates deterministically
The system SHALL calculate GST, PAYG withholding, PAYG instalment, income/company tax, and custom reserve category values from configured methods and available source data.

#### Scenario: Mixed source data with configurable methods
- **WHEN** the calculation engine runs for a tenant period
- **THEN** each enabled category uses its configured method and available inputs
- **THEN** categories lacking sufficient data are flagged as estimated or unknown instead of silently treated as exact

### Requirement: Tax Buffer SHALL compute safe-to-spend cash
The system SHALL expose safe-to-spend cash as available cash minus total effective tax reserve minus other shared committed obligations.

#### Scenario: Reserve gap impacts safe-to-spend output
- **WHEN** available cash and obligations are present
- **THEN** the response includes available cash, total required reserve, total reserved, reserve gap, and safe-to-spend amount
- **THEN** the same values are consumable by dashboard and CashPlan summary surfaces

### Requirement: Tax Buffer SHALL support accounting-basis-aware GST behavior
The system SHALL support both cash and accrual accounting basis modes for GST reserve timing behavior.

#### Scenario: Unpaid invoice under cash basis
- **WHEN** accounting basis is cash and an invoice remains unpaid
- **THEN** GST reserve logic excludes that unpaid invoice unless explicit tenant rules include it

#### Scenario: Unpaid invoice under accrual basis
- **WHEN** accounting basis is accrual and an invoice is issued
- **THEN** GST reserve logic includes eligible GST obligations according to configured accrual treatment

### Requirement: Tax Buffer SHALL produce explainability and confidence details
The system SHALL return calculation breakdown inputs, source labels, and confidence bands for each category and recommendation.

#### Scenario: User requests calculation explanation
- **WHEN** a user opens the explanation view for a reserve category
- **THEN** the system shows input values, arithmetic breakdown, source labels, and confidence band
- **THEN** the output avoids opaque black-box scoring without evidence fields
