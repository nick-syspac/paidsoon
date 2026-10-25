# Spec Delta

## ADDED Requirements

### Requirement: Settings discovery SHALL scale with module growth
The system SHALL provide a scalable settings discovery experience that supports section collapse/expand state, in-page search/filtering across visible settings, and clear wayfinding from section to setting destination.

#### Scenario: User finds a module setting from search while its section is collapsed
- **WHEN** a user enters a setting label or keyword that belongs to a collapsed section
- **THEN** the matching setting appears in discovery results with its module context
- **AND** selecting the result opens the correct settings page and reveals the owning section in navigation

#### Scenario: User discovers and saves a setting from a module section
- **WHEN** a user navigates from a module section to a settings page and edits a value
- **THEN** the user can save the change using the current page behavior
- **AND** the navigation state continues to indicate the active module and setting

### Requirement: Unsaved settings edits SHALL be protected during navigation
The system SHALL warn users before they leave a settings page with unsaved edits, including nav clicks, browser history navigation, and direct URL changes within authenticated settings.

#### Scenario: User attempts to leave with unsaved changes
- **WHEN** a user has unsaved edits on a settings page and attempts to navigate away
- **THEN** the system shows a leave-confirmation prompt before route transition
- **AND** choosing to stay keeps the user on the current page with edited values intact

## MODIFIED Requirements

### Requirement: Each settings item retains the current route and page
The system SHALL preserve top-level `/settings/*` routes as canonical settings destinations and continue to load the existing setting page implementation at those destinations without duplicate screens.

#### Scenario: User selects an existing settings page
- **WHEN** a user clicks a settings item such as Account, Connections, Schedule, Email, or CashPlan
- **THEN** the content area loads the current page component for that route without creating a duplicate screen or hidden alternate implementation

#### Scenario: User navigates to a legacy redirect route
- **WHEN** a user visits a legacy route such as `/dashboard/settings/stripe` or `/dashboard/settings/integrations`
- **THEN** the existing redirect behaviour continues to resolve to the canonical connections page and preserves query parameters

#### Scenario: Existing helper links continue to work after IA redesign
- **WHEN** a user opens an existing helper or compatibility settings link such as `/settings`, `/settings/stripe`, `/settings/integrations`, `/settings/import`, or `/settings/export`
- **THEN** the system resolves to the canonical destination for that workflow
- **AND** relevant query parameters and anchors are preserved for user feedback and section targeting

### Requirement: Settings navigation respects entitlement and permission rules
The system SHALL only surface settings links that are valid for the user's current tier, entitlements, and module availability, and server-authoritative checks SHALL enforce the same restrictions for direct page URLs and backing settings APIs.

#### Scenario: User without the required entitlement opens a gated settings area
- **WHEN** a user lacks access to a module or feature gate already enforced elsewhere in the app
- **THEN** the corresponding settings entry remains hidden or follows the existing upgrade or unavailable pattern
- **AND** direct route or API attempts return the existing deny outcome for that setting

#### Scenario: SpendLeak remains gated by the current entitlement model
- **WHEN** a user is not eligible for SpendLeak under the current subscription rules
- **THEN** the SpendLeak settings area remains unavailable and the module does not expose a fake settings page

#### Scenario: Settings access remains isolated per active business context
- **WHEN** a user can switch active business or tenant context in the authenticated product
- **THEN** settings navigation visibility, loaded values, and saves are scoped to the currently active context only
- **AND** data from a different context is not shown or mutated by URL reuse

### Requirement: The settings layout remains usable on tablet and mobile
The system SHALL provide an accessible responsive navigation pattern that avoids horizontal overflow, preserves selected module/setting context, and allows fast module switching on smaller breakpoints.

#### Scenario: User opens settings on a tablet or mobile viewport
- **WHEN** the browser is set to a tablet or mobile breakpoint
- **THEN** the settings navigation uses a responsive selector, drawer, or equivalent accessible pattern rather than overflow-only horizontal scrolling
- **AND** the current module and selected setting remain visible and actionable

#### Scenario: Keyboard-only user operates the responsive settings nav
- **WHEN** a keyboard user interacts with the mobile or tablet settings navigation
- **THEN** every control is reachable in logical order and there is no keyboard trap while opening or closing the navigation

#### Scenario: Keyboard-only user searches and switches modules on responsive nav
- **WHEN** a keyboard user opens, searches, or switches modules on mobile or tablet settings navigation
- **THEN** all controls are reachable in logical order with visible focus states
- **AND** there is no keyboard trap while filtering or selecting navigation entries

### Requirement: Settings content keeps the current behaviour of each page
The system SHALL preserve each settings page's existing validation and save semantics, and SHALL keep edited values on-screen when save requests fail so users can correct and retry without re-entry.

#### Scenario: User saves a form on any settings screen
- **WHEN** the user submits a form such as Cost Guard, Email, or Schedule settings
- **THEN** the existing loading, validation, success, and error behavior continues to operate exactly as it does today

#### Scenario: Summary cards use real data where available
- **WHEN** a settings screen includes summary cards such as the CashPlan settings summary
- **THEN** those cards display application data from the current backend state and handle loading, empty, unavailable, and error states without hard-coded production values

#### Scenario: Save request fails after user edits values
- **WHEN** a settings save API request fails after client-side validation passed
- **THEN** the page keeps the user's edited values and displays an error state
- **AND** the user can retry saving without re-entering all previous edits
