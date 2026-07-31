import { NextResponse } from "next/server"
import { runPromiseAndArrangementBreachSweep } from "@/lib/email/breachSweep"

/**
 * Internal endpoint called by the Railway Celery `promise_followup`/
 * `arrangement_lifecycle` sweep tasks once per dispatch cycle (not a
 * per-item claim — see design.md). Secured with INTERNAL_JOBS_SECRET.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.INTERNAL_JOBS_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await runPromiseAndArrangementBreachSweep()
  return NextResponse.json(result)
}
