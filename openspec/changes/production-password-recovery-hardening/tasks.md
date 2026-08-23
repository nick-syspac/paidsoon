## 1. Recovery Flow Validation

- [ ] 1.1 Confirm the forgot-password route and reset-password route match the intended auth flow and live-mode guardrails.
- [ ] 1.2 Validate reset-request messaging is privacy-safe and does not expose account existence.
- [ ] 1.3 Validate valid reset tokens update the password and allow immediate sign-in.

## 2. Failure-State Handling

- [ ] 2.1 Confirm invalid or expired tokens fail closed without mutating the account or leaking status.
- [ ] 2.2 Confirm generic user-facing errors are used consistently for failed reset attempts.
- [ ] 2.3 Verify the route behavior matches the app's `LIVE` gate and does not let recovery happen before launch approval.

## 3. Regression Coverage

- [ ] 3.1 Add a test covering the valid reset flow from email request through password update.
- [ ] 3.2 Add a test covering the invalid or expired token path and the safe user message.
- [ ] 3.3 Add a test covering the pre-launch gating when `LIVE` is disabled.

## 4. Release Readiness

- [ ] 4.1 Run the relevant auth and route tests.
- [ ] 4.2 Confirm the recovery flow is production-safe and not just helper-level code.
- [ ] 4.3 Sign off that password recovery is ready only after the failing and successful paths are validated in the release suite.
