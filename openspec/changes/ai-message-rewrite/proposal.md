## Why

The AI message rewrite feature has been scaffolded and gated to the Small Business tier since launch, but the route handler returns a placeholder string instead of a real AI response. Activating it requires wiring OpenAI's API, replacing the placeholder, updating the UI to display three tone variants at once, and adding usage logging as a prerequisite for future rate limiting.

## What Changes

- Install Vercel AI SDK (`ai` + `@ai-sdk/openai`) as runtime dependencies.
- Create `lib/email/ai-rewrite.ts` containing the canonical prompt and `generateObject` call; returns structured `{ friendly, firm, final_notice }` with `subject` and `message` per variant.
- Replace the placeholder line in `app/api/settings/ai/route.ts` with a real OpenAI call via the new helper. Log token usage to a new `AiUsageLog` DB table after each successful call.
- Add `AiUsageLog` Prisma model and migration; add matching RLS policy to `prisma/rls-policies.sql`.
- Redesign `components/settings/AiSettingsClient.tsx`: remove tone selector dropdown (now redundant), add three-panel output showing all variants simultaneously with per-card copy buttons.
- Add `OPENAI_API_KEY` to the environment variable matrix (`docs/runbooks/README.md`) — already partially documented in `docs/runbooks/openai.md` (created in explore phase).
- Remove the `tone` field from the route's Zod input schema (no longer needed post-call; tone selection happens client-side after seeing results).

## Capabilities

### New Capabilities

- `ai-message-rewrite`: Generate three professionally rewritten invoice follow-up message variants (Friendly, Firm, Final Notice) from a user-supplied draft, via OpenAI GPT-4o-mini with structured output. Gated to Small Business tier.
- `ai-usage-logging`: Record token counts and estimated cost for every AI rewrite call to `ai_usage_logs`, scoped per user. Provides data foundation for future rate limiting and cost attribution.

### Modified Capabilities

_(none — no existing spec-level behaviour is changing)_

## Impact

**Code:**
- `lib/email/ai-rewrite.ts` — new file
- `app/api/settings/ai/route.ts` — replace placeholder, add usage logging, simplify Zod schema
- `components/settings/AiSettingsClient.tsx` — UI redesign (3-panel output)
- `prisma/schema.prisma` — new `AiUsageLog` model
- `prisma/rls-policies.sql` — new RLS policy for `ai_usage_logs`

**Dependencies added:**
- `ai` (Vercel AI SDK core)
- `@ai-sdk/openai` (OpenAI provider for Vercel AI SDK)

**New environment variable:**
- `OPENAI_API_KEY` — server-side only, never exposed to browser

**DB migration required:**
- `add-ai-usage-logs` — creates `ai_usage_logs` table

**No changes to:**
- Subscription plan definitions (`lib/subscriptionPlans.ts`) — feature flags already correct
- Billing routes or webhooks
- Email sending pipeline
- Cron job
