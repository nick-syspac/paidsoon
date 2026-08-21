## ADDED Requirements

### Requirement: Dashboard tab navigation
The `/dashboard` area SHALL present three tabs — Overview, Invoices, and
Resolved Invoices — routed at `/dashboard`, `/dashboard/invoices`, and
`/dashboard/resolved` respectively. The tabs SHALL be arranged as a vertical
list on the left side of the page, with the selected tab's content rendered to
the right. The navigation SHALL visually indicate which tab is active.

#### Scenario: Owner navigates between tabs
- **WHEN** an authenticated business owner visits `/dashboard`
- **THEN** the system displays the Overview tab as active in the left-side
  navigation and renders links to the Invoices and Resolved Invoices tabs

#### Scenario: Active tab is highlighted
- **WHEN** an authenticated business owner visits `/dashboard/invoices`
- **THEN** the Invoices tab is visually marked as active in the left-side
  navigation and Overview/Resolved Invoices are not

### Requirement: Overview tab is visible to every subscription tier
The Overview tab and its summary cards SHALL be visible to every subscription
tier without a feature-flag gate, consistent with `overdue_invoice_dashboard`
and `payment_status_dashboard` being `true` for every tier in the plan catalog.

#### Scenario: Starter-tier owner views Overview
- **WHEN** a user on the `starter` tier visits `/dashboard`
- **THEN** the system renders the Overview summary cards without redirecting to
  a locked/upgrade preview

### Requirement: Overview summary cards
The Overview tab SHALL render four summary cards — Overdue, Chase allowance,
Broken promises, and Held invoices — each showing a severity indicator
(green, yellow, or red) and the underlying count/amount driving that severity.

#### Scenario: Healthy account shows all-green cards
- **WHEN** an owner has no active invoices past `currentStage` 1, no broken
  promises, no held invoices, and chase allowance usage below the near-limit
  threshold
- **THEN** all four Overview cards render with green severity

#### Scenario: At-risk account shows mixed severity
- **WHEN** an owner has at least one active invoice at `currentStage` 3 and at
  least one debtor over the broken-promise escalation threshold
- **THEN** the Overdue card renders red and the Broken promises card renders red,
  independent of the other two cards' severities

### Requirement: Overdue card severity derivation
The Overdue card's severity SHALL be computed from the highest `currentStage`
among the owner's active invoices (statuses `pending`, `paused`, `snoozed`,
`sequence_complete`): green when no active invoice has `currentStage >= 2`,
yellow when the highest active `currentStage` is `2`, red when at least one
active invoice has `currentStage === 3`.

#### Scenario: All invoices still in early sequence
- **WHEN** every active invoice has `currentStage` of `0` or `1`
- **THEN** the Overdue card renders green

#### Scenario: An invoice reached the final reminder unresolved
- **WHEN** at least one active invoice has `currentStage === 3`
- **THEN** the Overdue card renders red regardless of other invoices' stages

### Requirement: Chase allowance card severity derivation
The Chase allowance card's severity SHALL mirror the existing chase-allowance
status: green when neither `nearLimit` nor `atCapacity` is true, yellow when
`nearLimit` is true, red when `atCapacity` is true.

#### Scenario: Owner is near their monthly chase limit
- **WHEN** `getChaseAllowanceStatus` reports `nearLimit: true` and
  `atCapacity: false` for the current billing period
- **THEN** the Chase allowance card renders yellow and shows usage vs. allowance

#### Scenario: Owner is at their monthly chase limit
- **WHEN** `getChaseAllowanceStatus` reports `atCapacity: true`
- **THEN** the Chase allowance card renders red

### Requirement: Broken promises card severity derivation
The Broken promises card's severity SHALL be red when at least one debtor has
a broken-promise count at or above the owner's escalation threshold, and green
otherwise. This card has no yellow state.

#### Scenario: No broken promises
- **WHEN** the owner has zero debtors with a broken promise-to-pay at or above
  the escalation threshold
- **THEN** the Broken promises card renders green

#### Scenario: A debtor has broken a promise past the threshold
- **WHEN** at least one debtor has a broken-promise count at or above the
  owner's escalation threshold
- **THEN** the Broken promises card renders red and shows the count of
  affected debtors

### Requirement: Held invoices card severity derivation
The Held invoices card's severity SHALL be yellow when one or more active
invoices are held pending chase-volume allowance reset, and green otherwise.
This card has no red state.

#### Scenario: No invoices are held
- **WHEN** the owner has zero invoices awaiting chase-volume allowance reset
- **THEN** the Held invoices card renders green

#### Scenario: Invoices are waiting on allowance reset
- **WHEN** one or more active invoices are due for their first reminder but the
  owner has no remaining chase-volume allowance this period
- **THEN** the Held invoices card renders yellow and shows the held count

### Requirement: Overview card click-through
Each Overview summary card SHALL link to the Invoices tab filtered to the
subset of invoices driving that card's severity.

#### Scenario: Owner clicks the Broken promises card
- **WHEN** an owner clicks the Broken promises card while it is red
- **THEN** the system navigates to `/dashboard/invoices` filtered to invoices
  belonging to debtors with a broken promise at or above the escalation threshold

### Requirement: Invoices tab
The Invoices tab (`/dashboard/invoices`) SHALL render the same active-invoice
table and behavior previously available at `/dashboard` (statuses `pending`,
`paused`, `snoozed`, `sequence_complete`), unchanged in table content and
row-level interactions.

#### Scenario: Owner views active invoices
- **WHEN** an authenticated owner with active invoices visits
  `/dashboard/invoices`
- **THEN** the system renders the invoice table sorted by next email date,
  identical in content to the table previously shown at `/dashboard`

### Requirement: Resolved Invoices tab
The Resolved Invoices tab (`/dashboard/resolved`) SHALL render the same
resolved-invoice table and behavior previously available at
`/dashboard?resolved=1` (statuses `paid`, `manually_resolved`), as a standalone
route rather than a query parameter.

#### Scenario: Owner views resolved invoices
- **WHEN** an authenticated owner visits `/dashboard/resolved`
- **THEN** the system renders the resolved-invoice table sorted by most
  recently updated

#### Scenario: Legacy resolved link still works
- **WHEN** a request is made to `/dashboard?resolved=1`
- **THEN** the system redirects to `/dashboard/resolved`
