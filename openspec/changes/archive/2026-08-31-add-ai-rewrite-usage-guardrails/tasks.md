## 1. Policy and helper scaffolding

- [x] 1.1 Define per-tier AI rewrite guardrail policy values (monthly quota, hourly cap, burst cap) in a server-only helper under `lib/`
- [x] 1.2 Implement helper logic to resolve the active monthly quota window using subscription period when available and existing fallback window behavior otherwise
- [x] 1.3 Implement helper logic to count successful AI rewrite usage in monthly, hourly (60-minute), and burst (60-second) windows from `ai_usage_logs`
- [x] 1.4 Implement helper logic to derive remaining monthly credits as `max(0, quota - usage)`

## 2. Route guardrail enforcement

- [x] 2.1 Update `POST /api/settings/ai` to evaluate usage guardrails before invoking `rewriteMessage(...)`
- [x] 2.2 Return HTTP 403 limit responses for monthly, hourly, and burst guardrail failures with a stable limit error message
- [x] 2.3 Include remaining monthly credits in successful rewrite responses and usage-limit error responses
- [x] 2.4 Ensure failed provider calls, validation failures, and entitlement failures do not increment usage consumption

## 3. Templates editor feedback

- [x] 3.1 Update `components/settings/TemplatesClient.tsx` to display server-provided remaining monthly credits when AI rewrite is available
- [x] 3.2 Handle guardrail limit responses in the rewrite workflow with clear inline feedback
- [x] 3.3 Preserve current subject/body editor values when a rewrite request is limit-blocked

## 4. Automated verification

- [x] 4.1 Add route-level tests for allowed requests below limits and blocked requests at monthly quota boundary
- [x] 4.2 Add route-level tests for blocked requests at hourly and burst-cap boundaries
- [x] 4.3 Add route-level tests confirming usage is not consumed for entitlement/validation/provider failures
- [x] 4.4 Add UI-behavior test coverage (or equivalent logic-level coverage) for remaining-credit display and limit-feedback handling
- [x] 4.5 Run `npm run test` and confirm the relevant AI rewrite and template guardrail tests pass
