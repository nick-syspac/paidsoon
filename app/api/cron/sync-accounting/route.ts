/**
 * GET /api/cron/sync-accounting
 *
 * Vercel Cron job: syncs all active accounting connections.
 * Runs daily at 02:00 UTC (see vercel.json).
 *
 * Security: authenticated via CRON_SECRET Bearer token.
 * Uses prismaAdmin / syncAllActiveConnections (cron context — RLS bypass is intentional).
 *
 * Also cleans up expired oauth_states rows (TTL housekeeping).
 *
 * Response: JSON summary of sync results for observability.
 */
import { syncAllActiveConnections } from "@/lib/providers/accounting/sync"
import { prismaAdmin } from "@/lib/db/admin"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = new Date()

  // Housekeeping: delete expired OAuth state nonces
  await prismaAdmin.oauthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })

  const results = await syncAllActiveConnections()

  const summary = {
    syncedAt: startedAt.toISOString(),
    totalConnections: results.length,
    succeeded: results.filter((r) => r.status === "success").length,
    partial: results.filter((r) => r.status === "partial").length,
    failed: results.filter((r) => r.status === "failed").length,
    invoicesCreated: results.reduce((n, r) => n + r.invoicesCreated, 0),
    invoicesUpdated: results.reduce((n, r) => n + r.invoicesUpdated, 0),
  }

  return NextResponse.json(summary)
}
