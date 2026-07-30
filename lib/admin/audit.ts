/**
 * Admin audit logging.
 *
 * Every admin lifecycle event MUST be written via this helper.
 * Uses `prismaAdmin` (bypasses RLS) — admin tables are isolated from tenant clients.
 */

import { prismaAdmin } from "@/lib/db/admin"
import { Prisma } from "@/lib/generated/prisma/client"
import { AdminAuditAction, PlatformRoleType } from "@/lib/generated/prisma/enums"

export interface AdminAuditEventInput {
  actorUserId: string
  actorEmail: string
  platformRole: PlatformRoleType
  adminDeviceId?: string
  adminDeviceFingerprint?: string
  adminSessionId?: string // link to impersonation session (support console)
  action: AdminAuditAction
  targetType?: string
  targetId?: string
  targetUserId?: string // customer being acted upon (support console)
  resourceId?: string // specific resource being modified (support console)
  tenantId?: string
  ipAddress: string
  userAgent: string
  requestId: string
  success: boolean
  reason?: string
  metadata?: Record<string, unknown>
  details?: Record<string, unknown> // context-specific data (support console)
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
        adminSessionId: event.adminSessionId ?? null,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        targetUserId: event.targetUserId ?? null,
        resourceId: event.resourceId ?? null,
        tenantId: event.tenantId ?? null,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        requestId: event.requestId,
        success: event.success,
        reason: event.reason ?? null,
        metadata: event.metadata != null ? (event.metadata as Prisma.InputJsonValue) : undefined,
        details: event.details != null ? (event.details as Prisma.InputJsonValue) : undefined,
      },
    })
  } catch (err) {
    console.error("[logAdminEvent] Failed to write audit event:", err)
  }
}
