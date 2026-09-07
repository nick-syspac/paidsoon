## Summary

This change treats PaidSoon’s production readiness problem as a correctness issue: the product should not expose partially implemented features as if they are live. The design uses the existing plan catalog and implementation gating to separate “entitled” from “operational,” and it closes the final release gap by restoring TypeScript health before launch.

## Design Goals

- Keep pricing and entitlement context visible where useful, but never imply a live workflow for unimplemented features.
- Ensure unimplemented features are read-only or unavailable across marketing pages, dashboard pages, and API endpoints.
- Preserve the repo’s existing `UNIMPLEMENTED_FEATURES` contract instead of creating a second feature flag system.
- Make the release gate explicit and consistent with the repo’s own validation commands.

## Design

### 1. Product-surface gating

The release-hardening design reuses the existing feature gate pattern already codified in the plan catalog:

- `UNIMPLEMENTED_FEATURES` remains the source of truth for implementation state.
- `isFeatureImplemented(feature)` drives whether the client or route presents a live action path.
- Unimplemented features must render as “coming soon,” “planned,” or “unavailable” rather than allowing submit or connect flows.

This applies to all customer-facing surfaces including pricing, marketing pages, and settings flows for features such as team seats and related unimplemented capability states.

### 2. API behavior

Any route that executes a planned-but-not-live workflow must respond with a deterministic unavailable result rather than a success message.

Required semantics:

- stable error reason code
- non-2xx or explicit feature-unavailable response
- no success payload that implies completion
- consistent error mapping in the client UI

### 3. Release gate and validation

The design makes release readiness explicit by requiring the checked-in repo to pass the same validation contract used by the engineering team:

- `npm run lint`
- `npx tsc --noEmit`
- `npm test`
- `npm run build`

Only after those pass and all customer-facing unfinished features are hidden or disabled should the product be treated as launch-ready.

### 4. Scope boundaries

This change intentionally does not redesign the plan model or change the pricing architecture. It is not a feature delivery change; it is a trust and readiness hardening change that ensures the app only presents what is genuinely operational.

## Risks and Mitigations

- Risk: A partially implemented feature still appears clickable in a marketing or settings flow.
  - Mitigation: enforce gating based on `UNIMPLEMENTED_FEATURES` and remove interactive UI where implementation state is false.

- Risk: API drift reintroduces success-like responses.
  - Mitigation: use a single explicit feature-unavailable contract on all relevant routes.

- Risk: the repo “looks ready” from build output while failing static validation.
  - Mitigation: treat TypeScript as a release gate, not a secondary check.
