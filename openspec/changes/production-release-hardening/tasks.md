## 1. Release-surface audit

- [ ] Confirm every customer-facing route and page that depends on `UNIMPLEMENTED_FEATURES` and `isFeatureImplemented()` is treated as read-only or hidden when feature status is unavailable.
- [ ] Review marketing pages, pricing surfaces, and dashboard settings for any interactive workflow that still conveys live functionality before implementation is complete.
- [ ] Ensure the release scope is limited to gating and correctness, not to adding new functionality outside the current product baseline.

## 2. Unimplemented feature gating

- [ ] Update pricing and marketing presentation to show only genuinely live functionality.
- [ ] Update dashboard settings surfaces so planned features remain visible as context but are not actionable.
- [ ] Ensure team-seat-related and similar pending capabilities are non-actionable while still preserving plan context for seat limits.

## 3. API contract hardening

- [ ] Confirm every feature-gated route returns deterministic unavailable semantics with a stable reason code when the feature is unimplemented.
- [ ] Remove success-style responses from any operation that remains intentionally unavailable to customers.
- [ ] Keep client-side handling consistent with the API’s feature-unavailable contract so the UI remains honest.

## 4. Static validation gate

- [ ] Fix all TypeScript issues in the repo’s validation gate before launch approval.
- [ ] Re-run `npm run lint` and confirm the repository is clean under the project’s static checks.
- [ ] Re-run `npx tsc --noEmit` and confirm there are no failing type checks.

## 5. Production release verification

- [ ] Run the repository test suite and confirm it passes under the project’s test harness.
- [ ] Run the production build and confirm the app compiles and generates route output successfully.
- [ ] Verify that all release blockers are removed before any public paid launch decision is made.

## 6. Approval criteria

- [ ] No customer-facing unimplemented features are presented as operational.
- [ ] All release gates pass in a clean repo state.
- [ ] The product is classified as pilot-safe, not broad public paid-launch-safe, until the above criteria are met.
