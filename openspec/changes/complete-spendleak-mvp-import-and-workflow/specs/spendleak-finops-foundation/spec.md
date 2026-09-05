## MODIFIED Requirements

### Requirement: Financial operations dashboard SHALL combine PaidSoon and SpendLeak signals
The system SHALL present SpendLeak findings alongside PaidSoon receivables signals so users can see cash coming in, cash going out, recommended next actions, and current review outcomes in one place.

#### Scenario: User opens the unified financial-operations overview
- **WHEN** a signed-in user with PaidSoon and SpendLeak data opens the relevant dashboard surface
- **THEN** the page shows receivables context, spend findings, and a summarized financial-health view without hiding the existing invoice-chasing workflow
- **AND** the page includes SpendLeak review-outcome visibility for keep, cancel, renegotiate, and ignore decisions

#### Scenario: AI summary is generated from grounded findings
- **WHEN** the user asks where they are wasting money or opens the daily summary
- **THEN** the AI summary is derived from persisted SpendLeak findings and their evidence rather than inventing unsupported recommendations

#### Scenario: Imported expense-source findings are visible with synced-source findings
- **WHEN** SpendLeak contains findings originating from CSV/XLSX expense imports and accounting-provider syncs
- **THEN** the dashboard includes both sources in the same finding and module views
- **AND** each finding remains traceable to its underlying evidence source