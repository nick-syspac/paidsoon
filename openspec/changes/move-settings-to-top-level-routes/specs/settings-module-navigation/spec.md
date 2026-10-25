# Spec Delta

## MODIFIED Requirements

### Requirement: Settings navigation is grouped by product module
The system SHALL render a dedicated settings navigation column that groups links under the product modules General, PaidSoon, SpendLeak, CostGuard, and CashPlan, using top-level `/settings/*` routes as the canonical destinations.

#### Scenario: User opens the Settings area on desktop
- **WHEN** an authenticated user opens the Settings area from the authenticated application navigation
- **THEN** the view shows a settings navigation column and a settings content panel without the dashboard module sidebar
- **AND** the settings navigation groups links under General, PaidSoon, SpendLeak, CostGuard, and CashPlan

#### Scenario: User sees the correct settings group labels
- **WHEN** the Settings navigation renders
- **THEN** each group heading is visually distinct from the selectable links and uses the same hierarchy patterns already used throughout the app

### Requirement: Each settings item retains the current route and page
The system SHALL preserve the existing settings page components while changing canonical settings destinations from `/dashboard/settings/*` to `/settings/*`.

#### Scenario: User selects an existing settings page
- **WHEN** a user clicks a settings item such as Account, Connections, Schedule, Email, or CashPlan
- **THEN** the content area loads the current page component for that setting using the `/settings/*` route for that destination

#### Scenario: User navigates to a legacy redirect route
- **WHEN** a user visits a legacy route such as `/settings/stripe` or `/settings/integrations`
- **THEN** the existing redirect behaviour resolves to the canonical connections page and preserves query parameters

### Requirement: The active settings item is clearly visible and semantically marked
The system SHALL visibly highlight the active settings item and expose the correct semantics for assistive technology using the browser's current pathname and the appropriate active-page markup.

#### Scenario: User lands on a nested settings URL
- **WHEN** a user refreshes a nested settings URL such as `/settings/cash-plan`
- **THEN** the corresponding link remains active and the page content remains aligned with the selected setting

#### Scenario: User uses the browser back and forward controls
- **WHEN** a user navigates between grouped settings entries and uses the browser history controls
- **THEN** the correct screen and active state are restored without a stale or mismatched selection
