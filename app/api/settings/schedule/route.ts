import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { requireFeature } from "@/lib/billing"
import { NextResponse } from "next/server"
import { z } from "zod"

const updateSchema = z
  .object({
    email1DaysAfterDue: z.number().int().min(1),
    email2DaysAfterDue: z.number().int().min(1),
    email3DaysAfterDue: z.number().int().min(1),
  })
  .refine(
    (data) =>
      data.email1DaysAfterDue < data.email2DaysAfterDue &&
      data.email2DaysAfterDue < data.email3DaysAfterDue,
    {
      message: "Schedule must be in ascending order: email1 < email2 < email3",
    }
  )

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const schedule = await withUserContext(user.id, (tx) =>
    tx.schedule.findUnique({ where: { userId: user.id } }),
  )

  return NextResponse.json({ schedule })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const hasReminderSequenceAccess = await requireFeature(
    user.id,
    "email_reminder_sequence",
  )
  if (!hasReminderSequenceAccess) {
    return NextResponse.json(
      { error: "Solo or Small Business subscription required" },
      { status: 403 }
    )
  }

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  // Upsert schedule — does NOT retroactively update nextEmailAt on existing invoices
  await withUserContext(user.id, (tx) =>
    tx.schedule.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...parsed.data },
      update: parsed.data,
    }),
  )

  return NextResponse.json({ success: true })
}
