## Why

The plan catalog explicitly marks `team_seats` as not implemented, but the dashboard still exposes an interactive Team invite flow that returns success-like responses without persistence. This creates customer confusion and weakens trust by making a planned capability feel operational.

## What Changes

- Make Team seats non-actionable while `team_seats` remains in `UNIMPLEMENTED_FEATURES`.
- Replace invite submission UX with a read-only "Coming soon" experience on Team settings.
- Ensure Team settings navigation visibility follows entitlement, but actionability follows implementation state.
- Update Team invite API behavior to return a deterministic unavailable response while feature is unimplemented.
- Add tests that prevent regressions where unimplemented features become interactive without persistence.

## Capabilities

### New Capabilities
- `implementation-gated-entitlements`: Defines the behavior contract that entitled-but-unimplemented features must be visible as planned/coming-soon but non-actionable.

### Modified Capabilities
- `subscription-plan-tiers`: Clarifies Team seats behavior so seat limits can be marketed by tier while invites remain unavailable until team membership persistence is implemented.

## Impact

- Affected UI:
  - `app/dashboard/settings/layout.tsx`
  - `app/dashboard/settings/team/page.tsx`
  - `components/settings/TeamInvitesClient.tsx`
- Affected API:
  - `app/api/settings/team/invite/route.ts`
- Affected catalog/presentation semantics:
  - `lib/subscriptionPlans.ts`
  - `lib/planPresentation.ts`
- Affected tests:
  - `tests/subscription-plans.test.ts`
  - New/additional tests for Team settings and Team invite route behavior
- No billing price, tier identity, or Stripe webhook contract changes.
