# OpenAI / AI Rewrite Runbook

PaidSoon uses OpenAI to power the **AI Message Rewrite** feature. A single API call takes the user's draft invoice follow-up message and returns three professionally rewritten variants — Friendly, Firm, and Final Notice — as structured JSON.

> Env-var values come from [README.md](./README.md) — set them in the environment named in each row.

**Tier gate:** `ai_rewrite` and `tone_settings` features are gated to the **Solo** plan and above (`lib/subscriptionPlans.ts`). The API route at `app/api/settings/ai/route.ts` enforces this before calling OpenAI.

---

## 1. OpenAI account and API key

### 1.1 Create an account

Go to [platform.openai.com](https://platform.openai.com) and sign up or sign in.

### 1.2 Add billing

Platform home → **Billing → Add payment method**. OpenAI requires a funded account to make API calls. Add a credit card and consider setting a **Usage limit** (e.g. $10/month) under Billing → Usage limits to cap unexpected spend.

### 1.3 Create a project API key

1. Platform home → **API keys → Create new secret key**.
2. Name: `paidsoon-dev` for dev/preview, `paidsoon-prod` for production.
3. Copy the key (starts with `sk-proj-…` or `sk-…`) — it is **never shown again**.
4. Store as `OPENAI_API_KEY` per the matrix in [README.md](./README.md).

Use **separate keys per environment** so you can rotate them independently and see per-environment usage in the dashboard.

### 1.4 Local / Preview key posture

Use the same test key for both Local and Vercel Preview. Real calls are made (not mocked) but the model is cheap enough that dev usage is negligible (see §4 for cost estimates).

---

## 2. Package installation

The Vercel AI SDK (`ai`) and its OpenAI provider (`@ai-sdk/openai`) are required:

```bash
npm install ai @ai-sdk/openai
```

These are **runtime dependencies** (not devDependencies). Add them to `dependencies` in `package.json`.

The integration uses `generateObject` (structured output mode) rather than `generateText`, so the model response is parsed directly into the typed Zod schema — no JSON.parse or string handling required.

---

## 3. Model

| Setting | Value |
|---|---|
| Model | `gpt-4o-mini` |
| OpenAI API version | latest (no pin required for this usage) |
| Output mode | Structured output (`generateObject`) |
| Streaming | No (one-shot, wait for complete result) |
| Max tokens | Not set — output is naturally bounded by the three-variant format |

`gpt-4o-mini` is chosen because:
- It is the cheapest OpenAI model with strong instruction-following capability.
- A tone rewrite does not require reasoning depth; it requires tone fidelity and text quality.
- Latency is typically 1–3 seconds for this prompt size — acceptable for a "Rewrite" button.

Do not upgrade to `gpt-4o` or later models without a documented reason; the cost increase (~14×) is not justified for this use case.

---

## 4. Cost estimates

Each call to the AI rewrite endpoint sends the system prompt + user text and receives three rewritten versions.

**Approximate token counts per call:**

| Component | Tokens (approx) |
|---|---|
| System prompt | ~450 |
| User text (avg invoice message) | ~100 |
| Three output variants (subject + message each) | ~600 |
| **Total** | **~1,150** |

**Cost per call (gpt-4o-mini pricing as of June 2026):**

| Tokens | Rate | Cost |
|---|---|---|
| ~550 input | $0.15 / 1M | $0.000083 |
| ~600 output | $0.60 / 1M | $0.000360 |
| **Total** | | **~$0.00044 (~£0.00035)** |

**Monthly cost at scale (Solo tier and above):**

| Rewrites/month | Approx cost |
|---|---|
| 100 | £0.04 |
| 500 | £0.18 |
| 2,000 | £0.70 |
| 10,000 | £3.50 |

At current Solo pricing (A$19/month), AI costs represent less than 1% of plan revenue even at high usage. A rate limit of **200 rewrites per user per month** is a reasonable first guard (see §6).

---

## 5. Usage tracking (DB migration required)

Every successful AI rewrite call is logged to the `ai_usage_logs` table. This supports:
- Per-user usage visibility for future rate limiting.
- Operator cost attribution.
- Data to inform add-on pricing decisions.

### 5.1 Prisma schema change

Add the following model to `prisma/schema.prisma`:

```prisma
model AiUsageLog {
  id                     String      @id @default(cuid())
  userId                 String      @map("user_id")
  model                  String      // e.g. "gpt-4o-mini"
  feature                String      // e.g. "ai_rewrite"
  promptTokens           Int         @map("prompt_tokens")
  completionTokens       Int         @map("completion_tokens")
  totalTokens            Int         @map("total_tokens")
  estimatedCostMicropence Int        @map("estimated_cost_micropence")
  // 1 pence = 1,000,000 micropence. Stored as Int to avoid float precision issues.
  // Example: £0.00035 = 35 millipence = 35,000 micropence → store 35000
  createdAt              DateTime    @default(now()) @map("created_at")

  userProfile UserProfile @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([createdAt])
  @@map("ai_usage_logs")
}
```

Add the reverse relation to `UserProfile`:

```prisma
// inside model UserProfile { ... }
aiUsageLogs AiUsageLog[]
```

### 5.2 RLS policy required

After the migration, add a policy to `prisma/rls-policies.sql`:

```sql
-- ai_usage_logs: users can read their own rows; inserts are admin-only (from route handler via prismaAdmin)
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI usage"
  ON ai_usage_logs FOR SELECT
  USING (user_id = auth.uid()::text);

-- No INSERT policy for users — the route handler writes via prismaAdmin.
```

> **Note:** The route handler at `app/api/settings/ai/route.ts` writes usage logs using `prismaAdmin` (bypassing RLS), because the user context transaction is complete before we know final token counts. This is a documented exception — see the comment in the route file.

### 5.3 Micropence cost calculation

At call time, compute as follows (TypeScript):

```ts
// gpt-4o-mini pricing (USD, as of June 2026)
const INPUT_COST_PER_TOKEN_USD  = 0.15  / 1_000_000  // $0.15 per 1M input tokens
const OUTPUT_COST_PER_TOKEN_USD = 0.60  / 1_000_000  // $0.60 per 1M output tokens
const USD_TO_GBP = 0.79  // update periodically; or store in USD and convert at display time

const costUsd = (usage.promptTokens * INPUT_COST_PER_TOKEN_USD)
              + (usage.completionTokens * OUTPUT_COST_PER_TOKEN_USD)
const costPence = costUsd * USD_TO_GBP * 100
const estimatedCostMicropence = Math.round(costPence * 1_000_000)
```

Consider storing costs in USD and converting at query/display time to avoid baking in an exchange rate.

### 5.4 Migration command

```bash
npx prisma migrate dev --name add-ai-usage-logs
```

After migration, update `prisma/rls-policies.sql` and run:

```bash
npm run verify-rls
```

---

## 6. Rate limiting (future)

Usage logging in §5 is the prerequisite for rate limiting. When you are ready to enforce limits:

1. At the start of the POST handler, query `AiUsageLog` for the current calendar month:
   ```ts
   const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
   const callsThisMonth = await prismaAdmin.aiUsageLog.count({
     where: { userId: user.id, createdAt: { gte: monthStart }, feature: "ai_rewrite" }
   })
   if (callsThisMonth >= MONTHLY_REWRITE_LIMIT) {
     return NextResponse.json({ error: "Monthly AI rewrite limit reached" }, { status: 429 })
   }
   ```
2. Expose `callsThisMonth` in the GET response so the UI can show a usage indicator.
3. The recommended starting limit is **200 rewrites per user per month**, applied from Solo tier upward.

Do not implement a hard limit before usage data exists. Observe real usage patterns for one billing cycle first.

---

## 7. The rewrite prompt

The system prompt is defined in `lib/email/ai-rewrite.ts` (to be created). It must not be inlined in the route handler. The canonical prompt text:

```
You are an expert business communications assistant for an invoice follow-up application.

Your task is to rewrite the supplied message into three versions:

1. Friendly
2. Firm
3. Final Notice

The rewritten messages must:

- Preserve the original meaning and facts.
- Keep all invoice details, dates, amounts, names, and payment references unchanged.
- Sound professional, clear, and suitable for small business customer communication.
- Avoid legal threats unless the original text explicitly includes them.
- Avoid aggressive, rude, shaming, or emotional language.
- Be concise and easy to understand.
- Use Australian English spelling and tone.
- Include a clear call to action.
- Maintain a respectful tone even in the Final Notice version.

Tone requirements:

Friendly:
- Warm, polite, helpful, and low-pressure.
- Assume the customer may have overlooked the invoice.

Firm:
- Clear, direct, and professional.
- Communicate that payment is overdue and needs attention.
- Still remain respectful.

Final Notice:
- Serious, formal, and clear.
- State that this is a final reminder before further action may be considered.
- Do not invent specific legal, debt collection, credit reporting, or penalty actions unless they appear in the original text.
- Encourage immediate payment or urgent contact if there is a dispute or issue.

Return the response in the following JSON format only — no commentary outside the JSON:

{
  "friendly":      { "subject": "", "message": "" },
  "firm":          { "subject": "", "message": "" },
  "final_notice":  { "subject": "", "message": "" }
}

Text to rewrite:

"""
{{TEXT_TO_REWRITE}}
"""
```

> When using `generateObject` from the Vercel AI SDK, the JSON schema is enforced by the SDK — you do not need to instruct the model to return JSON. Remove the "Return the response in the following JSON format only" section from the prompt and let `generateObject` handle structure enforcement.

---

## 8. UI changes required

The current `AiSettingsClient.tsx` is designed around a **single tone output**. The prompt returns all three tones at once; the component must be updated to:

- Remove the tone selector dropdown (it is no longer needed pre-call).
- Show a single "Rewrite" button.
- On success, render three cards side by side (or in tabs): **Friendly / Firm / Final Notice**.
- Each card shows `subject` and `message`.
- Each card has a **Copy** button for the message body.
- Show token usage and estimated cost (optional, for operator transparency).

This is a meaningful UI redesign — scope it explicitly in the implementation change.

---

## 9. Environment variables

See the matrix in [README.md](./README.md) for per-environment values.

| Env var | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI secret key. Read by `lib/email/ai-rewrite.ts`. **Never expose to the browser.** |

### Per-environment posture

| Environment | Value |
|---|---|
| Local (`.env.local`) | `sk-proj-…` dev key from platform.openai.com |
| Vercel Preview | same dev key as Local (shared test usage) |
| Vercel Production | separate `sk-proj-…` production key |

---

## 10. Verification checklist

After deployment:

- [ ] `OPENAI_API_KEY` is set in the target environment on Vercel.
- [ ] `npm run prisma:migrate:deploy` has run and `ai_usage_logs` table exists.
- [ ] `npm run verify-rls` passes (RLS policy applied).
- [ ] Sign in as a Solo user; navigate to **Settings → AI**.
- [ ] Enter a short invoice message and click **Rewrite**.
- [ ] All three variant cards (Friendly / Firm / Final Notice) render with subject and message.
- [ ] A row is written to `ai_usage_logs` with correct token counts.
- [ ] Sign in as a Starter user; confirm the rewrite button is not accessible (upgrade prompt shown).
- [ ] Check OpenAI platform dashboard — usage appears under the correct API key.
