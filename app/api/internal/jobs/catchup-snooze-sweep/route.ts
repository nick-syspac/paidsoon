import { NextResponse } from "next/server"
import { runCatchupAndSnoozeSweep } from "@/lib/email/breachSweep"

/**
 * Internal endpoint called by the Railway Celery `catchup_and_snooze` sweep
 * task once per dispatch cycle. Secured with INTERNAL_JOBS_SECRET.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.INTERNAL_JOBS_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await runCatchupAndSnoozeSweep()
  return NextResponse.json(result)
}
