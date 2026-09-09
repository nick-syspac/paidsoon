import { NextResponse } from "next/server"
import { z } from "zod"

import { withUserContext } from "@/lib/db/withUserContext"
import { calculateRunwayTrend } from "@/lib/runwayGuard/foundation"
import { requireRunwayGuardCoreAccess } from "@/lib/runwayGuard/entitlements"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(365).optional().default(30),
})

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await requireRunwayGuardCoreAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const history = await withUserContext(user.id, async (tx) =>
      tx.runwayGuardSnapshot.findMany({
        where: { userId: user.id },
        orderBy: { snapshotAt: "asc" },
        select: { snapshotAt: true, runwayDays: true },
        take: parsed.data.limit,
      }),
    )

    const trend = calculateRunwayTrend(
      history.map((row) => ({
        snapshotAt: new Date(row.snapshotAt),
        runwayDays: Number(row.runwayDays),
      })),
    )

    return NextResponse.json({
      history: history.map((row) => ({
        snapshotAt: row.snapshotAt.toISOString(),
        runwayDays: Number(row.runwayDays),
      })),
      trend,
    })
  } catch (error) {
    console.error("[GET /api/runway-guard/history] Failed to load runway history", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
