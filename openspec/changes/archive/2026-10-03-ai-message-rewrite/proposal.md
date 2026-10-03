## Why

The AI message rewrite feature has been scaffolded and gated to the Small Business tier since launch, but the route handler returns a placeholder string instead of a real AI response. Activating it requires wiring OpenAI's API, replacing the placeholder, updating the UI to display three tone variants at once, and adding usage logging as a prerequisite for future rate limiting.

## What Changes

- Install Vercel AI SDK (`ai` + `@ai-sdk/openai`) as runtime dependencies.
- Create `lib/email/ai-rewrite.ts` containing the canonical prompt and `generateObject` call; accepts `text` and `stage` (1/2/3), returns structured `{ friendly, firm, final_notice }` with `subject` and `message` per variant. The prompt is stage-aware: stage context is prepended so the model understands the email's position in the follow-up sequence.
- Replace the placeholder line in `app/api/settings/ai/route.ts` with a real OpenAI call via the new helper. Accept `stage` in the Zod input schema. Log token usage to a new `AiUsageLog` DB table after each successful call.
- Add `AiUsageLog` Prisma model and migration; add matching RLS policy to `prisma/rls-policies.sql`.
- **Remove** `components/settings/AiSettingsClient.tsx` and `app/dashboard/settings/ai/page.tsx`. Remove the AI tab from `app/dashboard/settings/layout.tsx`.
- Integrate AI rewrite as a contextual action inside `components/settings/TemplatesClient.tsx`: "AI Rewrite" button below the body editor triggers the API call with the current body text and stage. Result is shown in an inline diff view (original left, AI suggestion right) with Accept / Discard controls. The stage-appropriate tone variant is pre-selected; other variants are accessible via tabs within the diff panel.
- Add `OPENAI_API_KEY` to the environment variable matrix (`docs/runbooks/README.md`) — already partially documented in `docs/runbooks/openai.md` (created in explore phase).

## Capabilities

### New Capabilities

- `ai-message-rewrite`: Generate three professionally rewritten invoice follow-up message variants (Friendly, Firm, Final Notice) from a user-supplied draft, via OpenAI GPT-4o-mini with structured output. Gated to Small Business tier.
- `ai-usage-logging`: Record token counts and estimated cost for every AI rewrite call to `ai_usage_logs`, scoped per user. Provides data foundation for future rate limiting and cost attribution.

### Modified Capabilities

_(none — no existing spec-level behaviour is changing)_

## Impact

**Code:**
- `lib/email/ai-rewrite.ts` — new file (stage-aware prompt, `generateObject` call)
- `app/api/settings/ai/route.ts` — replace placeholder, accept `stage`, add usage logging
- `components/settings/AiSettingsClient.tsx` — **deleted**
- `app/dashboard/settings/ai/page.tsx` — **deleted**
- `app/dashboard/settings/layout.tsx` — remove AI tab from nav
- `components/settings/TemplatesClient.tsx` — add AI rewrite state, trigger button, and diff panel
- `app/dashboard/settings/templates/page.tsx` — pass `canRewrite` flag to `TemplatesClient`
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
