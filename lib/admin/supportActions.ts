import { z } from "zod/v4"
import { NextRequest, NextResponse } from "next/server"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

export const ActionReasonSchema = z
  .string()
  .trim()
  .min(10, "reason must be at least 10 characters")
  .max(500, "reason must be at most 500 characters")

export function guardErrorResponse(err: unknown): NextResponse {
  if (err instanceof AdminGuardError) {
    const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
    return NextResponse.json({ error: err.message, code: err.code }, { status })
  }

  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function requireSupportActionContext(req: NextRequest) {
  const ctx = await requireAdminElevation({ minRole: "platform_admin" })

  return {
    ctx,
    requestMeta: {
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
      requestId: generateRequestId(),
    },
  }
}
