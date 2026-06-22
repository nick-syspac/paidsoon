import { createClient } from "@/lib/supabase/server"
import { requireFeature } from "@/lib/billing"
import { prismaAdmin } from "@/lib/db/admin"
import {
  rewriteMessage,
  AI_REWRITE_MODEL,
  INPUT_COST_PER_TOKEN_USD,
  OUTPUT_COST_PER_TOKEN_USD,
} from "@/lib/email/ai-rewrite"
import { NextResponse } from "next/server"
import { z } from "zod"

const rewriteSchema = z.object({
  text: z.string().min(10).max(5000),
})

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canRewrite = await requireFeature(user.id, "ai_rewrite")

  return NextResponse.json({ canRewrite })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = rewriteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const canRewrite = await requireFeature(user.id, "ai_rewrite")

  if (!canRewrite) {
    return NextResponse.json(
      { error: "Small Business subscription required for AI rewrite" },
      { status: 403 },
    )
  }

  let rewriteResult
  try {
    rewriteResult = await rewriteMessage(parsed.data.text)
  } catch {
    // Do not leak model error details to the client
    return NextResponse.json({ error: "Rewrite failed" }, { status: 500 })
  }

  const { output, usage } = rewriteResult

  // Documented RLS bypass: token counts are only available after the OpenAI call
  // completes, outside any user-context transaction. userId is derived from
  // supabase.auth.getUser() (server-side, trusted) — not from the request body.
  const estimatedCostUsd =
    usage.promptTokens * INPUT_COST_PER_TOKEN_USD +
    usage.completionTokens * OUTPUT_COST_PER_TOKEN_USD

  await prismaAdmin.aiUsageLog.create({
    data: {
      userId: user.id,
      model: AI_REWRITE_MODEL,
      feature: "ai_rewrite",
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      estimatedCostUsd,
    },
  })

  return NextResponse.json({
    success: true,
    friendly: output.friendly,
    firm: output.firm,
    final_notice: output.final_notice,
  })
}
