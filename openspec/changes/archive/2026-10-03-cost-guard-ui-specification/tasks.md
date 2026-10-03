## 1. UI Architecture and Routing

- [x] 1.1 Create the Cost Guard module route structure under `/cost-guard` and nested alert, supplier, category, and rule paths
- [x] 1.2 Add Cost Guard to the main PaidSoon navigation and settings navigation with the recommended MVP structure
- [x] 1.3 Define the shared layout and section structure for overview, list pages, details, and settings screens

## 2. Overview Dashboard

- [x] 2.1 Build the summary card system for costs this month, forecast, active alerts, and monitored spend
- [x] 2.2 Implement the cost-health status panel and copy that explains the current operational state
- [x] 2.3 Build the “Needs your attention” alert summary with severity, title, explanation, and primary action
- [x] 2.4 Implement the forecast panel with projected vs typical spend and supporting CTA
- [x] 2.5 Add the largest-cost-change and trend panels with appropriate filters and empty states
- [x] 2.6 Add the SpendLeak integration panel when recurring-cost findings are available

## 3. Alert Experience

- [x] 3.1 Implement the alerts list page with filters, sorting, counters, searchable states, and default active view
- [x] 3.2 Implement alert detail pages with financial impact, baseline comparison, trend, and contributing transactions
- [x] 3.3 Add the standard alert action panel and state transitions for acknowledge, investigate, expected, snooze, and resolve
- [x] 3.4 Add audit timeline and explanatory copy for user actions taken on alerts
- [x] 3.5 Implement the mark-as-expected, resolve, and snooze modal workflows

## 4. Supplier and Category Views

- [x] 4.1 Build supplier summary cards and a supplier table with above-normal, new, active-alert, and recurring filters
- [x] 4.2 Implement supplier detail pages with spend trend, active alerts, transactions, recurring costs, and rule information
- [x] 4.3 Build category overview and category detail pages with monthly trend, supplier contributors, transactions, alerts, and rules

## 5. Rules and Settings

- [x] 5.1 Implement the rules overview page and default automatic detection list
- [x] 5.2 Build the rule creation flow for supplier, category, and threshold-based conditions
- [x] 5.3 Add the settings page under `/settings/cost-guard` for enablement, calculations, sensitivity, exclusions, notifications, and data-source status
- [x] 5.4 Implement the first-run onboarding, insufficient-history, no-alerts, error, stale-data, and integration-problem states

## 6. Dashboard and Notification Integration

- [x] 6.1 Add the compact Cost Guard card to the main PaidSoon dashboard with direct CTA to the overview or alerts view
- [x] 6.2 Surface critical and important Cost Guard notifications in the broader notification centre
- [x] 6.3 Ensure dashboard and notification entries link directly to the relevant alert detail page

## 7. Quality, Accessibility, and Responsive Behaviour

- [x] 7.1 Add skeleton loading states for summary cards, alert lists, charts, and tables
- [x] 7.2 Implement error banners, stale-data banners, and empty states that remain useful and reassuring
- [x] 7.3 Validate keyboard navigation, focus states, semantic table headings, and screen-reader labels
- [x] 7.4 Ensure desktop, tablet, and mobile layouts preserve the hierarchy of severity, issue summary, impact, and primary action
- [x] 7.5 Run the relevant front-end validation checks and verify the flows align with the Cost Guard UX specification
