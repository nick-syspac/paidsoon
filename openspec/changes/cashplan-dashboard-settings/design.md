## Context

See proposal.md for motivation and product goals. The backend CashPlan module already produces summary data, recommendations, alerts, and settings, but the UI has not yet been integrated into the normal dashboard and settings navigation patterns. The design should therefore reuse the existing authenticated dashboard shell, settings layout conventions, and tenant-scoped data access rather than inventing a parallel product surface.

## Goals / Non-Goals

**Goals:**
- Make CashPlan visible and actionable from the primary dashboard experience
- Expose a dedicated yet lightweight settings experience for the cash-plan configuration that already exists in the data model
- Preserve tenant isolation and the current forecast logic while improving discoverability and clarity

**Non-Goals:**
- Rewriting the forecast engine or changing the canonical financial data model
- Creating a new standalone public-facing product area outside the authenticated app
- Introducing new billing or permissions logic beyond the existing CashPlan access model

## Decisions

### 1. CashPlan will be surfaced through existing navigation patterns, not as a separate product shell
The UI should plug into the current dashboard overview and settings layout with a dedicated CashPlan section or tab, using the same shell, cards, and state-loading patterns already used elsewhere in the app.

**Why:** This preserves the repository’s UX patterns, keeps the feature discoverable, and reduces the risk of divergent user flows.

**Alternatives considered:** A bespoke standalone route or a hidden feature flag panel would be harder to discover and would likely feel disconnected from the rest of PaidSoon.

### 2. The dashboard summary should prioritize operational clarity over exhaustive detail
The initial dashboard surface should focus on the current health band, low-point risk, stale-data warnings, and the most actionable next step rather than full plan detail.

**Why:** Users need a quick answer to “is cash healthy?” before they are asked to dive into the full plan workspace.

**Alternatives considered:** Displaying the entire weekly grid immediately would overload the page and duplicate the more detailed CashPlan workspace.

### 3. Settings should be a thin operational control layer, not a duplicate configuration system
The settings screen should present the tenant’s live CashPlan configuration and controls in a stable, read-critic-friendly layout, but it should not create a second source of truth for the forecast configuration.

**Why:** The product already has a settings model; the UI should reflect it rather than create parallel state.

**Alternatives considered:** Building a separate local settings store would introduce drift and inconsistent update behavior.

## Risks / Trade-offs

- [Feature discoverability vs. visual clutter] → Keep the CashPlan surface compact and tied to obviously relevant status cards rather than adding a full new dashboard stack.
- [Too much context in one page] → Use dashboard overview for signal and settings for configuration, leaving the more detailed workspace as the deeper drill-down.
- [Stale planning state] → Show freshness and warning states early, and route users to the relevant action or data-quality maintenance path.
- [Over-customization] → Only expose the controls that are already supported by the backend and the tenant model; hide unsupported options behind the same access rules as the rest of the app.

## Migration Plan

1. Add the dashboard summary cards and navigation hooks behind the existing authenticated dashboard shell.
2. Add the CashPlan settings section using the current settings layout and tenant-scoped data fetch patterns.
3. Connect any action links and status messaging back to the live CashPlan summary and settings state.
4. Validate that the UI reflects real backend data and does not show unsupported configuration flows.

## Open Questions

- Whether the initial CashPlan settings area should include only read-only summary plus safe operational actions, or also editable thresholds/configuration controls in the first release.
- Whether the dashboard summary should link directly to the full CashPlan workspace or to a narrowed “review” view first.
