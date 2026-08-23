/**
 * Admin session helpers.
 *
 * All DB operations use `prismaAdmin` (bypasses RLS) — admin tables are
 * isolated from tenant clients.
 */

import { prismaAdmin } from "@/lib/db/admin"
import type { AdminSession } from "@/lib/generated/prisma/client"
import type { PlatformRoleType } from "@/lib/generated/prisma/enums"
import { logAdminEvent } from "@/lib/admin/audit"

/**
 * Look up an active, non-expired, non-revoked `AdminSession` by session token.
 * Returns `null` if not found, expired, or revoked.
 */
export async function getActiveAdminSession(sessionToken: string): Promise<AdminSession | null> {
  if (!sessionToken) return null

  const session = await prismaAdmin.adminSession.findUnique({
    where: { sessionToken },
  })

  if (!session) return null
  if (session.revokedAt !== null) return null
  if (session.expiresAt < new Date()) return null

  return session
}

/**
 * Revoke an `AdminSession` by ID. Sets `revokedAt = now()`.
 * No-ops silently if the session does not exist.
 */
export async function revokeAdminSession(sessionId: string): Promise<void> {
  await prismaAdmin.adminSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/**
 * Revoke all active `AdminSession` rows for a given user.
 */
export async function revokeAllAdminSessionsForUser(userId: string): Promise<void> {
  await prismaAdmin.adminSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/**
 * Revoke all active `AdminSession` rows associated with a specific device.
 */
export async function revokeAllAdminSessionsForDevice(adminDeviceId: string): Promise<void> {
  await prismaAdmin.adminSession.updateMany({
    where: { adminDeviceId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

type RequestAuditMeta = {
  ipAddress: string
  userAgent: string
  requestId: string
}

type SupportImpersonationStartInput = {
  adminSessionId: string
  adminUserId: string
  actorEmail: string
  platformRole: PlatformRoleType
  targetUserId: string
  targetDisplayName: string | null
  notifyCustomer: boolean
  adminDeviceId?: string | null
  requestMeta: RequestAuditMeta
}

export async function beginSupportImpersonation(input: SupportImpersonationStartInput): Promise<void> {
  await prismaAdmin.adminSession.update({
    where: { id: input.adminSessionId },
    data: {
      impersonatedUserId: input.targetUserId,
      notifyCustomer: input.notifyCustomer,
      startedAt: new Date(),
      endedAt: null,
      duration: null,
      actionCount: 0,
    },
  })

  await logAdminEvent({
    actorUserId: input.adminUserId,
    actorEmail: input.actorEmail,
    platformRole: input.platformRole,
    adminDeviceId: input.adminDeviceId ?? undefined,
    adminSessionId: input.adminSessionId,
    action: "impersonate_start",
    targetType: "user_profile",
    targetId: input.targetUserId,
    targetUserId: input.targetUserId,
    ipAddress: input.requestMeta.ipAddress,
    userAgent: input.requestMeta.userAgent,
    requestId: input.requestMeta.requestId,
    success: true,
    details: {
      targetDisplayName: input.targetDisplayName,
      notifyCustomer: input.notifyCustomer,
      notificationQueued: input.notifyCustomer,
    },
  })
}

type SupportImpersonationEndInput = {
  adminSessionId: string
  adminUserId: string
  actorEmail: string
  platformRole: PlatformRoleType
  targetUserId: string
  adminDeviceId?: string | null
  timedOut?: boolean
  requestMeta: RequestAuditMeta
}

type SupportImpersonationEndResult = {
  durationSeconds: number
  actionCount: number
  notifyCustomer: boolean
}

export async function endSupportImpersonation(
  input: SupportImpersonationEndInput,
): Promise<SupportImpersonationEndResult> {
  const currentSession = await prismaAdmin.adminSession.findUnique({
    where: { id: input.adminSessionId },
    select: {
      startedAt: true,
      notifyCustomer: true,
    },
  })

  const startedAt = currentSession?.startedAt ?? new Date()
  const notifyCustomer = currentSession?.notifyCustomer ?? false
  const durationSeconds = Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000))

  const actionCount = await prismaAdmin.adminAuditEvent.count({
    where: { adminSessionId: input.adminSessionId },
  })

  await prismaAdmin.adminSession.update({
    where: { id: input.adminSessionId },
    data: {
      impersonatedUserId: null,
      endedAt: new Date(),
      duration: durationSeconds,
      actionCount,
      notifyCustomer: false,
    },
  })

  await logAdminEvent({
    actorUserId: input.adminUserId,
    actorEmail: input.actorEmail,
    platformRole: input.platformRole,
    adminDeviceId: input.adminDeviceId ?? undefined,
    adminSessionId: input.adminSessionId,
    action: input.timedOut ? "impersonate_timeout" : "impersonate_end",
    targetType: "user_profile",
    targetId: input.targetUserId,
    targetUserId: input.targetUserId,
    ipAddress: input.requestMeta.ipAddress,
    userAgent: input.requestMeta.userAgent,
    requestId: input.requestMeta.requestId,
    success: true,
    details: {
      durationSeconds,
      actionCount,
      notifyCustomer,
      notificationQueued: notifyCustomer,
    },
  })

  return {
    durationSeconds,
    actionCount,
    notifyCustomer,
  }
}
