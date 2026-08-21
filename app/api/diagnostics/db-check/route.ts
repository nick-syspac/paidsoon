import { NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { isDebugEnabled } from "@/lib/diagnostics/server"
import { getServerSupabaseEnvironment } from "@/lib/config/supabaseEnvironment.server"

// This route intentionally uses `prismaAdmin` instead of `withUserContext`:
// it is a debug-only connectivity probe (gated by `isDebugEnabled()` below),
// has no signed-in user to scope to, and never reads or returns any
// user/tenant data — only `SELECT 1`.
export const dynamic = "force-dynamic"

type DiagnosticCheck = {
  ok: boolean
  message: string
  latencyMs: number
  error?: string
}

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

async function checkDatabaseConnection(): Promise<DiagnosticCheck> {
  const startedAt = Date.now()

  try {
    await prismaAdmin.$queryRaw`SELECT 1`
    return {
      ok: true,
      message: "Database connection successful.",
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      message: "Database connection failed.",
      error: redactConnectionStrings(rawMessage).slice(0, 500),
      latencyMs: Date.now() - startedAt,
    }
  }
}

async function checkSupabaseApiKey(
  publicUrl: string,
  apiKey: string | undefined,
  label: string,
  options: { path: string; includeAuthorization?: boolean }
): Promise<DiagnosticCheck> {
  const startedAt = Date.now()

  if (!apiKey) {
    return {
      ok: false,
      message: `${label} is not configured.`,
      latencyMs: Date.now() - startedAt,
    }
  }

  try {
    const response = await fetch(`${publicUrl}${options.path}`, {
      headers: {
        apikey: apiKey,
        Accept: "application/json",
        ...(options.includeAuthorization
          ? { Authorization: `Bearer ${apiKey}` }
          : {}),
      },
      cache: "no-store",
    })

    return {
      ok: response.ok,
      message: response.ok
        ? `${label} is working.`
        : `${label} was rejected (HTTP ${response.status}).`,
      latencyMs: Date.now() - startedAt,
    }
  } catch {
    return {
      ok: false,
      message: `${label} check could not reach Supabase.`,
      latencyMs: Date.now() - startedAt,
    }
  }
}

export async function GET() {
  // Hide the endpoint entirely (404, not 403) when DEBUG is not enabled so
  // its existence isn't disclosed in production.
  if (!isDebugEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const startedAt = Date.now()
  const environment = getServerSupabaseEnvironment("runtime")
  // Credential-free (no password) — safe to return to the client.
  const connectionTarget = describeConnectionTarget(environment.databaseUrl)
  const [database, publishableKey, secretKey] = await Promise.all([
    checkDatabaseConnection(),
    checkSupabaseApiKey(
      environment.publicUrl,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      "Supabase publishable key",
      { path: "/auth/v1/settings" }
    ),
    checkSupabaseApiKey(
      environment.publicUrl,
      process.env.SUPABASE_SECRET_KEY,
      "Supabase secret key",
      {
        path: "/auth/v1/admin/users?page=1&per_page=1",
        includeAuthorization: true,
      }
    ),
  ])
  const ok = database.ok && publishableKey.ok && secretKey.ok

  return NextResponse.json({
    ok,
    message: ok
      ? "Database connection and Supabase API keys are working."
      : "One or more database connection checks failed.",
    connectionTarget,
    checks: { database, publishableKey, secretKey },
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
  })
}
