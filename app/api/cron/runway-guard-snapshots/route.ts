import { NextResponse } from "next/server"

import { runRunwaySnapshotSweep } from "@/lib/runwayGuard/snapshotJob"

export const maxDuration = 60

export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const summary = await runRunwaySnapshotSweep()
    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    console.error("[GET /api/cron/runway-guard-snapshots] Snapshot sweep failed", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
