import { createClient } from "@/lib/supabase/server"
import { getSubscriptionTier, requireFeature } from "@/lib/billing"
import { NextResponse } from "next/server"
import { z } from "zod"

const updateSchema = z.object({
  subject: z.string().min(3).max(150),
  body: z.string().min(10).max(5000),
})

const BASIC_TEMPLATES = [
  { id: "gentle-reminder", label: "Gentle reminder" },
  { id: "payment-followup", label: "Payment follow-up" },
]

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hasBasicTemplates = await requireFeature(user.id, "basic_templates")
  if (!hasBasicTemplates) {
    return NextResponse.json(
      { error: "Your plan does not include templates" },
      { status: 403 },
    )
  }

  const canCustomize = await requireFeature(user.id, "custom_reminder_templates")
  const tier = await getSubscriptionTier(user.id)

  return NextResponse.json({
    tier,
    templates: BASIC_TEMPLATES,
    canCustomize,
  })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canCustomize = await requireFeature(user.id, "custom_reminder_templates")
  if (!canCustomize) {
    return NextResponse.json(
      { error: "Small Business subscription required for custom templates" },
      { status: 403 },
    )
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  // Scaffold behavior: return accepted custom template payload until template persistence model is introduced.
  return NextResponse.json({
    success: true,
    template: parsed.data,
  })
}
