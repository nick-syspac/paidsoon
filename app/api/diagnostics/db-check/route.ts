import { NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { isDebugEnabled } from "@/lib/diagnostics/server"

// This route intentionally uses `prismaAdmin` instead of `withUserContext`:
// it is a debug-only connectivity probe (gated by `isDebugEnabled()` below),
// has no signed-in user to scope to, and never reads or returns any
// user/tenant data — only `SELECT 1`.
export const dynamic = "force-dynamic"

function redactConnectionStrings(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, "[REDACTED]")
}

export async function GET() {
  // Hide the endpoint entirely (404, not 403) when DEBUG is not enabled so
  // its existence isn't disclosed in production.
  if (!isDebugEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const startedAt = Date.now()

  try {
    await prismaAdmin.$queryRaw`SELECT 1`
    return NextResponse.json({
      ok: true,
      message: "Database connection successful.",
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({
      ok: false,
      message: "Database connection failed.",
      error: redactConnectionStrings(rawMessage).slice(0, 500),
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    })
  }
}
