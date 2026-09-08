import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { listCommitments, summarizeCommitGuard } from "@/lib/commitguard/service"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  horizonDays: z.coerce.number().int().refine((value) => value === 7 || value === 30 || value === 60 || value === 90, {
    message: "horizonDays must be 7, 30, 60, or 90",
  }).default(90),
})

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hasFeature = await requireFeature(user.id, "commitguard_core")
  if (!hasFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    horizonDays: searchParams.get("horizonDays") ?? 90,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const summary = await summarizeCommitGuard({
      userId: user.id,
      cashAvailableCents: null,
    })

    const commitments = await listCommitments(user.id)
    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() + parsed.data.horizonDays)

    const timeline = commitments
      .filter((commitment) => commitment.nextDueDate && commitment.nextDueDate <= cutoff)
      .sort((left, right) => {
        const leftTime = left.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER
        const rightTime = right.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER
        return leftTime - rightTime
      })
      .map((commitment) => ({
        id: commitment.id,
        name: commitment.name,
        amountCents: commitment.amountCents,
        dueDate: commitment.nextDueDate,
        category: commitment.category,
        frequency: commitment.frequency,
        confidence: commitment.confidence,
        status: commitment.status,
        source: commitment.source,
      }))

    return NextResponse.json({
      horizonDays: parsed.data.horizonDays,
      horizons: summary.horizons,
      renewals: summary.renewals,
      timeline,
    })
  } catch (error) {
    console.error("[GET /api/commitguard/timeline] Failed to build timeline", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
