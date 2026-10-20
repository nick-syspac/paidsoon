# Spec Delta

## MODIFIED Requirements

### Requirement: CommitGuard SHALL provide core cash-position hero metrics
The dashboard SHALL display Available Cash, Committed (Next 30 Days), Protected Cash, and Free Cash from the shared tenant-scoped contract. Cash currency, owner-entered balance date, selected protection horizon, and input-quality reasons SHALL be visible; detection count SHALL be separate from these four metrics.

#### Scenario: User opens CommitGuard dashboard
- **WHEN** an authenticated user navigates to the CommitGuard dashboard
- **THEN** hero metrics render with values from tenant-scoped CommitGuard and related protection services

#### Scenario: Insufficient buffer detected
- **WHEN** free-cash status is AT_RISK or SHORTFALL
- **THEN** the dashboard displays explicit risk wording and does not rely on color alone to communicate severity

#### Scenario: Missing or stale cash
- **WHEN** cash inputs are absent, stale, or incompatible
- **THEN** the dashboard explains unavailable free cash and offers the relevant input/review action instead of showing WATCH or a fabricated balance

### Requirement: CommitGuard SHALL provide horizon and upcoming obligation views
The dashboard SHALL include currency-separated 7/30/60/90-day totals and an upcoming list with usable search, sorting, pagination, and category, status, essentiality, recurrence, source, and due-period filters. Confirmed, probable, and potential amounts SHALL be labeled, and relationship links SHALL select the actual linked records.

#### Scenario: User filters upcoming commitments
- **WHEN** a user applies category and due-period filters
- **THEN** the list updates to matching commitments while preserving tenant isolation and pagination behavior

#### Scenario: No commitments exist
- **WHEN** a tenant has no commitments
- **THEN** CommitGuard renders an empty state with actionable next steps that map to available product actions

#### Scenario: More than one page exists
- **WHEN** more than twelve commitments match the current filters
- **THEN** keyboard-accessible previous/next controls reach every matching record and preserve filters and sorting

#### Scenario: SpendLeak relationship link
- **WHEN** a user follows a finding's linked-commitments action
- **THEN** the destination filters by that finding identity rather than matching its summary text

## ADDED Requirements

### Requirement: Mutations SHALL refresh all financial surfaces
After a successful commitment, detection-review, cash-input, or settings mutation, the visible hero metrics, horizon totals, upcoming list, renewal list, and review count SHALL refresh from the committed state without a manual reload. Refresh failures SHALL be visible and SHALL NOT be represented as mutation failure or success with current figures.

#### Scenario: Commitment is paused in the workspace
- **WHEN** pause succeeds
- **THEN** the lifecycle row is paused and all displayed financial totals and renewal context exclude it consistently

#### Scenario: Save succeeds but refresh fails
- **WHEN** a mutation commits and subsequent summary retrieval fails
- **THEN** the UI reports that the save succeeded but figures could not refresh and offers retry without automatically repeating the mutation

### Requirement: Alert history SHALL be visible to its tenant
The workspace SHALL expose paginated CommitGuard alert history with severity, event time, currency-aware impact, action context, and current versus historical relevance. Users SHALL NOT need to call an API manually to discover due, renewal, detection, or cash-risk alerts.

#### Scenario: Owner reviews a due alert
- **WHEN** scheduled evaluation records a relevant due-soon event
- **THEN** the owner can reach it in CommitGuard and navigate to the corresponding tenant-owned commitment