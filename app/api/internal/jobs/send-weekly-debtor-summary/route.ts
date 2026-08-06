import { NextResponse } from "next/server"
import { z } from "zod"
import { sendWeeklyDebtorSummary } from "@/lib/email/sendWeeklyDebtorSummary"

const bodySchema = z.object({
  userId: z.string().min(1),
})

/**
 * Internal endpoint called by the Railway Celery `debtor_summary` task for a
 * single tenant. Secured with INTERNAL_JOBS_SECRET.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.INTERNAL_JOBS_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const result = await sendWeeklyDebtorSummary(parsed.data.userId)
  return NextResponse.json(result)
}