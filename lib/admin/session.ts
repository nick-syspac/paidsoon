/**
 * Admin session helpers.
 *
 * All DB operations use `prismaAdmin` (bypasses RLS) — admin tables are
 * isolated from tenant clients.
 */

import { prismaAdmin } from "@/lib/db/admin"
import type { AdminSession } from "@/lib/generated/prisma/client"

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
