## MODIFIED Requirements

### Requirement: Data freshness and sync state visibility
The SpendLeak dashboard SHALL show data freshness metadata and sync-state messaging so users can distinguish fresh data, stale data, and not-yet-synced states. Sync completeness SHALL be evaluated against the tenant's selected expected source families rather than a fixed global source count.

#### Scenario: Data is stale
- **WHEN** the latest spend-side sync for selected expected source families is older than the freshness threshold defined by the backend contract
- **THEN** the dashboard displays a stale-data warning with the latest sync timestamp

#### Scenario: No spend-side sync has completed
- **WHEN** the user has connected accounting sources but none of the selected expected source families has a completed spend-side sync record
- **THEN** the dashboard displays a setup/initial-sync state with no fabricated findings

#### Scenario: Only some selected expected sources have synced
- **WHEN** one or more selected expected source families have synced but at least one selected expected source family has not
- **THEN** the dashboard displays a partial-data state that reflects selected-source coverage rather than unselected-source gaps
