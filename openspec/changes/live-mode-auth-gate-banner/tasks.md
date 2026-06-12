## 1. Launch Mode Configuration

- [x] 1.1 Add a shared utility that parses `LIVE` and exposes a boolean launch-mode flag.
- [x] 1.2 Implement fail-safe parsing so missing/malformed `LIVE` resolves to not-live mode.
- [x] 1.3 Document the `LIVE` variable usage in environment/runbook docs.

## 2. Auth Route Gating

- [x] 2.1 Add route-level or middleware-level guards to disable sign-in when launch mode is not-live.
- [x] 2.2 Add route-level or middleware-level guards to disable sign-up when launch mode is not-live.
- [x] 2.3 Ensure blocked auth route behavior is consistent (redirect or unavailable response) and covered by tests.

## 3. Not-Live Banner UI

- [x] 3.1 Add a top-level banner component/message for not-live mode.
- [x] 3.2 Render the banner from a shared layout boundary to ensure consistent visibility.
- [x] 3.3 Ensure banner is hidden when launch mode is live.

## 4. Verification

- [x] 4.1 Add/adjust tests for `LIVE=true` behavior (auth enabled, no banner).
- [x] 4.2 Add/adjust tests for `LIVE=false` behavior (auth disabled, banner shown).
- [x] 4.3 Add/adjust tests for missing/malformed `LIVE` fallback to not-live mode.
