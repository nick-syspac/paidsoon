import { createClient } from "@/lib/supabase/server"
import { getSubscriptionTier, requireFeature } from "@/lib/billing"
import { withUserContext } from "@/lib/db/withUserContext"
import { DEFAULT_STAGE_1, DEFAULT_STAGE_2, DEFAULT_STAGE_3 } from "@/lib/email/templates"
import { NextResponse } from "next/server"
import { z } from "zod"

const STAGE_DEFAULTS = {
  1: DEFAULT_STAGE_1,
  2: DEFAULT_STAGE_2,
  3: DEFAULT_STAGE_3,
} as const

const stageSchema = z.coerce.number().int().min(1).max(3) as z.ZodType<1 | 2 | 3>

const updateSchema = z.object({
  stage: stageSchema,
  subject: z.string().min(3).max(150),
  htmlBody: z.string().min(10).max(50000),
  textBody: z.string().min(10).max(10000),
})

const BASIC_TEMPLATES = [
  { id: "gentle-reminder", label: "Gentle reminder" },
  { id: "payment-followup", label: "Payment follow-up" },
]

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const stageParsed = stageSchema.safeParse(searchParams.get("stage") ?? "1")
    const stage: 1 | 2 | 3 = stageParsed.success ? stageParsed.data : 1

    const [hasBasicTemplates, canCustomize, tier] = await Promise.all([
      requireFeature(user.id, "basic_templates"),
      requireFeature(user.id, "custom_reminder_templates"),
      getSubscriptionTier(user.id),
    ])

    if (!hasBasicTemplates) {
      return NextResponse.json(
        { error: "Your plan does not include templates" },
        { status: 403 },
      )
    }

    // Look up saved custom template for this stage
    let saved = null
    if (canCustomize) {
      saved = await withUserContext(user.id, (tx) =>
        tx.emailTemplate.findUnique({ where: { userId_stage: { userId: user.id, stage } } })
      )
    }

    if (saved) {
      return NextResponse.json({
        tier,
        templates: BASIC_TEMPLATES,
        canCustomize,
        stage,
        subject: saved.subject,
        htmlBody: saved.htmlBody,
        textBody: saved.textBody,
        isCustom: true,
      })
    }

    const defaults = STAGE_DEFAULTS[stage]
    return NextResponse.json({
      tier,
      templates: BASIC_TEMPLATES,
      canCustomize,
      stage,
      subject: defaults.subject,
      htmlBody: defaults.htmlBody,
      textBody: defaults.textBody,
      isCustom: false,
    })
  } catch (err) {
    console.error("[GET /api/settings/templates] error:", err)
    return NextResponse.json({ error: "Failed to load template" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
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

    const { stage, subject, htmlBody, textBody } = parsed.data

    const template = await withUserContext(user.id, (tx) =>
      tx.emailTemplate.upsert({
        where: { userId_stage: { userId: user.id, stage } },
        update: { subject, htmlBody, textBody },
        create: { userId: user.id, stage, subject, htmlBody, textBody },
      })
    )

    return NextResponse.json({ success: true, template })
  } catch (err) {
    console.error("[PUT /api/settings/templates] error:", err)
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const stageParsed = stageSchema.safeParse(searchParams.get("stage"))
    if (!stageParsed.success) {
      return NextResponse.json({ error: "Invalid stage" }, { status: 422 })
    }

    const stage = stageParsed.data

    await withUserContext(user.id, async (tx) => {
      const existing = await tx.emailTemplate.findUnique({
        where: { userId_stage: { userId: user.id, stage } },
      })
      if (existing) {
        await tx.emailTemplate.delete({ where: { userId_stage: { userId: user.id, stage } } })
      }
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[DELETE /api/settings/templates] error:", err)
    return NextResponse.json({ error: "Failed to reset template" }, { status: 500 })
  }
}
