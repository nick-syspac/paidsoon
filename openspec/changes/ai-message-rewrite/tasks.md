## 1. Dependencies

- [x] 1.1 Install Vercel AI SDK packages: `npm install ai @ai-sdk/openai`
- [x] 1.2 Add `OPENAI_API_KEY` to `.env.local` with a dev key from platform.openai.com

## 2. Database — AiUsageLog model

- [x] 2.1 Add `AiUsageLog` model to `prisma/schema.prisma` with fields: `id`, `userId`, `model`, `feature`, `promptTokens`, `completionTokens`, `totalTokens`, `estimatedCostUsd` (`Decimal(12,8)`), `createdAt`; relation to `UserProfile`; indexes on `[userId, createdAt]` and `[createdAt]`; `@@map("ai_usage_logs")`
- [x] 2.2 Add reverse relation `aiUsageLogs AiUsageLog[]` to `UserProfile` model in `prisma/schema.prisma`
- [x] 2.3 Run `npx prisma migrate dev --name add-ai-usage-logs` to generate and apply the migration
- [x] 2.4 Add RLS policy to `prisma/rls-policies.sql`: enable RLS on `ai_usage_logs`; SELECT policy for own rows (`user_id = auth.uid()::text`); no INSERT policy for users
- [x] 2.5 Run `npm run verify-rls` and confirm it passes

## 3. AI rewrite helper

- [x] 3.1 Create `lib/email/ai-rewrite.ts` — export `rewriteMessage(text: string)` that calls `generateObject` with the GPT-4o-mini model, the canonical three-tone prompt (substituting the input text), and a Zod schema matching `{ friendly, firm, final_notice }` each with `{ subject: string, message: string }`
- [x] 3.2 Define the Zod output schema for the three variants inline in `lib/email/ai-rewrite.ts`
- [x] 3.3 Guard `process.env.OPENAI_API_KEY` existence at module initialisation; throw a descriptive `Error` if missing
- [x] 3.4 Export the GPT-4o-mini pricing constants (`INPUT_COST_PER_TOKEN_USD`, `OUTPUT_COST_PER_TOKEN_USD`) from the same file for use in the cost calculation

## 4. API route update

- [x] 4.1 In `app/api/settings/ai/route.ts`, remove `tone` from the Zod `rewriteSchema` and add `stage: z.union([z.literal(1), z.literal(2), z.literal(3)])`
- [x] 4.2 Remove the `canSetTone` feature check and the related 403 branch from the POST handler
- [x] 4.3 Replace the placeholder `rewrittenText` line with a call to `rewriteMessage(parsed.data.text, parsed.data.stage)` from `lib/email/ai-rewrite.ts`
- [x] 4.4 After a successful `rewriteMessage` call, write a row to `ai_usage_logs` via `prismaAdmin` with `userId`, `model` (`"gpt-4o-mini"`), `feature` (`"ai_rewrite"`), `promptTokens`, `completionTokens`, `totalTokens`, and `estimatedCostUsd` (calculated from token counts and pricing constants)
- [x] 4.5 Update the POST response shape to `{ success: true, friendly, firm, final_notice }` (three variant objects instead of single `rewrittenText`)
- [x] 4.6 Add a code comment on the `prismaAdmin` usage log write documenting it as a documented RLS bypass (token counts only available post-call, userId derived from server-side auth)
- [x] 4.7 Wrap the `rewriteMessage` call in try/catch; return HTTP 500 with `{ error: "Rewrite failed" }` on OpenAI errors (do not leak model error details to the client)

## 5. AI rewrite helper — stage awareness

- [x] 5.1 Update `lib/email/ai-rewrite.ts` — change `rewriteMessage(text: string)` signature to `rewriteMessage(text: string, stage: 1 | 2 | 3)`
- [x] 5.2 Add a `STAGE_PROMPT_PREFIX` map in `lib/email/ai-rewrite.ts` keyed by stage:
  - Stage 1: `"This is a first reminder email. Keep it gentle and friendly — assume the invoice was simply overlooked."`
  - Stage 2: `"This is a second reminder email. Acknowledge that a prior message was sent. Be professional but make urgency clear."`
  - Stage 3: `"This is a final notice email. Be direct and urgent. Reference days overdue if present. Specify a firm deadline for payment."`
- [x] 5.3 Prepend the stage prefix to the system prompt before the three-tone instruction; keep the rest of the prompt unchanged

## 6. UI — merge AI into Templates, remove standalone AI tab

- [x] 6.1 Delete `app/dashboard/settings/ai/page.tsx`
- [x] 6.2 Delete `components/settings/AiSettingsClient.tsx`
- [x] 6.3 Remove the `{ href: "/dashboard/settings/ai", label: "AI" }` entry from the `TABS` array in `app/dashboard/settings/layout.tsx`
- [x] 6.4 In `app/dashboard/settings/templates/page.tsx`, compute `canRewrite: hasPlanFeature(tier, "ai_rewrite")` and pass it as a prop to `TemplatesClient`
- [x] 6.5 Add `canRewrite: boolean` to the `TemplateData` interface (or as a separate prop) in `TemplatesClient.tsx`
- [x] 6.6 Add AI rewrite state to `TemplatesClient.tsx`: `aiVariants: RewriteOutput | null`, `aiLoading: boolean`, `aiError: string | null`, `aiDiffTone: "friendly" | "firm" | "final_notice"` (active tab in diff panel)
- [x] 6.7 Add `STAGE_TO_TONE` map: `{ 1: "friendly", 2: "firm", 3: "final_notice" }` — used to set the default diff tab when variants arrive
- [x] 6.8 Add `handleAiRewrite()` async function: POSTs `{ text: textBody, stage }` to `/api/settings/ai`; on success stores result in `aiVariants` and sets `aiDiffTone` to `STAGE_TO_TONE[stage]`; on failure sets `aiError`
- [x] 6.9 Add "AI Rewrite" button below the `TemplateEditor` inside the body editor section, visible only when `canRewrite && data.canCustomize`; disabled while `aiLoading` or `saving`; shows `<Spinner />` while `aiLoading`; clears `aiError` on click before calling `handleAiRewrite()`
- [x] 6.10 Build the diff panel (rendered when `aiVariants !== null`):
  - Left column header: "Current"; left column body: `textBody` as plain text in a scrollable `<pre>` or `<div>`
  - Right column header: tone tab group (Friendly / Firm / Final Notice), active tab = `aiDiffTone`
  - Right column body: `aiVariants[aiDiffTone].message` as plain text
  - Show a "Subject will change to: …" note below the right column when `aiVariants[aiDiffTone].subject !== subject`
  - [Apply] button: sets `textBody` to `aiVariants[aiDiffTone].message`; sets `subject` to `aiVariants[aiDiffTone].subject`; clears `aiVariants` and `aiError`
  - [Discard] button: clears `aiVariants` and `aiError`
- [x] 6.11 Reset `aiVariants` and `aiError` on stage change (`handleStageChange`)

## 7. Verification

- [x] 7.1 Run `npm run test` — confirm existing tests still pass
- [x] 7.2 Run `npm run verify-rls` — confirm `ai_usage_logs` RLS policies are enforced correctly
- [ ] 7.3 Manual smoke test: sign in as a Small Business user → Settings → Templates → select Stage 2 → edit body → click "AI Rewrite" → verify diff panel opens with original on the left and the Firm variant on the right pre-selected → verify tone tabs switch to Friendly / Final Notice → click Apply → confirm editor updates → save template
- [ ] 7.4 Manual smoke test: sign in as a Starter user → Settings → Templates → confirm "AI Rewrite" button is not visible
- [ ] 7.5 Confirm a row appears in `ai_usage_logs` after a successful rewrite with correct `stage`-driven prompt token count and non-zero `estimatedCostUsd`
- [ ] 7.6 Confirm Settings navigation no longer shows the AI tab for any user
- [ ] 7.7 Set `OPENAI_API_KEY` in Vercel Preview and Production environments per `docs/runbooks/openai.md`
