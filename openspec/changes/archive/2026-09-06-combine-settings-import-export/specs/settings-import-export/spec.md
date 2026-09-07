## Purpose

Give users one Settings location for the related invoice import, expense import, and invoice export workflows so they can move data in and out of PaidSoon without switching between separate tabs.

## ADDED Requirements

### Requirement: Settings exposes one combined import/export tab
The system SHALL present invoice import, expense import, and invoice export from a single Settings tab rather than as separate top-level tabs.

#### Scenario: User opens the combined settings tab
- **WHEN** an authorised user opens the Settings import/export area
- **THEN** the page shows invoice import, expense import, and invoice export as distinct sections on one screen
- **AND** the page does not require switching to a separate Settings tab to reach any of those workflows

### Requirement: Combined settings page preserves workflow-specific behavior
The system SHALL preserve the existing behavior of the invoice import, expense import, and invoice export workflows when they are surfaced from the combined Settings page.

#### Scenario: User starts each workflow from the combined page
- **WHEN** a user starts invoice import, expense import, or invoice export from the combined Settings page
- **THEN** each workflow continues to apply its own validation, permission checks, and output behavior
- **AND** invoice export remains plan-gated according to the existing export entitlement rules

### Requirement: Legacy settings routes remain reachable
The system SHALL keep existing import and export deep links working by redirecting or aliasing them to the combined Settings surface.

#### Scenario: User visits an old import or export URL
- **WHEN** a user opens a previously valid Settings import or export route directly
- **THEN** the system routes them to the combined import/export surface or the matching section within it
- **AND** the user does not lose access to the underlying workflow

### Requirement: Combined page removes duplicated export heading
The system SHALL avoid repeating a standalone invoice-export heading above the export section when the export workflow is already nested inside the combined Settings tab.

#### Scenario: User views the export section in context
- **WHEN** a user reaches the invoice export section from the combined Settings page
- **THEN** the section appears as part of the shared import/export page structure
- **AND** the page does not present a redundant extra invoice-export header above the workflow controls