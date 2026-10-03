import { NextResponse } from "next/server"

import { runSpendClassificationBatch } from "@/lib/spendClassification/worker"

export const maxDuration = 60

export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const counters = await runSpendClassificationBatch()
    return NextResponse.json({ ok: true, ...counters })
  } catch {
    // Do not log provider/DB errors that could contain tenant transaction context.
    console.error("[GET /api/cron/spend-classification] Worker batch failed")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
