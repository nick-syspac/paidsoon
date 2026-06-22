import { createOpenAI } from "@ai-sdk/openai"
import { generateObject } from "ai"
import { z } from "zod"

// ---------------------------------------------------------------------------
// Config guard
// ---------------------------------------------------------------------------

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  throw new Error(
    "OPENAI_API_KEY is not set. Add it to .env.local (dev) or Vercel environment variables (production). See docs/runbooks/openai.md §1.",
  )
}

const openai = createOpenAI({ apiKey })

// ---------------------------------------------------------------------------
// Model and pricing constants (gpt-4o-mini, as of June 2026)
// Exported so the route handler can compute estimatedCostUsd from usage counts.
// ---------------------------------------------------------------------------

export const AI_REWRITE_MODEL = "gpt-4o-mini" as const

/** Cost per input token in USD */
export const INPUT_COST_PER_TOKEN_USD = 0.15 / 1_000_000

/** Cost per output token in USD */
export const OUTPUT_COST_PER_TOKEN_USD = 0.60 / 1_000_000

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

export const rewriteVariantSchema = z.object({
  subject: z.string(),
  message: z.string(),
})

export const rewriteOutputSchema = z.object({
  friendly: rewriteVariantSchema,
  firm: rewriteVariantSchema,
  final_notice: rewriteVariantSchema,
})

export type RewriteVariant = z.infer<typeof rewriteVariantSchema>
export type RewriteOutput = z.infer<typeof rewriteOutputSchema>

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(text: string): string {
  return `You are an expert business communications assistant for an invoice follow-up application.

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

Text to rewrite:

"""
${text}
"""`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RewriteResult {
  output: RewriteOutput
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * Rewrite an invoice follow-up message into three professionally toned variants.
 * Uses OpenAI GPT-4o-mini with structured output (generateObject).
 *
 * Throws on API errors — callers should wrap in try/catch and return HTTP 500.
 */
export async function rewriteMessage(text: string): Promise<RewriteResult> {
  const result = await generateObject({
    model: openai(AI_REWRITE_MODEL),
    schema: rewriteOutputSchema,
    prompt: buildPrompt(text),
  })

  return {
    output: result.object,
    usage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
    },
  }
}
