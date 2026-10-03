## Context

The AI rewrite scaffold has existed since the Small Business tier was defined. The route (`app/api/settings/ai/route.ts`) correctly gates on `ai_rewrite` and `tone_settings` feature flags, validates input with Zod, and returns a response — but the "rewrite" is a placeholder: `[friendly] {text}`. The UI (`AiSettingsClient.tsx`) has a tone dropdown, a textarea, and a single output panel.

The explore phase established:
- GPT-4o-mini is the correct model (cost ~£0.00035/call, well under 1% of plan revenue)
- Returning all three tones in one call is better UX and cheaper than separate per-tone calls
- Usage must be logged from day one to support future rate limiting
- The Vercel AI SDK's `generateObject` is the right integration primitive (structured output via Zod)
- The tone dropdown becomes redundant and should be removed
- The standalone AI settings tab creates a broken clipboard-reliant workflow; AI rewrite belongs inside the Templates editor as a contextual action
- The prompt should be stage-aware — stage and tone are the same concept; knowing the stage produces better rewrites
- Accepting a rewrite should use a diff view, not silent replacement — the editor must not be overwritten without explicit user confirmation

## Goals / Non-Goals

**Goals:**
- Replace the placeholder with a real OpenAI call that returns three tone variants as structured data.
- Make the prompt stage-aware: `stage` (1/2/3) is accepted by the API and prefixes the prompt with the stage's context (tone, position in sequence, urgency level).
- Integrate the AI rewrite trigger into the Templates editor body section as a contextual "AI Rewrite" button — no standalone `/settings/ai` settings page.
- Show a diff view when the AI suggestion is ready: original on the left, AI suggestion on the right. The user must explicitly Accept or Discard before any editor content changes. The stage-appropriate tone variant is pre-selected; other variants are accessible via tabs.
- Log every successful call's token usage to `ai_usage_logs` for cost visibility and future rate limiting.
- Remove the standalone `/settings/ai` settings page and `AiSettingsClient.tsx`.

**Non-Goals:**
- Streaming output (one-shot response is sufficient; 1–3 second wait is acceptable).
- Rate limiting enforcement (logging is the prerequisite; enforcement is a separate change).
- Custom prompt editing by users.
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

**Rationale:** Single call is 3× cheaper, faster, and simpler than three sequential or parallel calls. The prompt already asks for all three variants. Users benefit from being able to switch between variants in the diff panel without making additional API calls.

**Updated by D7 and D8:** The call still returns all three variants. D7 makes the prompt stage-aware. D8 determines how the variants are presented (diff panel with tone tabs rather than three copy-button cards).

**Alternative considered:** One call per selected tone (user picks first, then rewrites). Rejected — removes the "see all options" value and costs more.

### D4: Store cost as `Decimal` in USD, not integer micropence

**Decision:** Store `estimatedCostUsd` as `Decimal(12, 8)` (USD).

**Rationale:** Avoids baking in a GBP/USD exchange rate that would become stale. Cost queries and displays can convert at read time. `Decimal` in Prisma maps to `NUMERIC` in Postgres — no float precision issues.

**Alternative considered:** Integer micropence (1 pence = 1,000,000 micropence). Rejected — requires committing to an exchange rate at write time.

### D5: Log usage via `prismaAdmin`, not `withUserContext`

**Decision:** The usage log write uses `prismaAdmin` (bypasses RLS).

**Rationale:** Token counts are only available after the OpenAI call completes, outside the user-context transaction. Writing via `prismaAdmin` is simpler and safe here because the `userId` is derived from `supabase.auth.getUser()` (server-side, trusted), not from the request body. The code comment in the route must document this exception per project convention.

**RLS posture:** `ai_usage_logs` has a SELECT policy (users read own rows) and no INSERT policy for users. Only the service role (via `prismaAdmin`) can insert. This is intentional.

### D6: Add `stage` to Zod input schema; remove `tone`

**Decision:** Drop the `tone` field from the POST body schema and add `stage: z.union([z.literal(1), z.literal(2), z.literal(3)])`. The `text` field remains.

**Rationale:** `tone` implied single-tone output, which is no longer the contract. `stage` replaces it as the caller context: it is used to construct the stage-aware prompt prefix (D7) and to determine the default variant shown in the diff panel (D8). The `canSetTone` feature check also becomes a no-op and is removed from the route.

**Supersedes the original D6** which only removed `tone` without replacing it.

### D7: Stage-aware prompt

**Decision:** `rewriteMessage(text, stage)` receives the stage (1/2/3) and prepends a stage-specific context block to the system prompt before the three-tone instruction.

| Stage | Prompt prefix |
|-------|---------------|
| 1     | "This is a first reminder. Keep it gentle and friendly — assume the invoice was simply overlooked." |
| 2     | "This is a second reminder. Acknowledge the prior email. Be professional but make urgency clear." |
| 3     | "This is a final notice. Be direct and urgent. Reference days overdue. Include a firm deadline." |

**Rationale:** Stage and tone are the same concept expressed differently. Knowing the stage produces sharper rewrites than a generic "rewrite in three tones" instruction. The model still outputs all three variants (D3), but the prompt anchors it to the correct position in the follow-up sequence.

**Alternative considered:** Keep the prompt stage-agnostic and rely on tone labels alone. Rejected — stage context produces materially better results for invoice follow-up copy, especially for Stage 3 (final notice) where specific urgency cues matter.

### D8: Diff view UX for accepting rewrites

**Decision:** When the AI call returns, show an inline diff panel below the body editor. The left column shows the current `textBody`; the right column shows the selected variant's `message`. Tone tabs (Friendly / Firm / Final Notice) above the right column allow switching between variants — the stage-appropriate tab is active by default. The current stage's variant `subject` is also shown when it differs from the current subject. [Apply] sets the editor content and subject to the selected variant and closes the panel. [Discard] closes the panel with no changes.

**Rationale:** Silent replacement risks destroying a carefully crafted template the user spent time on. The diff makes the change visible and reversible before commit. Pre-selecting the stage-appropriate tone reduces decision fatigue while keeping the other options one click away.

**Alternative considered:** Three variant cards with "Apply" buttons (original AiSettingsClient approach). Rejected — the card layout lacks the original-vs-suggestion comparison that makes a diff valuable, and puts all three options at equal weight rather than surfacing the stage-relevant one first.

**Alternative considered:** Replace editor content immediately, rely on browser undo. Rejected — Undo is not reliable across async operations and breaks the TemplateEditor's controlled state.

### D9: Merge AI rewrite into Templates; remove standalone AI settings tab

**Decision:** `components/settings/AiSettingsClient.tsx` and `app/dashboard/settings/ai/page.tsx` are deleted. The AI nav tab is removed from `app/dashboard/settings/layout.tsx`. All AI rewrite interaction lives in `TemplatesClient.tsx`.

**Rationale:** The standalone AI tab required clipboard-mediated copy-paste between two settings pages — a broken workflow. Contextual placement inside the template editor closes the loop: edit → AI Rewrite → diff → Accept. The backend (`/api/settings/ai`, `lib/email/ai-rewrite.ts`) is unchanged in its role; only the surface that calls it changes. The `canRewrite` flag is passed from the Templates page server component and controls button visibility.

**Alternative considered:** Keep both surfaces (standalone AI tab + in-editor button). Rejected — two ways to do the same thing creates confusion and doubles the maintenance surface.

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
