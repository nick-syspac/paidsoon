import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { summarizeCommitGuard } from "@/lib/commitguard/service"
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
    cashAvailableCents: searchParams.get("cashAvailableCents") ?? null,
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

    const monthWindow = summary.horizons.find((horizon) => horizon.days === 30)

    return NextResponse.json({
      committedOutflow: {
        next30DaysCents: monthWindow?.totalCents ?? 0,
        confirmedNext30DaysCents: monthWindow?.confirmedCents ?? 0,
        probableNext30DaysCents: monthWindow?.probableCents ?? 0,
        potentialNext30DaysCents: monthWindow?.potentialCents ?? 0,
      },
      freeCash: {
        cashAvailableCents: summary.freeCash.cashAvailableCents,
        protectedCashCents: summary.freeCash.protectedCashCents,
        committedCashCents: summary.freeCash.committedCashCents,
        taxProtectedCashCents: summary.freeCash.taxProtectedCashCents,
        safetyBufferCents: summary.freeCash.safetyBufferCents,
        freeCashCents: summary.freeCash.freeCashCents,
        status: summary.freeCash.status,
      },
    })
  } catch (error) {
    console.error("[GET /api/commitguard/cashplan] Failed to load cashplan projection", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
