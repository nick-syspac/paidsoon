import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import * as crypto from "crypto"
import { prismaAdmin } from "@/lib/db/admin"
import { requirePlatformRole, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

const CHALLENGE_TTL_SECONDS = parseInt(process.env.ADMIN_CHALLENGE_TTL_SECONDS ?? "120", 10)
const MAX_FAILED_ATTEMPTS = parseInt(process.env.ADMIN_MAX_FAILED_ATTEMPTS ?? "5", 10)

const RequestSchema = z.object({
  deviceId: z.string().min(1, "deviceId is required"),
})

/**
 * POST /api/admin/challenges
 *
 * Create a one-time challenge nonce for SSH-key admin elevation.
 * Requires: valid Supabase session + active PlatformRole (no AdminSession needed).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ipAddress = getIpAddress(req)
  const userAgent = getUserAgent(req)
  const requestId = generateRequestId()

  let ctx: Awaited<ReturnType<typeof requirePlatformRole>>
  try {
    ctx = await requirePlatformRole()
  } catch (err) {
    if (err instanceof AdminGuardError) {
      const status = err.code === "unauthenticated" ? 401 : 403
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  // Rate-limit: count recent failed challenge verifications for this user
  const recentFailures = await prismaAdmin.adminAuditEvent.count({
    where: {
      actorUserId: ctx.userId,
      action: "admin_challenge_failed",
      success: false,
      createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }, // last 10 min
    },
  })

  if (recentFailures >= MAX_FAILED_ATTEMPTS) {
    await logAdminEvent({
      actorUserId: ctx.userId,
      actorEmail: ctx.userEmail,
      platformRole: ctx.platformRole.role,
      action: "admin_challenge_created",
      ipAddress,
      userAgent,
      requestId,
      success: false,
      reason: "rate_limited",
    })
    return NextResponse.json({ error: "Too many failed attempts. Try again later.", code: "rate_limited" }, { status: 429 })
  }

  // Validate request body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { deviceId } = parsed.data

  // Verify device belongs to this user and is active
  const device = await prismaAdmin.adminDevice.findFirst({
    where: { id: deviceId, adminUserId: ctx.userId, status: "active" },
  })

  if (!device) {
    return NextResponse.json({ error: "Device not found or not active", code: "device_not_found" }, { status: 404 })
  }

  // Generate nonce (32 bytes, URL-safe base64)
  const nonce = crypto.randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000)

  const challenge = await prismaAdmin.adminChallenge.create({
    data: {
      userId: ctx.userId,
      nonce,
      expiresAt,
      ipAddress,
      userAgent,
    },
  })

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    adminDeviceId: device.id,
    adminDeviceFingerprint: device.publicKeyFingerprint,
    action: "admin_challenge_created",
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  return NextResponse.json({ challengeId: challenge.id, nonce })
}
