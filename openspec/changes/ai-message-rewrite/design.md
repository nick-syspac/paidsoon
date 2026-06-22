## Context

The AI rewrite scaffold has existed since the Small Business tier was defined. The route (`app/api/settings/ai/route.ts`) correctly gates on `ai_rewrite` and `tone_settings` feature flags, validates input with Zod, and returns a response — but the "rewrite" is a placeholder: `[friendly] {text}`. The UI (`AiSettingsClient.tsx`) has a tone dropdown, a textarea, and a single output panel.

The explore phase established:
- GPT-4o-mini is the correct model (cost ~£0.00035/call, well under 1% of plan revenue)
- Returning all three tones in one call is better UX and cheaper than separate per-tone calls
- Usage must be logged from day one to support future rate limiting
- The Vercel AI SDK's `generateObject` is the right integration primitive (structured output via Zod)
- The tone dropdown becomes redundant and should be removed

## Goals / Non-Goals

**Goals:**
- Replace the placeholder with a real OpenAI call that returns three tone variants as structured data.
- Redesign the UI to display all three variants simultaneously with copy buttons.
- Log every successful call's token usage to `ai_usage_logs` for cost visibility and future rate limiting.
- Keep the implementation tightly scoped to the existing feature gate and route.

**Non-Goals:**
- Streaming output (one-shot response is sufficient; 1–3 second wait is acceptable).
- Rate limiting enforcement (logging is the prerequisite; enforcement is a separate change).
- Custom prompt editing by users.
- Per-variant tone selection before the call.
- Any changes to the Starter or Solo plan feature sets.
- Exposing cost data in the UI.

## Decisions

### D1: Vercel AI SDK (`generateObject`) over direct `fetch` to OpenAI

**Decision:** Use `ai` + `@ai-sdk/openai` with `generateObject`.

**Rationale:** `generateObject` enforces the response schema via Zod and OpenAI's structured output mode, eliminating fragile JSON parsing. The SDK handles retries and error normalisation. The package is maintained by Vercel and is a natural fit for Next.js App Router.

**Alternative considered:** Raw `fetch` to `api.openai.com/v1/chat/completions` with `response_format: { type: "json_object" }`. Rejected — requires manual JSON.parse, no type safety on the response, and more boilerplate. Not worth the complexity saving.

### D2: `generateObject` (no streaming) over `streamObject`

**Decision:** Use non-streaming `generateObject`; wait for the full response before rendering.

**Rationale:** A sentiment rewrite of a short invoice message completes in 1–3 seconds. Streaming three simultaneous variants into separate panels would require complex state management for minimal UX gain. The "Rewrite" button metaphor (click → wait → see results) fits better than incremental streaming.

**Alternative considered:** `streamObject` with three parallel streams. Rejected — overkill for this use case and adds significant client complexity.

### D3: All three tones in a single call

**Decision:** One API call returns `{ friendly, firm, final_notice }` as structured output.

**Rationale:** Single call is 3× cheaper, faster, and simpler than three sequential or parallel calls. The prompt already asks for all three variants. Users benefit from seeing all options at once and choosing.

**Alternative considered:** One call per selected tone (user picks first, then rewrites). Rejected — removes the "see all options" value and costs more.

### D4: Store cost as `Decimal` in USD, not integer micropence

**Decision:** Store `estimatedCostUsd` as `Decimal(12, 8)` (USD).

**Rationale:** Avoids baking in a GBP/USD exchange rate that would become stale. Cost queries and displays can convert at read time. `Decimal` in Prisma maps to `NUMERIC` in Postgres — no float precision issues.

**Alternative considered:** Integer micropence (1 pence = 1,000,000 micropence). Rejected — requires committing to an exchange rate at write time.

### D5: Log usage via `prismaAdmin`, not `withUserContext`

**Decision:** The usage log write uses `prismaAdmin` (bypasses RLS).

**Rationale:** Token counts are only available after the OpenAI call completes, outside the user-context transaction. Writing via `prismaAdmin` is simpler and safe here because the `userId` is derived from `supabase.auth.getUser()` (server-side, trusted), not from the request body. The code comment in the route must document this exception per project convention.

**RLS posture:** `ai_usage_logs` has a SELECT policy (users read own rows) and no INSERT policy for users. Only the service role (via `prismaAdmin`) can insert. This is intentional.

### D6: Remove `tone` from the Zod input schema

**Decision:** Drop the `tone` field from the POST body schema entirely.

**Rationale:** The prompt generates all three tones regardless. Accepting a `tone` parameter implies single-tone output, which is no longer the contract. Removing it simplifies the schema and removes dead code. The `canSetTone` feature check also becomes a no-op and can be removed from the route.

## Risks / Trade-offs

**[Risk] OpenAI API key not set** → The route returns a 500. Mitigation: check `process.env.OPENAI_API_KEY` exists at module load time in `lib/email/ai-rewrite.ts` and throw a descriptive error. The verification checklist in `docs/runbooks/openai.md` covers this.

**[Risk] Structured output mode returns unexpected shape** → `generateObject` throws a ZodError if the model deviates from the schema. Mitigation: the route catches errors and returns a 500 with a generic message. The Zod schema is strict enough that partial responses don't leak to the client.

**[Risk] Model produces off-topic or hallucinated invoice details** → The prompt explicitly instructs the model to preserve all facts unchanged. Risk is low for GPT-4o-mini on a constrained rewriting task. Mitigation: prompt includes explicit instruction "Keep all invoice details, dates, amounts, names, and payment references unchanged."

**[Risk] Cost grows unexpectedly** → At Small Business scale (max 100 tracked invoices/month), even aggressive rewrite usage is <£5/month. Mitigation: `ai_usage_logs` table enables cost queries; a future rate-limit check can be added to the route without structural changes.

**[Trade-off] No streaming** → Users wait 1–3 seconds with a spinner. Acceptable for a rewrite button; streaming can be added later if user feedback demands it.

## Migration Plan

1. Install packages: `npm install ai @ai-sdk/openai`
2. Run Prisma migration: `npx prisma migrate dev --name add-ai-usage-logs`
3. Apply RLS policies: update `prisma/rls-policies.sql`, run `npm run verify-rls`
4. Set `OPENAI_API_KEY` in `.env.local` (dev) and Vercel environment variables
5. Deploy; no rollback complexity — if `OPENAI_API_KEY` is missing the feature returns an error but the rest of the app is unaffected. The placeholder behaviour is already an error state.

## Open Questions

_(none — all decisions made during explore phase)_
