## Purpose

This capability defines a module-based settings navigation that matches PaidSoon’s product layout while preserving the existing route structure, permissions, and settings forms already implemented in the app.

## ADDED Requirements

### Requirement: Settings navigation is grouped by product module
The system SHALL render a dedicated settings navigation column that groups links under the product modules General, PaidSoon, SpendLeak, CostGuard, and CashPlan, using the existing application shell and current settings screens as the canonical destinations.

#### Scenario: User opens the Settings area on desktop
- **WHEN** an authenticated user opens the Settings area from the dashboard shell
- **THEN** the view shows the application sidebar, a dedicated settings navigation column, and a settings content panel
- **AND** the settings navigation groups links under General, PaidSoon, SpendLeak, CostGuard, and CashPlan

#### Scenario: User sees the correct settings group labels
- **WHEN** the Settings navigation renders
- **THEN** each group heading is visually distinct from the selectable links and uses the same hierarchy patterns already used throughout the app

### Requirement: Each settings item retains the current route and page
The system SHALL preserve the current settings destination routes as the canonical locations for the underlying settings UI instead of duplicating or renaming screens.

#### Scenario: User selects an existing settings page
- **WHEN** a user clicks a settings item such as Account, Connections, Schedule, Email, or CashPlan
- **THEN** the content area loads the current page component for that route without creating a duplicate screen or a hidden alternate implementation

#### Scenario: User navigates to a legacy redirect route
- **WHEN** a user visits a legacy route such as `/dashboard/settings/stripe` or `/dashboard/settings/integrations`
- **THEN** the existing redirect behaviour continues to resolve to the canonical connections page and preserves query parameters

### Requirement: The active settings item is clearly visible and semantically marked
The system SHALL visibly highlight the active settings item and expose the correct semantics for assistive technology using the browser's current pathname and the appropriate active-page markup.

#### Scenario: User lands on a nested settings URL
- **WHEN** a user refreshes a nested settings URL such as `/dashboard/settings/cash-plan`
- **THEN** the corresponding link remains active and the page content remains aligned with the selected setting

#### Scenario: User uses the browser back and forward controls
- **WHEN** a user navigates between grouped settings entries and uses the browser history controls
- **THEN** the correct screen and active state are restored without a stale or mismatched selection

### Requirement: Settings navigation respects entitlement and permission rules
The system SHALL only surface settings links that are valid for the user's current tier, plan entitlements, and module availability, using the existing feature-gating logic already implemented in the repo.

#### Scenario: User without the required entitlement opens a gated settings area
- **WHEN** a user lacks access to a module or feature gate already enforced elsewhere in the app
- **THEN** the corresponding settings entry either remains hidden or follows the existing upgrade or not-available pattern rather than exposing a misleading or duplicate control

#### Scenario: SpendLeak remains gated by the current entitlement model
- **WHEN** a user is not eligible for SpendLeak under the current subscription rules
- **THEN** the SpendLeak settings area remains unavailable and the module does not expose a fake settings page

### Requirement: The settings layout remains usable on tablet and mobile
The system SHALL prevent horizontal overflow and convert the settings navigation into an accessible responsive pattern on smaller breakpoints while preserving the current module and selected setting context.

#### Scenario: User opens settings on a tablet or mobile viewport
- **WHEN** the browser is set to a smaller breakpoint
- **THEN** the settings navigation uses an accessible drawer or grouped selector instead of a horizontally overflowing nav strip
- **AND** the current module and setting remain visible and selectable

#### Scenario: Keyboard-only user operates the responsive settings nav
- **WHEN** a keyboard user interacts with the mobile or tablet settings navigation
- **THEN** every control is reachable in logical order and there is no keyboard trap while opening or closing the navigation

### Requirement: Settings content keeps the current behaviour of each page
The system SHALL preserve each existing settings page's forms, validation, save state, error handling, and success messaging while only regrouping the navigation architecture around them.

#### Scenario: User saves a form on any settings screen
- **WHEN** the user submits a form such as Cost Guard, Email, or Schedule settings
- **THEN** the existing loading, validation, success, and error behaviour continues to operate exactly as it does today

#### Scenario: Summary cards use real data where available
- **WHEN** a settings screen includes summary cards such as the CashPlan settings summary
- **THEN** those cards display application data from the current backend state and handle loading, empty, unavailable, and error states without hard-coded production values

### Requirement: Accessibility standards are maintained throughout the settings redesign
The system SHALL provide semantic navigation landmarks, visible focus indication, correct active-page semantics, sufficient contrast, and logical heading structure across the grouped settings layout.

#### Scenario: Screen-reader user identifies settings navigation
- **WHEN** a user navigates the settings page with assistive technology
- **THEN** the settings menu has an accessible name and the links are structured with semantic navigation landmarks

#### Scenario: Keyboard user reaches all settings links
- **WHEN** a user tabs through the settings area
- **THEN** every settings link has a visible focus indicator and the active item is represented via both styling and `aria-current="page"`

### Requirement: The module layout is data-driven and consistent
The system SHALL define settings group membership and entry metadata in a single configuration structure with fields for module/group identifier, label, route, permission requirement, feature gate or entitlement requirement, order, and active-route matching rules.

#### Scenario: New or reordered settings modules are managed centrally
- **WHEN** the product adds or reorders settings groups or entries
- **THEN** the settings layout uses the shared configuration to render the navigation consistently without duplicate hard-coded lists or per-page edits

## REMOVED Requirements

### Requirement: Flat-tab settings list without grouping
**Reason**: The old flat list does not reflect the real product architecture and makes module discovery harder for users.
**Migration**: Replace the flat tab array with a grouped configuration-driven layout while retaining the same underlying routes and existing page components.
