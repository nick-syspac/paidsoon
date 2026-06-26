import { createOpenAI } from "@ai-sdk/openai"
import { generateObject, jsonSchema } from "ai"

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
// Output types
// ---------------------------------------------------------------------------

export interface RewriteVariant {
  subject: string
  message: string
}

export interface RewriteOutput {
  friendly: RewriteVariant
  firm: RewriteVariant
  final_notice: RewriteVariant
}

// ---------------------------------------------------------------------------
// Output schema (JSON Schema — avoids Zod v4 incompatibility with AI SDK)
// ---------------------------------------------------------------------------

const variantShape = {
  type: "object" as const,
  properties: {
    subject: { type: "string" as const },
    message: { type: "string" as const },
  },
  required: ["subject", "message"],
  additionalProperties: false,
}

const rewriteOutputJsonSchema = jsonSchema<RewriteOutput>({
  type: "object",
  properties: {
    friendly: variantShape,
    firm: variantShape,
    final_notice: variantShape,
  },
  required: ["friendly", "firm", "final_notice"],
  additionalProperties: false,
})

// ---------------------------------------------------------------------------
// Stage-aware prompt prefix
// ---------------------------------------------------------------------------

const STAGE_PROMPT_PREFIX: Record<1 | 2 | 3, string> = {
  1: "This is a first reminder email. Keep it gentle and friendly — assume the invoice was simply overlooked.",
  2: "This is a second reminder email. Acknowledge that a prior message was sent. Be professional but make urgency clear.",
  3: "This is a final notice email. Be direct and urgent. Reference days overdue if present. Specify a firm deadline for payment.",
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(text: string, stage: 1 | 2 | 3): string {
  return `You are an expert business communications assistant for an invoice follow-up application.

Stage context: ${STAGE_PROMPT_PREFIX[stage]}

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
 * Uses OpenAI GPT-4o-mini with structured output (generateObject + jsonSchema).
 *
 * Throws on API errors — callers should wrap in try/catch and return HTTP 500.
 */
export async function rewriteMessage(text: string, stage: 1 | 2 | 3): Promise<RewriteResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local (dev) or Vercel environment variables (production). See docs/runbooks/openai.md §1.",
    )
  }

  const client = createOpenAI({ apiKey })

  const result = await generateObject({
    model: client(AI_REWRITE_MODEL),
    schema: rewriteOutputJsonSchema,
    prompt: buildPrompt(text, stage),
  })

  const inputTokens = result.usage.inputTokens ?? 0
  const outputTokens = result.usage.outputTokens ?? 0
  return {
    output: result.object,
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
  }
}

