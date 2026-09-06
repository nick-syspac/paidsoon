## Why

SpendLeak has schema and roadmap positioning but no usable product surface under /dashboard today. A focused frontend buildout is needed so users can actually see spend insights, understand evidence, and act without waiting for a full platform rewrite.

## What Changes

- Add a dedicated SpendLeak dashboard surface under /dashboard for spend-side visibility.
- Add insight cards and tabular modules for recurring spend, duplicate spend, renewals, supplier concentration, and cash-pressure signals.
- Add drill-down evidence views so each finding shows source records, timestamps, and rationale.
- Add a unified financial-operations summary section that combines receivables (PaidSoon) and spend-side (SpendLeak) signals in one view.
- Add frontend state handling for empty datasets, partial syncs, loading, and stale-data warnings.
- Add frontend lifecycle controls for findings (dismiss, resolve, snooze) where backed by existing policies.
- Add dashboard tests covering empty, partial, and populated SpendLeak states plus mixed PaidSoon + SpendLeak rendering.

## Capabilities

### New Capabilities
- `spendleak-dashboard`: SpendLeak dashboard route and UI composition for spend insights and cash-out signals.
- `spendleak-insight-drilldowns`: Evidence-first detail panels for each SpendLeak insight.
- `spendleak-finding-lifecycle-ui`: User-facing controls and status presentation for insight lifecycle actions.

### Modified Capabilities
- `dashboard-overview`: Extend the existing overview experience to include a combined financial-operations snapshot that pairs cash-in and cash-out signals.

## Impact

- Affected frontend routes/components: dashboard route segments and dashboard UI components under app/components.
- Affected API contracts: dashboard-facing read/action endpoints used by the new SpendLeak surfaces (existing or newly added).
- Testing impact: new route/component tests and updated dashboard overview assertions.
- UX impact: users gain an actionable spend-side experience rather than roadmap-only positioning.
