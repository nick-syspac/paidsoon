## Purpose

Define the dedicated public landing-page behavior for individual integrations so prospects can understand provider-specific setup, supported workflows, and how PaidSoon differs from native provider reminders.

## ADDED Requirements

### Requirement: Marketed integrations SHALL have dedicated provider-specific landing pages
Each integration or import path described as publicly available or actively marketed on the marketing site SHALL have its own canonical landing page describing what data source is supported, how setup works, what workflows PaidSoon enables, and the primary next action.

#### Scenario: Visitor opens a provider landing page
- **WHEN** a visitor requests a public integration destination such as Xero or MYOB
- **THEN** the page explains the provider-specific setup path, supported workflows, and next action for that provider

#### Scenario: Integrations index routes into provider pages
- **WHEN** a visitor browses the main integrations page
- **THEN** each publicly marketed available integration includes a path to its dedicated landing page

### Requirement: Integration landing pages SHALL explain PaidSoon's differentiated value
Each provider-specific integration page SHALL explain how PaidSoon complements the provider rather than presenting it as a replacement, and SHALL distinguish PaidSoon's reminder and cash-control workflows from the provider's native accounting or reminder functionality.

#### Scenario: Provider page clarifies positioning
- **WHEN** a visitor reads an integration landing page
- **THEN** the page states that the accounting provider remains the source of record
- **AND** it explains the PaidSoon workflow layered on top of that provider's data

#### Scenario: Provider page addresses native reminders comparison
- **WHEN** a visitor evaluates whether PaidSoon adds value beyond a provider's built-in reminders
- **THEN** the page includes provider-specific comparison copy describing the added follow-up or cash-control workflow in accurate, non-replacement terms
