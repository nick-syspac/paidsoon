import { NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { isDebugEnabled } from "@/lib/diagnostics/server"
import { getServerSupabaseEnvironment } from "@/lib/config/supabaseEnvironment.server"

// This route intentionally uses `prismaAdmin` instead of `withUserContext`:
// it is a debug-only connectivity probe (gated by `isDebugEnabled()` below),
// has no signed-in user to scope to, and never reads or returns any
// user/tenant data — only `SELECT 1`.
export const dynamic = "force-dynamic"

function redactConnectionStrings(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, "[REDACTED]")
}

// Never return the raw DATABASE_URL — it contains the DB password. This
// derives a safe, credential-free summary (host/port/db/user/ssl) for
// display purposes only.
function describeConnectionTarget(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null

  try {
    const parsed = new URL(rawUrl)
    const database = parsed.pathname.replace(/^\//, "") || "(default)"
    const sslMode = parsed.searchParams.get("sslmode") ?? parsed.searchParams.get("pgbouncer")
    return [
      `user=${parsed.username || "(unknown)"}`,
      `host=${parsed.hostname}`,
      `port=${parsed.port || "5432"}`,
      `db=${database}`,
      sslMode ? `sslmode=${sslMode}` : undefined,
    ]
      .filter(Boolean)
      .join(" ")
  } catch {
    return null
  }
}

export async function GET() {
  // Hide the endpoint entirely (404, not 403) when DEBUG is not enabled so
  // its existence isn't disclosed in production.
  if (!isDebugEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const startedAt = Date.now()
  // Credential-free (no password) — safe to return to the client.
  const connectionTarget = describeConnectionTarget(
    getServerSupabaseEnvironment("runtime").databaseUrl
  )

  try {
    await prismaAdmin.$queryRaw`SELECT 1`
    return NextResponse.json({
      ok: true,
      message: "Database connection successful.",
      connectionTarget,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({
      ok: false,
      message: "Database connection failed.",
      connectionTarget,
      error: redactConnectionStrings(rawMessage).slice(0, 500),
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    })
  }
}
