## Purpose

Define the owner-facing Cost Guard experience so users can quickly understand spending risk, investigate the cause, and take action without requiring accounting expertise.

## ADDED Requirements

### Requirement: Cost Guard SHALL provide an overview dashboard that prioritises action
The system SHALL expose a Cost Guard overview page that summarises current spend, forecast position, active alerts, and cost health in a format that highlights the most material issues first.

#### Scenario: Owner opens Cost Guard
- **WHEN** a user selects the Cost Guard module from the main PaidSoon navigation
- **THEN** the system shows a summary dashboard with spend this month, month-end forecast, active alerts, and a cost-health status prioritised above historical charts

### Requirement: Cost Guard SHALL use plain-English explanations for alerts
The system SHALL present each alert in owner-friendly language that explains what changed, how big the difference is, what baseline was used, and what action to consider next.

#### Scenario: Alert explains the issue
- **WHEN** a user views an alert card or detail page
- **THEN** the system describes the increase in plain-language terms and shows the actual versus normal comparison with the associated financial impact

### Requirement: Cost Guard SHALL provide alert detail and action flows
The system SHALL support alert detail pages with evidence, financial impact, trend context, contributing transactions, and a standard action panel for acknowledge, investigate, mark as expected, snooze, or resolve.

#### Scenario: Owner reviews a flagged supplier increase
- **WHEN** a user opens an alert detail page
- **THEN** the system displays the severity, explanation, baseline, trend, contributing transactions, and primary next action without requiring a separate accounting workflow

### Requirement: Cost Guard SHALL support supplier and category drill-down views
The system SHALL provide drill-down pages for suppliers and categories so a user can understand which entities are driving spend and which are outside their normal pattern.

#### Scenario: Owner inspects a supplier
- **WHEN** a user opens a supplier detail page
- **THEN** the system shows current spend, historical range, relevant alerts, transactions, and any configured rule or exclusion state

### Requirement: Cost Guard SHALL provide rule configuration and settings experiences
The system SHALL offer a rules page and a Cost Guard settings section where users can tune alert sensitivity, minimum impact thresholds, exclusions, and notification preferences without statistical jargon.

#### Scenario: Owner adjusts alert sensitivity
- **WHEN** a user updates Cost Guard sensitivity or exclusion settings
- **THEN** the system stores the configuration in the tenant's settings model and reflects the new behaviour in future alerts

### Requirement: Cost Guard SHALL surface alerts in the broader product
The system SHALL integrate Cost Guard into the PaidSoon dashboard and notification centre so critical or important cost issues are visible in the general business-control experience.

#### Scenario: Critical cost issue appears
- **WHEN** a significant cost alert is created
- **THEN** the system makes it visible in the main dashboard and notification centre with a direct link to the relevant alert detail page

### Requirement: Cost Guard SHALL remain accessible and responsive
The system SHALL support keyboard navigation, visible focus states, semantic structure, and mobile-friendly layouts while preserving the most important information on smaller screens.

#### Scenario: User navigates on mobile
- **WHEN** a user opens Cost Guard on a phone or tablet
- **THEN** the system presents a condensed layout with severity, issue summary, impact, and primary action clearly visible without requiring dense tables

## MODIFIED Requirements

### Requirement: Cost Guard alert lifecycle SHALL remain explainable and auditable
The system SHALL support lifecycle actions including acknowledge, investigate, expected, snooze, resolve, and ignore while creating an audit trail for each event.

#### Scenario: Owner marks a cost spike as expected
- **WHEN** the user chooses to mark an alert as expected
- **THEN** the alert moves to the expected state and a record is retained describing the action, actor, and reason

## REMOVED Requirements

### Requirement: Cost Guard UI does not require accounting-editing capabilities
**Reason**: This UI is a decision-support and monitoring layer for owners; the existing Cost Guard foundation remains read-only in the MVP and must not turn into an accounting or procurement workflow.
**Migration**: The interface should offer investigation and rule-management actions, but not editing of source accounting records or procurement transactions.
