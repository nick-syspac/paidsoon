## Context

The dashboard currently shows a short lock-state banner when a user cannot access overdue or payment-status modules. This state communicates restriction but does not demonstrate the product value users would unlock, which reduces upgrade motivation.

This change introduces a sample-only preview module for locked dashboard states and adaptive plan recommendation logic. The preview must never expose live premium dashboard rows when access is restricted. Recommendation copy should point users to the next sensible plan tier and become more urgent when a user is close to current plan limits.

## Goals / Non-Goals

**Goals:**
- Replace bland lock-state messaging with realistic sample dashboard content for users without access.
- Ensure the locked state renders synthetic/example invoice rows only.
- Add recommendation logic that suggests the next tier (Starter -> Solo, Solo -> Small Business).
- Add near-limit recommendation behavior to make upsell copy contextual and actionable.
- Keep implementation consistent with existing entitlement checks and pricing catalog.

**Non-Goals:**
- Introducing new billing products, checkout architecture, or Stripe integration changes.
- Exposing real unpaid invoice records to locked users.
- Creating a full A/B testing framework in this change.

## Decisions

1. Locked-state preview uses synthetic sample rows only
- Decision: Render static or deterministic sample invoice rows for locked dashboard states.
- Why: Demonstrates the value of the dashboard while preserving premium boundaries and data privacy.
- Alternatives considered:
  - Showing the user's real rows in limited form: rejected because it leaks premium value for free.
  - Keeping text-only lock message: rejected because it under-converts and feels low-value.

2. Recommendation engine follows next-tier progression with urgency signals
- Decision: Recommend Solo for Starter users, Small Business for Solo users, and no forced upsell for Small Business unless future tiers exist.
- Why: Aligns with existing plan ladder and keeps CTA intent simple.
- Alternatives considered:
  - Always recommend Solo: rejected because it ignores users already on Solo.
  - Manual recommendation copy only: rejected because it misses contextual personalization.

3. Near-limit logic uses configurable threshold and feature-intent triggers
- Decision: Mark a user as near-limit when usage reaches threshold (default 80%) or when they attempt unavailable gated features.
- Why: Improves timing and relevance of upgrade prompts without requiring heavy analytics.
- Alternatives considered:
  - Threshold-only: rejected because it misses intent-driven upsell opportunities.
  - Intent-only: rejected because it misses passive heavy users.

4. Preview module remains in dashboard render path
- Decision: Keep the module in `app/dashboard/page.tsx` composition flow, using shared helpers for recommendation and sample data payload.
- Why: Minimizes architecture churn and keeps entitlement flow explicit.
- Alternatives considered:
  - Separate route for locked dashboard demo: rejected as unnecessary complexity for this scope.

## Risks / Trade-offs

- [Sample rows look too synthetic and reduce trust] -> Use realistic fields/timestamps and clear "Sample preview" labeling.
- [Users misread sample data as their real invoices] -> Add explicit copy that rows are examples until upgrade.
- [Recommendation heuristics feel pushy] -> Tune threshold defaults and keep copy neutral/helpful.
- [Copy drift across plans] -> Generate recommendation content from plan catalog metadata instead of hardcoded fragments.

## Migration Plan

1. Add recommendation helper logic (next tier + near-limit conditions).
2. Add sample preview data model and rendering component for locked states.
3. Replace existing lock-state banner in dashboard with preview + adaptive CTA module.
4. Add tests for recommendation selection and locked-state rendering behavior.
5. Validate all plan states (Starter, Solo, Small Business) in local and staging UI.

Rollback strategy:
- Re-enable prior lock-state message and bypass preview component.
- Keep recommendation helper isolated so rollback can happen by feature-flag or render guard.

## Open Questions

- Should near-limit threshold be globally fixed (80%) or plan-specific?
- Should Small Business receive a neutral "current best fit" CTA until an enterprise tier exists?
- Should sample rows rotate (multiple canned sets) or stay static for consistency?
