import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import * as crypto from "crypto"
import { cookies } from "next/headers"
import { prismaAdmin } from "@/lib/db/admin"
import { requirePlatformRole, AdminGuardError, ADMIN_SESSION_COOKIE } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { verifySshKeySig } from "@/lib/admin/ssh"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

const SESSION_TTL_MINUTES = parseInt(process.env.ADMIN_SESSION_TTL_MINUTES ?? "30", 10)
const REQUIRE_DEVICE_KEY = process.env.ADMIN_REQUIRE_DEVICE_KEY !== "false"

// Safety: ADMIN_REQUIRE_DEVICE_KEY must never be false in production.
if (process.env.NODE_ENV === "production" && !REQUIRE_DEVICE_KEY) {
  throw new Error("ADMIN_REQUIRE_DEVICE_KEY cannot be false in production")
}

const RequestSchema = z.object({
  deviceId: z.string().min(1),
  signature: z.string().min(1),
})

/**
 * POST /api/admin/challenges/[id]/verify
 *
 * Verify an SSH-signed challenge and create an elevated AdminSession.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: challengeId } = await params
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

  const { deviceId, signature } = parsed.data

  // Look up challenge
  const challenge = await prismaAdmin.adminChallenge.findUnique({
    where: { id: challengeId },
  })

  if (!challenge || challenge.userId !== ctx.userId) {
    return NextResponse.json({ error: "Challenge not found", code: "challenge_not_found" }, { status: 404 })
  }

  if (challenge.usedAt !== null) {
    await auditFailure(ctx, deviceId, "challenge_already_used", ipAddress, userAgent, requestId)
    return NextResponse.json({ error: "Challenge already used", code: "challenge_already_used" }, { status: 401 })
  }

  if (challenge.expiresAt < new Date()) {
    await auditFailure(ctx, deviceId, "challenge_expired", ipAddress, userAgent, requestId)
    return NextResponse.json({ error: "Challenge expired", code: "challenge_expired" }, { status: 401 })
  }

  // Look up device
  const device = await prismaAdmin.adminDevice.findFirst({
    where: { id: deviceId, adminUserId: ctx.userId },
  })

  if (!device) {
    await auditFailure(ctx, null, "device_not_found", ipAddress, userAgent, requestId)
    return NextResponse.json({ error: "Device not found", code: "device_not_found" }, { status: 404 })
  }

  if (device.status !== "active") {
    await auditFailure(ctx, device.id, "device_revoked", ipAddress, userAgent, requestId, device.publicKeyFingerprint)
    return NextResponse.json({ error: "Device is not active", code: "device_revoked" }, { status: 403 })
  }

  // Skip SSH verification in dev if ADMIN_REQUIRE_DEVICE_KEY=false
  if (REQUIRE_DEVICE_KEY) {
    let sigValid = false
    try {
      sigValid = verifySshKeySig({
        nonce: challenge.nonce,
        namespace: "paidsoon-admin-auth",
        signature,
        publicKeyBytes: Buffer.from(device.publicKeyBytes),
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : "signature_parse_error"
      await auditFailure(ctx, device.id, reason, ipAddress, userAgent, requestId, device.publicKeyFingerprint)
      return NextResponse.json({ error: "Invalid signature", code: "invalid_signature" }, { status: 401 })
    }

    if (!sigValid) {
      await auditFailure(ctx, device.id, "invalid_signature", ipAddress, userAgent, requestId, device.publicKeyFingerprint)
      return NextResponse.json({ error: "Invalid signature", code: "invalid_signature" }, { status: 401 })
    }
  }

  // Mark challenge used (atomic)
  const usedChallenge = await prismaAdmin.adminChallenge.updateMany({
    where: { id: challengeId, usedAt: null },
    data: { usedAt: new Date() },
  })

  if (usedChallenge.count === 0) {
    // Race condition: challenge was used between our check and the update
    await auditFailure(ctx, device.id, "challenge_already_used", ipAddress, userAgent, requestId, device.publicKeyFingerprint)
    return NextResponse.json({ error: "Challenge already used", code: "challenge_already_used" }, { status: 401 })
  }

  // Create AdminSession
  const sessionToken = crypto.randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000)

  const adminSession = await prismaAdmin.adminSession.create({
    data: {
      userId: ctx.userId,
      adminDeviceId: device.id,
      adminChallengeId: challengeId,
      sessionToken,
      expiresAt,
      ipAddress,
      userAgent,
    },
  })

  // Update device last verified metadata
  await prismaAdmin.adminDevice.update({
    where: { id: device.id },
    data: { lastVerifiedAt: new Date(), lastUsedIp: ipAddress, lastUserAgent: userAgent },
  })

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    adminDeviceId: device.id,
    adminDeviceFingerprint: device.publicKeyFingerprint,
    action: "admin_challenge_verified",
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    adminDeviceId: device.id,
    adminDeviceFingerprint: device.publicKeyFingerprint,
    action: "admin_session_started",
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  // Set HttpOnly, Secure, SameSite=Strict cookie
  const cookieStore = await cookies()
  const isProduction = process.env.NODE_ENV === "production"
  cookieStore.set(ADMIN_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  })

  return NextResponse.json({ sessionId: adminSession.id, expiresAt: adminSession.expiresAt.toISOString() })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function auditFailure(
  ctx: Awaited<ReturnType<typeof requirePlatformRole>>,
  deviceId: string | null,
  reason: string,
  ipAddress: string,
  userAgent: string,
  requestId: string,
  fingerprint?: string
) {
  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    adminDeviceId: deviceId ?? undefined,
    adminDeviceFingerprint: fingerprint,
    action: "admin_challenge_failed",
    ipAddress,
    userAgent,
    requestId,
    success: false,
    reason,
  })
}
