/**
 * Admin audit logging.
 *
 * Every admin lifecycle event MUST be written via this helper.
 * Uses `prismaAdmin` (bypasses RLS) — admin tables are isolated from tenant clients.
 */

import { prismaAdmin } from "@/lib/db/admin"
import { AdminAuditAction, PlatformRoleType } from "@/lib/generated/prisma/enums"

export interface AdminAuditEventInput {
  actorUserId: string
  actorEmail: string
  platformRole: PlatformRoleType
  adminDeviceId?: string
  adminDeviceFingerprint?: string
  action: AdminAuditAction
  targetType?: string
  targetId?: string
  tenantId?: string
  ipAddress: string
  userAgent: string
  requestId: string
  success: boolean
  reason?: string
}

/**
 * Write an `AdminAuditEvent` row. Fire-and-forget safe — errors are logged
 * to stderr but not re-thrown so a logging failure never blocks the caller.
 */
export async function logAdminEvent(event: AdminAuditEventInput): Promise<void> {
  try {
    await prismaAdmin.adminAuditEvent.create({
      data: {
        actorUserId: event.actorUserId,
        actorEmail: event.actorEmail,
        platformRole: event.platformRole,
        adminDeviceId: event.adminDeviceId ?? null,
        adminDeviceFingerprint: event.adminDeviceFingerprint ?? null,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        tenantId: event.tenantId ?? null,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        requestId: event.requestId,
        success: event.success,
        reason: event.reason ?? null,
      },
    })
  } catch (err) {
    console.error("[logAdminEvent] Failed to write audit event:", err)
  }
}
