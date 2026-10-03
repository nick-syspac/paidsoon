## MODIFIED Requirements

### Requirement: Data freshness and sync state visibility
The SpendLeak dashboard SHALL show data freshness metadata and sync-state messaging so users can distinguish fresh data, stale data, and not-yet-synced states. When selected expected sources are synced but no findings are generated, the dashboard SHALL also surface selected-source evidence coverage so users can distinguish "data present" from "no alert-grade findings".

#### Scenario: Data is stale
- **WHEN** the latest spend-side sync for selected expected source families is older than the freshness threshold defined by the backend contract
- **THEN** the dashboard displays a stale-data warning with the latest sync timestamp

#### Scenario: No spend-side sync has completed
- **WHEN** the user has connected accounting sources but none of the selected expected source families has a completed spend-side sync record
- **THEN** the dashboard displays a setup/initial-sync state with no fabricated findings

#### Scenario: Only some selected expected sources have synced
- **WHEN** one or more selected expected source families have synced but at least one selected expected source family has not
- **THEN** the dashboard displays a partial-data state that reflects selected-source coverage rather than unselected-source gaps

#### Scenario: Bank-only selected source has synced data and zero findings
- **WHEN** `bank_transactions` is selected, sync has completed for that selected source, and no findings are currently generated
- **THEN** the dashboard displays an empty-findings state that includes selected-source evidence coverage metrics (for example, synced status, recency, and record coverage)
- **AND** the copy clarifies that data is present but no current finding rule has triggered
