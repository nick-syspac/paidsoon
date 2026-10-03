## 1. Settings inventory and route mapping

- [x] 1.1 Confirm the canonical settings routes and redirect behaviour in `app/dashboard/settings/**` and related tests
- [x] 1.2 Map each existing settings page to its target module group and document any route gaps or future-only items without inventing placeholder pages
- [x] 1.3 Finalise the settings-module route table and confirm the change scope remains limited to navigation and layout, not business logic

## 2. Navigation configuration and data model

- [x] 2.1 Define a single settings-navigation configuration structure with module group metadata, route, label, order, entitlement checks, and active-route matching rules
- [x] 2.2 Ensure the config preserves route compatibility for existing aliases and canonical settings URLs
- [x] 2.3 Add the shared configuration hooks required for module rendering and active-state resolution without duplicating route lists across UI files

## 3. Desktop layout and content structure

- [x] 3.1 Update the settings shell to retain the app sidebar and header while inserting a dedicated settings navigation column between the app nav and content panel
- [x] 3.2 Render grouped settings headings and links using the existing design system style tokens, spacing, and typography patterns
- [x] 3.3 Keep the selected settings page content within the main panel and ensure the active item is visibly and semantically marked

## 4. Responsive behaviour and mobile navigation

- [x] 4.1 Design and document the responsive pattern for tablet/mobile settings navigation (drawer or grouped selector) that fits the app’s current shell
- [x] 4.2 Implement the responsive navigation behaviour without horizontal overflow and with the current module/setting still visible
- [x] 4.3 Verify keyboard and touch accessibility for opening, selecting, and closing the mobile settings navigation without traps or hidden focus loss

## 5. Accessibility and state handling

- [x] 5.1 Add semantic navigation landmarks and accessible naming for the settings navigation
- [x] 5.2 Ensure active-page state is exposed as both visible styling and `aria-current="page"` semantics
- [x] 5.3 Confirm visible focus states, contrast, and heading hierarchy meet the accessibility requirements for the settings layout
- [x] 5.4 Verify refreshing a settings route preserves the correct active item and content after a navigation state restore

## 6. Validation, testing, and documentation

- [x] 6.1 Extend settings and route tests to cover navigation configuration, active state, permissions, deep linking, and browser history expectations
- [x] 6.2 Add or update any documentation needed to describe the new grouping and route compatibility constraints
- [x] 6.3 Run the repository OpenSpec validation for this change and resolve any schema or artifact issues
- [x] 6.4 Re-run the relevant settings-navigation tests to confirm the proposal remains aligned with the current implementation without modifying business logic
