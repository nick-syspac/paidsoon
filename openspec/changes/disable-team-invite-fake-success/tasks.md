## 1. Route Behavior Fix

- [ ] 1.1 Confirm the Team invite API returns a feature-unavailable response when `team_seats` is not implemented.
- [ ] 1.2 Remove any success response path that reports completion without a persisted invite.
- [ ] 1.3 Keep the response shape machine-readable and consistent with the implementation-gated entitlement contract.

## 2. UI Truthfulness

- [ ] 2.1 Verify Team settings shows seat context without exposing an actionable invite workflow while the feature is unavailable.
- [ ] 2.2 Disable or hide invite controls in the UI when `team_seats` is unimplemented.
- [ ] 2.3 Ensure the UI state matches the API response semantics.

## 3. Regression Coverage

- [ ] 3.1 Add a test for the unimplemented feature path asserting the API does not return success.
- [ ] 3.2 Add a test for the implemented path asserting success is only returned after actual invite creation if applicable.
- [ ] 3.3 Add a UI-level or contract-level assertion that the settings area stays non-actionable while Team seats are unavailable.

## 4. Release Readiness

- [ ] 4.1 Run the relevant route and settings tests.
- [ ] 4.2 Confirm the API and UI never imply completion without a real invite action.
- [ ] 4.3 Verify the release gate is satisfied before marking the Team invite flow as ready for customers.
