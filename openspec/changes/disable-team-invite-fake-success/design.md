## Context

See proposal.md for motivation. The current Team invite route validates the input, checks the plan, and then returns a success payload even when the workflow is intentionally unavailable. The product already has an implementation-gated entitlement contract that says unimplemented features must be non-actionable and should never return a success signal.

## Goals / Non-Goals

**Goals:**
- Ensure the Team invite API never reports success unless the backend actually performs the invite action.
- Keep the seat context visible without exposing a fake invite workflow.
- Make the UI and API contract consistent for any unimplemented Team seats state.

**Non-Goals:**
- Implementing the actual invite persistence or email deliverability for team seats.
- Introducing a new seats backend or data model in this change.
- Changing the plan or billing model.

## Decisions

### Keep the route honest for unimplemented features

**Chosen:** The Team invite POST route will return a deterministic feature-unavailable response with a reason code whenever `team_seats` is not implemented.

**Rationale:** This matches the product’s implementation-gated entitlement pattern and prevents fake success states from reaching the client.

**Alternative considered:** Return a 200 success response but hide the action in the UI. Rejected because it preserves a false completion signal and violates the existing spec contract.

### Use the existing feature gate as the single source of truth

**Chosen:** The route will rely on the existing `isFeatureImplemented("team_seats")` contract and ship the same response structure as other feature-gated endpoints.

**Rationale:** This centralises the product rule and avoids divergent checks between API and UI.

**Alternative considered:** Add route-local booleans or duplicate logic. Rejected because it creates drift and more chances for misclassification.

### Maintain plan context but remove actionable UI

**Chosen:** The settings page can still display seat limits and availability context, but the invite action will be disabled or omitted while the feature is unimplemented.

**Rationale:** This preserves product transparency without exposing a workflow that cannot complete.

**Alternative considered:** Showing a full invite form with a disabled submit button. Rejected because it still implies action is available and can confuse users.

## Risks / Trade-offs

- [Risk] Users may interpret the feature as permanently unavailable if the UI is too bare.
  - Mitigation: Show the seat context and coming-soon messaging tied to the feature gate.

- [Risk] A future implementation may accidentally reintroduce fake success states.
  - Mitigation: Keep the API contract explicit and cover it with regression tests.

- [Risk] Product team may want a staged rollout after implementation.
  - Mitigation: The route and UI contract stays truthful regardless of staging; future feature implementation will update the same flow.

## Migration Plan

1. Align the Team invite route with the existing feature gate.
2. Keep the response contract deterministic for feature-unavailable requests.
3. Ensure the settings UI disables or hides the action while the feature is unimplemented.
4. Validate with a regression test that a success payload is never returned in the unavailable state.
5. Rollback is straightforward: revert the route and UI gating to the last known good state without changing plan metadata.

## Open Questions

- Should the product surface a dedicated “coming soon” CTA or simply present the seat context with a disabled action while the feature remains unimplemented?
- When the feature is implemented later, should the system still keep the same API error codes and success semantics, or is a versioned contract required?
