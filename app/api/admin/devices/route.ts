import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { parseOpenSshPublicKey } from "@/lib/admin/ssh"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

const EnrolSchema = z.object({
  label: z.string().min(1).max(100),
  publicKey: z.string().min(1),
})

/**
 * GET /api/admin/devices
 * List admin devices for the current admin user.
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  let ctx: Awaited<ReturnType<typeof requireAdminElevation>>
  try {
    ctx = await requireAdminElevation()
  } catch (err) {
    if (err instanceof AdminGuardError) {
      const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  const devices = await prismaAdmin.adminDevice.findMany({
    where: { adminUserId: ctx.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      publicKeyFingerprint: true,
      keyType: true,
      status: true,
      createdAt: true,
      lastVerifiedAt: true,
      revokedAt: true,
    },
  })

  // publicKeyBytes is intentionally excluded from the response
  return NextResponse.json({ devices })
}

/**
 * POST /api/admin/devices
 * Enrol a new admin device (SSH public key).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ipAddress = getIpAddress(req)
  const userAgent = getUserAgent(req)
  const requestId = generateRequestId()

  let ctx: Awaited<ReturnType<typeof requireAdminElevation>>
  try {
    ctx = await requireAdminElevation()
  } catch (err) {
    if (err instanceof AdminGuardError) {
      const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
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

  const parsed = EnrolSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { label, publicKey } = parsed.data

  // Parse and validate the SSH public key
  let pubKeyBytes: Uint8Array<ArrayBuffer>
  let fingerprint: string
  let keyType: string
  try {
    const parsedKey = parseOpenSshPublicKey(publicKey)
    pubKeyBytes = parsedKey.publicKeyBytes as Uint8Array<ArrayBuffer>
    fingerprint = parsedKey.fingerprint
    keyType = parsedKey.keyType
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid public key", code: "invalid_key_format" },
      { status: 400 }
    )
  }

  // Reject duplicate fingerprints
  const existing = await prismaAdmin.adminDevice.findUnique({
    where: { publicKeyFingerprint: fingerprint },
  })
  if (existing) {
    return NextResponse.json({ error: "A device with this key fingerprint already exists", code: "duplicate_fingerprint" }, { status: 409 })
  }

  const device = await prismaAdmin.adminDevice.create({
    data: {
      adminUserId: ctx.userId,
      label,
      publicKeyBytes: pubKeyBytes,
      publicKeyFingerprint: fingerprint,
      keyType,
      status: "active",
      createdBy: ctx.userId,
    },
    select: {
      id: true,
      label: true,
      publicKeyFingerprint: true,
      keyType: true,
      status: true,
      createdAt: true,
    },
  })

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    adminDeviceId: device.id,
    adminDeviceFingerprint: device.publicKeyFingerprint,
    action: "device_enrolled",
    targetType: "admin_device",
    targetId: device.id,
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  return NextResponse.json({ device }, { status: 201 })
}
