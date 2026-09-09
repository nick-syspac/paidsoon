import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { listCommitments, recordCommitGuardHealthEvents, recordCommitGuardTimelineEvents, summarizeCommitGuard } from "@/lib/commitguard/service"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  cashAvailableCents: z.coerce.number().int().nullable().optional(),
  taxProtectedCashCents: z.coerce.number().int().min(0).optional(),
  weeklyOperatingExpensesCents: z.coerce.number().int().min(0).optional(),
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
    cashAvailableCents: searchParams.get("cashAvailableCents"),
    taxProtectedCashCents: searchParams.get("taxProtectedCashCents") ?? undefined,
    weeklyOperatingExpensesCents: searchParams.get("weeklyOperatingExpensesCents") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const summary = await summarizeCommitGuard({
      userId: user.id,
      cashAvailableCents: parsed.data.cashAvailableCents ?? null,
      taxProtectedCashCents: parsed.data.taxProtectedCashCents,
      weeklyOperatingExpensesCents: parsed.data.weeklyOperatingExpensesCents,
    })

    const commitments = await listCommitments(user.id)
    await Promise.all([
      recordCommitGuardHealthEvents({
        userId: user.id,
        settings: summary.settings,
        freeCash: summary.freeCash,
      }),
      recordCommitGuardTimelineEvents({
        userId: user.id,
        settings: summary.settings,
        commitments,
        renewals: summary.renewals,
      }),
    ])

    return NextResponse.json({ summary })
  } catch (error) {
    console.error("[GET /api/commitguard/summary] Failed to load CommitGuard summary", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
