## Why

AI rewrite currently enforces entitlement and input validation but does not enforce abuse guardrails such as rolling rate limits or monthly usage quotas. As rewrite usage grows, PaidSoon needs deterministic server-side controls to prevent accidental or scripted overuse and to keep OpenAI cost exposure predictable.

## What Changes

- Add server-side AI rewrite usage guardrails to `POST /api/settings/ai`:
  - Monthly per-tier rewrite quota enforcement based on successful usage logs.
  - Rolling hourly cap enforcement per user.
  - Short rolling burst cap (per-minute) per user.
- Keep the current entitlement gate (`ai_rewrite`) and input validation behavior unchanged.
- Return a limit error when usage thresholds are exceeded before the OpenAI call is made.
- Expose derived remaining monthly credits in the rewrite API response shape used by the templates UI.
- Add automated tests for allowed, blocked, and boundary-limit scenarios.

## Capabilities

### New Capabilities
- `ai-rewrite-usage-guardrails`: Defines server-enforced monthly quota, hourly cap, and burst cap behavior for AI rewrite requests, including limit error responses and remaining-credit derivation from usage logs.

### Modified Capabilities
- `template-editor`: The templates rewrite UX surfaces derived remaining monthly credits and limit feedback from the guarded rewrite API.

## Impact

- Affected route and backend logic:
  - `app/api/settings/ai/route.ts`
  - new helper module under `lib/` for AI rewrite policy and usage window evaluation
- Affected UI:
  - `components/settings/TemplatesClient.tsx` (display of remaining credits and limit feedback)
- Affected tests:
  - AI rewrite route tests and any related template client behavior tests
- Data model and infra impact:
  - Reuses existing `ai_usage_logs` table; no schema migration required for derived-credit enforcement
- External dependencies:
  - No new runtime dependencies required
