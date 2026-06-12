import { createClient } from "@/lib/supabase/server"
import { requireFeature } from "@/lib/billing"
import { NextResponse } from "next/server"
import { z } from "zod"

const rewriteSchema = z.object({
  text: z.string().min(10).max(5000),
  tone: z.enum(["friendly", "firm", "final_notice"]).optional(),
})

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [canRewrite, canSetTone] = await Promise.all([
    requireFeature(user.id, "ai_rewrite"),
    requireFeature(user.id, "tone_settings"),
  ])

  return NextResponse.json({ canRewrite, canSetTone })
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

  const [canRewrite, canSetTone] = await Promise.all([
    requireFeature(user.id, "ai_rewrite"),
    requireFeature(user.id, "tone_settings"),
  ])

  if (!canRewrite) {
    return NextResponse.json(
      { error: "Small Business subscription required for AI rewrite" },
      { status: 403 },
    )
  }

  if (parsed.data.tone && !canSetTone) {
    return NextResponse.json(
      { error: "Small Business subscription required for tone settings" },
      { status: 403 },
    )
  }

  const tone = parsed.data.tone ?? "friendly"
  const rewrittenText = `[${tone}] ${parsed.data.text}`

  return NextResponse.json({
    success: true,
    rewrittenText,
  })
}
