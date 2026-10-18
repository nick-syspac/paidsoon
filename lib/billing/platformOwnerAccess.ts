/** Internal facts only; never include these in tenant profile/client responses.
 * Tenant roles cannot SELECT platform_roles. This intentional read-only RLS
 * bypass is ONLY for platform-role facts, never tenant data or admin elevation.
 * Imports are deferred so pure billing computations need no database runtime.
 */
export async function readPlatformOwnerAccess(userId: string): Promise<boolean> {
  try {
    await import("server-only")
    const { prismaAdmin } = await import("@/lib/db/admin")
    const role = await prismaAdmin.platformRole.findUnique({
      where: { userId }, select: { role: true, status: true },
    })
    return role?.role === "platform_owner" && role.status === "active"
  } catch {
    return false
  }
}

/** One fresh requested-ID query, no cache or N+1; absence/errors default false. */
export async function readPlatformOwnerAccessForUsers(userIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return new Set()
  try {
    await import("server-only")
    const { prismaAdmin } = await import("@/lib/db/admin")
    const roles = await prismaAdmin.platformRole.findMany({
      where: { userId: { in: ids } }, select: { userId: true, role: true, status: true },
    })
    const requested = new Set(ids)
    return new Set(roles.filter((role) => requested.has(role.userId) &&
      role.role === "platform_owner" && role.status === "active").map((role) => role.userId))
  } catch {
    return new Set()
  }
}