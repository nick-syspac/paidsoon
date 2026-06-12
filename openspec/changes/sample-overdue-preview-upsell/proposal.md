## Why

The current locked-state dashboard message is informational but not persuasive, so users do not clearly understand the value of unlocking dashboard features. Replacing the bland lock message with a realistic sample preview and a contextual upgrade recommendation should increase clarity and upgrade intent without exposing real premium data.

## What Changes

- Replace the current locked-state banner on the overdue/resolved dashboard with a sample-only preview module that demonstrates dashboard value.
- Ensure locked users see synthetic example rows only (not live invoice records) to avoid giving away premium functionality.
- Add adaptive upgrade recommendation logic that suggests the next plan tier based on the user's current tier and proximity to limits.
- Add copy and CTA behavior for "near-limit" users so upsell messaging becomes more relevant and timely.

## Capabilities

### New Capabilities
- `dashboard-sample-preview-upsell`: Defines locked-dashboard sample rendering and adaptive next-plan recommendation behavior for upsell states.

### Modified Capabilities

## Impact

- Affected UI: dashboard locked-state rendering in `app/dashboard/page.tsx`.
- Affected behavior: plan recommendation logic tied to tier and usage proximity (invoice limits and gated feature intent).
- Affected supporting surfaces: potential shared upgrade messaging components and plan recommendation helpers.
- No changes to billing provider integration are required for this proposal; this is presentation and recommendation logic layered on existing entitlement checks.
