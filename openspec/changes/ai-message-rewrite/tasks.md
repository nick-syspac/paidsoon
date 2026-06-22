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

- [x] 4.1 In `app/api/settings/ai/route.ts`, remove `tone` from the Zod `rewriteSchema` (field no longer accepted)
- [x] 4.2 Remove the `canSetTone` feature check and the related 403 branch from the POST handler
- [x] 4.3 Replace the placeholder `rewrittenText` line with a call to `rewriteMessage(parsed.data.text)` from `lib/email/ai-rewrite.ts`
- [x] 4.4 After a successful `rewriteMessage` call, write a row to `ai_usage_logs` via `prismaAdmin` with `userId`, `model` (`"gpt-4o-mini"`), `feature` (`"ai_rewrite"`), `promptTokens`, `completionTokens`, `totalTokens`, and `estimatedCostUsd` (calculated from token counts and pricing constants)
- [x] 4.5 Update the POST response shape to `{ success: true, friendly, firm, final_notice }` (three variant objects instead of single `rewrittenText`)
- [x] 4.6 Add a code comment on the `prismaAdmin` usage log write documenting it as a documented RLS bypass (token counts only available post-call, userId derived from server-side auth)
- [x] 4.7 Wrap the `rewriteMessage` call in try/catch; return HTTP 500 with `{ error: "Rewrite failed" }` on OpenAI errors (do not leak model error details to the client)

## 5. UI redesign

- [x] 5.1 In `components/settings/AiSettingsClient.tsx`, replace the `rewritten: string | null` state with `variants: { friendly, firm, final_notice } | null` where each variant is `{ subject: string, message: string }`
- [x] 5.2 Remove the `tone` state variable and the tone selector `<select>` element
- [x] 5.3 Update the `handleRewrite` fetch call to remove the `tone` field from the request body and destructure the new `{ friendly, firm, final_notice }` response shape
- [x] 5.4 Replace the single rewritten text output panel with three variant cards rendered in a row (or responsive column on mobile): Friendly, Firm, Final Notice
- [x] 5.5 Each card shows the variant label, subject line, and message body
- [x] 5.6 Add a Copy button to each card that writes `variant.message` to the clipboard using `navigator.clipboard.writeText`
- [x] 5.7 Update the loading state to disable the Rewrite button and show the `<Spinner />` component during the API call
- [x] 5.8 Update the error state to display the error below the textarea (existing pattern)
- [x] 5.9 Remove the `flags.canSetTone` branch entirely — tone gating is no longer relevant in the UI (all three tones are always returned)

## 6. Verification

- [x] 6.1 Run `npm run test` — confirm existing tests still pass
- [x] 6.2 Run `npm run verify-rls` — confirm `ai_usage_logs` RLS policies are enforced correctly
- [ ] 6.3 Manual smoke test (local): sign in as a Small Business user, navigate to Settings → AI, enter a sample invoice message, click Rewrite, verify all three variant cards render with subject and message
- [ ] 6.4 Manual smoke test (local): sign in as a Starter user, confirm the upgrade prompt renders and no rewrite call is made
- [ ] 6.5 Confirm a row appears in `ai_usage_logs` after a successful rewrite with correct token counts and non-zero `estimatedCostUsd`
- [ ] 6.6 Set `OPENAI_API_KEY` in Vercel Preview and Production environments per `docs/runbooks/openai.md`
