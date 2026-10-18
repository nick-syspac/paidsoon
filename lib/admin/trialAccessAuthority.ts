import "server-only"
import { requireAdminElevation, AdminGuardError, type AdminGuardContext } from "@/lib/admin/guard"
import { assertTrialAccessOwner } from "@/lib/billing/trialAccessPreview"
import { prismaAdmin } from "@/lib/db/admin"

/** Real Supabase identity + matching admin_session cookie, never support_view or
 * support_session URL identity. Impersonation lives on that SAME AdminSession in
 * both legacy and support-console modes; neither mode conveys owner authority. */
export async function requireTrialAccessOwner(): Promise<AdminGuardContext> {
  const owner = await requireAdminElevation({ minRole: "platform_owner" })
  assertTrialAccessOwner(owner, new Date())
  if (owner.adminSession.impersonatedTenantId || owner.adminSession.impersonatedUserId) {
    throw new AdminGuardError("insufficient_role", "Exit impersonation before managing trial access")
  }
  // Narrow privileged admin-auth read, BEFORE all tenant/journal/provider reads.
  // Device revocation normally revokes sessions too; also verify it directly.
  const device = await prismaAdmin.adminDevice.findUnique({ where: { id: owner.adminSession.adminDeviceId },
    select: { adminUserId: true, status: true, revokedAt: true } })
  if (!device || device.adminUserId !== owner.userId || device.status !== "active" || device.revokedAt !== null) {
    throw new AdminGuardError("session_revoked", "Admin device is not active")
  }
  assertTrialAccessOwner(owner, new Date())
  return owner
}