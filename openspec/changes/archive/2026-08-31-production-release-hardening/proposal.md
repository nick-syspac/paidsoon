## Why

PaidSoon has a working core product, but the repo still exposes customer-facing features that are explicitly not implemented and still contains a failing static validation gate. That creates a trust gap for paying customers: the product can look operational while some workflows are only planned, and the release bar is not yet clean under the project’s own TypeScript standards.

## What Changes

- Harden the production release by removing or hiding all unfinished customer-facing features from the app surface until they are operational.
- Enforce the existing plan-feature contract so entitlement and implementation state are treated separately: visible as plan context, non-actionable as a workflow.
- Return deterministic unavailable responses for any action attempted on an unimplemented feature instead of success-like flows.
- Fix the repository’s static validation gate so the product passes its own TypeScript quality threshold before launch approval.
- Define a final release checklist covering UI gating, API gating, and validation commands required for paid launch.

## Capabilities

### New Capabilities
- None. This change acts as production-release hardening around existing product capabilities rather than adding new user-facing business behavior.

### Modified Capabilities
- `implementation-gated-entitlements`: Clarifies the requirement that entitled-but-unimplemented features must remain visible as planned context but non-actionable in UI and API responses.
- `subscription-plan-tiers`: Clarifies that plan seat and feature context may be shown while any operational invite or workflow remains unavailable until the capability is implemented.

## Impact

- Affected UI: pricing pages, dashboard settings, team settings, marketing pages, and any plan-specific upsell surfaces
- Affected API contracts: feature-gated routes and any endpoint that exposes action paths for unimplemented functionality
- Affected data and catalog semantics: `UNIMPLEMENTED_FEATURES`, `isFeatureImplemented()`, and plan-presentation logic in `lib/subscriptionPlans.ts`, `lib/planPresentation.ts`, and `lib/dashboardUpsell.ts`
- Affected validation: TypeScript and the project’s release gate for production readiness
- No change to Stripe pricing, billing API versions, or the canonical three-tier plan model; this is a release correctness and trust fix, not a billing pivot
