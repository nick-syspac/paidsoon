## 1. Release-surface audit

- [x] Confirm every customer-facing route and page that depends on `UNIMPLEMENTED_FEATURES` and `isFeatureImplemented()` is treated as read-only or hidden when feature status is unavailable.
- [x] Review marketing pages, pricing surfaces, and dashboard settings for any interactive workflow that still conveys live functionality before implementation is complete.
- [x] Ensure the release scope is limited to gating and correctness, not to adding new functionality outside the current product baseline.

## 2. Unimplemented feature gating

- [x] Update pricing and marketing presentation to show only genuinely live functionality.
- [x] Update dashboard settings surfaces so planned features remain visible as context but are not actionable.
- [x] Ensure team-seat-related and similar pending capabilities are non-actionable while still preserving plan context for seat limits.

## 3. API contract hardening

- [x] Confirm every feature-gated route returns deterministic unavailable semantics with a stable reason code when the feature is unimplemented.
- [x] Remove success-style responses from any operation that remains intentionally unavailable to customers.
- [x] Keep client-side handling consistent with the API’s feature-unavailable contract so the UI remains honest.

## 4. Static validation gate

- [x] Fix all TypeScript issues in the repo’s validation gate before launch approval.
- [x] Re-run `npm run lint` and confirm the repository is clean under the project’s static checks.
- [x] Re-run `npx tsc --noEmit` and confirm there are no failing type checks.

## 5. Production release verification

- [x] Run the repository test suite and confirm it passes under the project’s test harness.
- [x] Run the production build and confirm the app compiles and generates route output successfully.
- [x] Verify that all release blockers are removed before any public paid launch decision is made.

## 6. Approval criteria

- [x] No customer-facing unimplemented features are presented as operational.
- [x] All release gates pass in a clean repo state.
- [x] The product is classified as pilot-safe, not broad public paid-launch-safe, until the above criteria are met.
