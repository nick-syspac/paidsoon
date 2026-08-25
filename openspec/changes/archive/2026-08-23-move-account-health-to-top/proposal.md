# Proposal: Move Account Health to Top of Dashboard

## What

Move the **Account health** section (the four `OverviewCards` — Overdue, Chase allowance, Broken promises, Held invoices) from the bottom of the dashboard overview page to immediately below the AI Summary, making it the second visual block a user sees after landing on the dashboard.

## Why

The Account health cards are the highest-signal, most actionable status indicators on the dashboard. Placing them at the bottom means users must scroll past charts and tables before seeing whether their account is in a healthy state. Moving them directly below the AI Summary gives users an at-a-glance health check right at the top of their workflow, consistent with the AI Summary's role as a quick orientation tool.

## Scope

- **`app/dashboard/page.tsx`** — reorder the JSX so the Account health `<div>` renders right after the `currencySummaries.map(...)` block and before `<AttentionRequired>`.
- No data-fetching changes, no new components, no schema changes.

## Out of Scope

- Styling changes to the cards themselves.
- Moving Account health inside `CurrencySummarySection` (cards are account-wide, not per-currency).
- Any changes to the resolved or invoices sub-pages.
