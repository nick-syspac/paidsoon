/**
 * Admin authentication guard.
 *
 * Enforces three-layer security:
 *   Layer 1: valid Supabase auth session (via supabase.auth.getUser())
 *   Layer 2: active PlatformRole row for that user (via prismaAdmin)
 *   Layer 3: valid, non-expired AdminSession (via sessionToken cookie)
 *
 * Admin tables use prismaAdmin (bypasses RLS) — admin tables are isolated
 * from tenant clients by design (see D7 in design.md).
 */

import { createClient } from "@/lib/supabase/server"
import { prismaAdmin } from "@/lib/db/admin"
import { getActiveAdminSession } from "@/lib/admin/session"
import type { PlatformRole, AdminSession } from "@/lib/generated/prisma/client"
import type { PlatformRoleType } from "@/lib/generated/prisma/enums"
import { cookies } from "next/headers"

export const ADMIN_SESSION_COOKIE = "admin_session"

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type AdminGuardErrorCode =
  | "unauthenticated"       // No Supabase session
  | "no_platform_role"      // User has no PlatformRole row
  | "role_disabled"         // PlatformRole.status = disabled
  | "insufficient_role"     // Role does not meet minRole requirement
  | "elevation_required"    // No valid AdminSession cookie
  | "session_expired"       // AdminSession.expiresAt < now()
  | "session_revoked"       // AdminSession.revokedAt is set

export class AdminGuardError extends Error {
  constructor(
    public readonly code: AdminGuardErrorCode,
    message: string
  ) {
    super(message)
    this.name = "AdminGuardError"
  }
}

// ---------------------------------------------------------------------------
// Guard result
// ---------------------------------------------------------------------------

export interface AdminGuardContext {
  userId: string
  userEmail: string
  platformRole: PlatformRole
  adminSession: AdminSession
}

// ---------------------------------------------------------------------------
// Role hierarchy
// ---------------------------------------------------------------------------

const ROLE_ORDER: PlatformRoleType[] = ["platform_support", "platform_admin", "platform_owner"]

function roleRank(role: PlatformRoleType): number {
  return ROLE_ORDER.indexOf(role)
}

// ---------------------------------------------------------------------------
// Main guard
// ---------------------------------------------------------------------------

export interface RequireAdminElevationOpts {
  /** Minimum required role. Defaults to `platform_support` (any platform role). */
  minRole?: PlatformRoleType
}

/**
 * Verify all three admin guard layers. Returns the guard context on success.
 * Throws `AdminGuardError` on any guard failure.
 *
 * Use this in route handlers and server components for all `/admin` paths.
 */
export async function requireAdminElevation(
  opts: RequireAdminElevationOpts = {}
): Promise<AdminGuardContext> {
  const minRole: PlatformRoleType = opts.minRole ?? "platform_support"

  // Layer 1: Supabase auth
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new AdminGuardError("unauthenticated", "No valid Supabase session")
  }

  // Layer 2: PlatformRole
  const platformRole = await prismaAdmin.platformRole.findUnique({
    where: { userId: user.id },
  })

  if (!platformRole) {
    throw new AdminGuardError("no_platform_role", "User has no platform role")
  }

  if (platformRole.status === "disabled") {
    throw new AdminGuardError("role_disabled", "Platform role is disabled")
  }

  if (roleRank(platformRole.role) < roleRank(minRole)) {
    throw new AdminGuardError(
      "insufficient_role",
      `Role ${platformRole.role} does not meet minimum required role ${minRole}`
    )
  }

  // Layer 3: AdminSession
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? ""

  if (!sessionToken) {
    throw new AdminGuardError("elevation_required", "No admin session cookie")
  }

  const adminSession = await getActiveAdminSession(sessionToken)

  if (!adminSession) {
    // Distinguish between expired and non-existent/revoked for better error reporting
    const raw = await prismaAdmin.adminSession.findUnique({ where: { sessionToken } })
    if (raw?.revokedAt) {
      throw new AdminGuardError("session_revoked", "Admin session has been revoked")
    }
    if (raw?.expiresAt && raw.expiresAt < new Date()) {
      throw new AdminGuardError("session_expired", "Admin session has expired")
    }
    throw new AdminGuardError("elevation_required", "Admin session not found")
  }

  // Confirm the session belongs to this user
  if (adminSession.userId !== user.id) {
    throw new AdminGuardError("elevation_required", "Admin session user mismatch")
  }

  return {
    userId: user.id,
    userEmail: user.email ?? "",
    platformRole,
    adminSession,
  }
}

/**
 * Verify layers 1 and 2 only (no AdminSession required).
 * Used for the `/admin/verify` page where the user is obtaining an elevated session.
 */
export async function requirePlatformRole(
  opts: RequireAdminElevationOpts = {}
): Promise<Omit<AdminGuardContext, "adminSession">> {
  const minRole: PlatformRoleType = opts.minRole ?? "platform_support"

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new AdminGuardError("unauthenticated", "No valid Supabase session")
  }

  const platformRole = await prismaAdmin.platformRole.findUnique({
    where: { userId: user.id },
  })

  if (!platformRole) {
    throw new AdminGuardError("no_platform_role", "User has no platform role")
  }

  if (platformRole.status === "disabled") {
    throw new AdminGuardError("role_disabled", "Platform role is disabled")
  }

  if (roleRank(platformRole.role) < roleRank(minRole)) {
    throw new AdminGuardError(
      "insufficient_role",
      `Role ${platformRole.role} does not meet minimum required role ${minRole}`
    )
  }

  return {
    userId: user.id,
    userEmail: user.email ?? "",
    platformRole,
  }
}
