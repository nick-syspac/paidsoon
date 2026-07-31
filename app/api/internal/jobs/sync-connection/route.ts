import { NextResponse } from "next/server"
import { z } from "zod"
import { syncConnection } from "@/lib/providers/accounting/sync"

const bodySchema = z.object({ accountingConnectionId: z.string().min(1) })

// Matches the existing cron route's duration cap for the same underlying
// per-connection sync work.
export const maxDuration = 60

/**
 * Internal endpoint called by the Railway Celery `accounting_sync` task for
 * a single claimed accounting connection. Secured with INTERNAL_JOBS_SECRET.
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

  const result = await syncConnection(parsed.data.accountingConnectionId)
  return NextResponse.json(result)
}
