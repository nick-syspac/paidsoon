## Purpose

Define the grounded owner-facing summary layer that explains SpendLeak findings without inventing unsupported claims.

## ADDED Requirements

### Requirement: SpendLeak AI summary shall be grounded in persisted findings
The system SHALL generate owner-facing SpendLeak summaries only from persisted findings and their evidence. The summary SHALL not invent findings, savings, or risks that are not supported by the stored analysis.

#### Scenario: Summary is generated from existing findings
- **WHEN** a tenant has persisted SpendLeak findings
- **THEN** the system produces a summary that references those findings and their evidence

#### Scenario: Summary is requested without findings
- **WHEN** a tenant has no persisted SpendLeak findings
- **THEN** the system returns a safe fallback message instead of fabricating opportunities

### Requirement: SpendLeak AI summary shall respect data freshness and confidence
The system SHALL vary its language based on freshness and evidence strength, and it SHALL make stale or partial-data states explicit when the underlying spend data is not current enough for strong recommendations.

#### Scenario: Data is stale
- **WHEN** the latest spend-side sync is older than the freshness threshold
- **THEN** the summary makes that staleness explicit and avoids overconfident language

#### Scenario: Evidence confidence is weak
- **WHEN** a finding's evidence is sparse or low confidence
- **THEN** the summary phrases the recommendation cautiously instead of overstating certainty

### Requirement: SpendLeak AI summary shall stay consistent with the detector output
The system SHALL treat detector output as authoritative for SpendLeak summaries and SHALL not broaden, merge, or rename findings in a way that changes the underlying meaning.

#### Scenario: Multiple findings are present
- **WHEN** recurring spend, duplicate spend, and renewal findings all exist
- **THEN** the summary groups them in a readable way but keeps the underlying finding categories intact

#### Scenario: Detector output changes after a re-sync
- **WHEN** new spend data changes the set of persisted findings
- **THEN** the next summary reflects the updated findings and does not retain stale claims