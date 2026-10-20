# Spec Delta

## MODIFIED Requirements

### Requirement: CommitGuard SHALL project commitment totals by horizon
The system SHALL calculate currency-partitioned commitment totals for at least 7, 30, 60, and 90 day horizons using recurrence rules and next due dates without pre-generating unnecessary persisted future rows. Occurrences SHALL respect start/end dates and preserve the original calendar anchor, and unsupported recurrence SHALL be reported as incomplete rather than treated as one-off.

#### Scenario: Recurring monthly commitment
- **WHEN** a monthly commitment has a next due date inside the next 90 days
- **THEN** horizon totals include each projected in-horizon occurrence derived from recurrence logic

#### Scenario: Paused or cancelled commitment
- **WHEN** a commitment status is PAUSED or CANCELLED
- **THEN** that commitment is excluded from active future obligation totals for horizons after the status takes effect

#### Scenario: Month-end recurrence
- **WHEN** a monthly schedule is anchored on 31 January 2028
- **THEN** projected dates are 31 January, 29 February, and 31 March, without permanent drift to the 29th

#### Scenario: Old recurrence anchor
- **WHEN** an active weekly schedule began more than 250 occurrences before the requested window
- **THEN** its in-window occurrences are still included without exhausting a historical traversal cap

#### Scenario: Date and custom boundaries
- **WHEN** a commitment starts after the requested window, ends before an occurrence, or has an unsupported custom recurrence
- **THEN** out-of-range occurrences are excluded and unsupported custom recurrence is explicitly flagged instead of producing a complete forecast

### Requirement: Free cash SHALL be computed by a canonical service
The system SHALL compute free cash through one shared contract returning dated cash, currency-specific protection, selected horizon, quality reasons, free cash, and safety status. Complete compatible inputs SHALL yield SAFE, WATCH, AT_RISK, or SHORTFALL; missing, stale, disabled, or incomplete inputs SHALL yield unavailable amounts and no asserted safety status.

#### Scenario: Protected cash components exist
- **WHEN** cash available, commitment protection, tax protection, and safety buffer are all present
- **THEN** the service returns a deterministic free-cash value and a status in SAFE, WATCH, AT_RISK, or SHORTFALL

#### Scenario: CommitGuard data is reused by other modules
- **WHEN** CashPlan or overview summaries request free-cash metrics
- **THEN** they receive values from the shared service output rather than duplicating formula logic in module-specific UI or route code

#### Scenario: Selected protection horizon
- **WHEN** the default horizon is 60 days and an obligation falls on day 45
- **THEN** that obligation reduces protected free cash and the view labels the 60-day context
- **AND** a separately labeled next-30-days metric remains available

#### Scenario: Protection inputs are incomplete
- **WHEN** the selected buffer needs a missing weekly-expense basis or a commitment has unsupported recurrence
- **THEN** free cash is unavailable with the specific missing-input reason and no zero-value substitute is used

## ADDED Requirements

### Requirement: Tax protection SHALL avoid duplicate protection
Explicitly linked tax commitments and enabled tax reserve categories SHALL protect the same reserve once, comparing full required reserve with aggregated covered commitments. Unclassified or currency-unknown overlap SHALL make consolidated free cash incomplete rather than apply an unverifiable deduction or omission.

#### Scenario: Tax commitment matches a reserve obligation
- **WHEN** a selected-horizon tax commitment of 10000 cents explicitly maps to a tax category requiring 12000 cents in the same currency
- **THEN** that liability contributes 12000 cents, not 22000 cents, to combined protection

#### Scenario: Several occurrences share a tax category
- **WHEN** two selected-horizon occurrences cover 6000 cents each of one category requiring 12000 cents
- **THEN** combined protection for that category is 12000 cents, regardless of already reserved cash
- **AND** if covered commitments instead total 15000 cents, combined protection is 15000 cents

#### Scenario: Coverage is duplicated or becomes invalid
- **WHEN** concurrent coverage edits would exceed an occurrence or bill amount, or a linked category is disabled
- **THEN** over-coverage is rejected atomically and stale coverage requires review rather than silently removing commitment protection

#### Scenario: Possible overlap lacks a reviewed link
- **WHEN** a tax-classified commitment coexists with enabled tax protection but has no explicit liability mapping
- **THEN** the summary requests overlap review and does not assert a complete free-cash amount

### Requirement: CashPlan SHALL consume commitment occurrences without double subtraction
The active CashPlan forecast SHALL consume compatible commitment occurrences as identifiable outflows, use gross opening cash rather than free cash, and reconcile explicitly linked source coverage once. Unknown snapshot lineage SHALL be surfaced for review instead of silently stacking commitments onto opaque forecast totals.

#### Scenario: Commitment changes a forecast
- **WHEN** an active same-currency commitment is created or paused
- **THEN** the next CashPlan summary and workspace reflect the changed outflow and use the same occurrence identity and anchor

#### Scenario: Source bill already covers an occurrence
- **WHEN** an explicit same-currency bill link covers 6000 cents of a 10000-cent commitment occurrence
- **AND** that unpaid bill amount is included inside the same forecast window
- **THEN** the forecast includes the bill and only the remaining 4000-cent commitment outflow

#### Scenario: Covered bill is not a forecast outflow
- **WHEN** the linked bill is paid, missing, excluded, currency-incompatible, or outside the forecast window
- **THEN** the commitment remains an outflow without that bill deduction and the coverage issue is surfaced

#### Scenario: Attested starting balance predates forecast
- **WHEN** a still-fresh balance date precedes the forecast anchor date
- **THEN** the forecast labels its starting cash as a dated unreconciled estimate and remains preliminary rather than claiming a current bank balance

#### Scenario: Legacy snapshot has no reconstructable inputs
- **WHEN** CashPlan has an opaque legacy snapshot whose coverage cannot be established
- **THEN** it is retained as historical, not silently merged with commitments, and any new commitment-only forecast is labeled preliminary with its source coverage

#### Scenario: Bounded CashPlan storage uses actual plan ownership
- **WHEN** an authenticated tenant reads overrides or reads/appends a base version-2 snapshot
- **THEN** explicit minimum grants and RLS authorize only rows whose actual plan_id references that tenant's cash_plans row
- **AND** foreign-plan insertion or selection cannot be authorized by supplying the caller's owner or created_by identity
- **AND** anonymous access, plan/owner reassignment, snapshot UPDATE/DELETE and non-null scenario insertion are denied

#### Scenario: Narrow ACL artifact is repeatable without unrelated permission changes
- **WHEN** the reviewed CashPlan-only artifact is applied twice on the authorized isolated database clone
- **THEN** canonical and targeted policy blocks match, effective ACLs/policies are equivalent after each application, and unrelated schema/ACLs remain unchanged
- **AND** actual refresh and fenced evaluation append snapshots without diagnostic grants, while a failed final fence rolls financial writes back
- **AND** local verification does not authorize shared-database SQL, scheduler activation or broader trial/billing permission changes