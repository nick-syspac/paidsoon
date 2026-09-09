import { NextResponse } from "next/server"

import { runMarginAlertSweep } from "@/lib/marginguard/alertJob"
import { runMarginOpportunitySweep } from "@/lib/marginguard/opportunityJob"
import { runMarginSnapshotSweep } from "@/lib/marginguard/snapshotJob"

export const maxDuration = 60

export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const snapshotSummary = await runMarginSnapshotSweep()
    const alertSummary = await runMarginAlertSweep()
    const opportunitySummary = await runMarginOpportunitySweep()
    return NextResponse.json({
      ok: true,
      snapshots: snapshotSummary,
      alerts: alertSummary,
      opportunities: opportunitySummary,
    })
  } catch (error) {
    console.error("[GET /api/cron/margin-guard-snapshots] Snapshot sweep failed", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
