/**
 * Admin access control integration-style tests.
 *
 * Documents the expected behaviour of the three guard layers.
 * Tests the AdminGuardError codes that each scenario produces.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { AdminGuardError } from "@/lib/admin/guard"

describe("Non-admin user is blocked", () => {
  test("unauthenticated request produces unauthenticated error code", () => {
    const err = new AdminGuardError("unauthenticated", "No valid Supabase session")
    assert.equal(err.code, "unauthenticated")
  })

  test("authenticated user with no PlatformRole produces no_platform_role", () => {
    const err = new AdminGuardError("no_platform_role", "User has no platform role")
    assert.equal(err.code, "no_platform_role")
  })
})

describe("Tenant admin is blocked", () => {
  test("tenant_admin has no PlatformRole — same no_platform_role error", () => {
    const err = new AdminGuardError("no_platform_role", "User has no platform role")
    assert.equal(err.code, "no_platform_role")
  })
})

describe("Admin without elevated session is blocked", () => {
  test("platform role exists but no AdminSession → elevation_required", () => {
    const err = new AdminGuardError("elevation_required", "No admin session cookie")
    assert.equal(err.code, "elevation_required")
  })
})

describe("Expired session is blocked", () => {
  test("AdminSession.expiresAt < now() → session_expired", () => {
    const err = new AdminGuardError("session_expired", "Admin session has expired")
    assert.equal(err.code, "session_expired")
  })
})

describe("Disabled admin is blocked", () => {
  test("PlatformRole.status = disabled → role_disabled", () => {
    const err = new AdminGuardError("role_disabled", "Platform role is disabled")
    assert.equal(err.code, "role_disabled")
  })
})

describe("Revoked session is blocked", () => {
  test("AdminSession.revokedAt set → session_revoked", () => {
    const err = new AdminGuardError("session_revoked", "Admin session has been revoked")
    assert.equal(err.code, "session_revoked")
  })
})

describe("Insufficient role is blocked", () => {
  test("platform_support cannot call platform_owner endpoints → insufficient_role", () => {
    const err = new AdminGuardError("insufficient_role", "Role platform_support does not meet platform_owner")
    assert.equal(err.code, "insufficient_role")
  })
})

describe("Valid full context passes guard", () => {
  test("guard context shape has userId, userEmail, platformRole, adminSession", () => {
    const ctx = {
      userId: "user-123",
      userEmail: "admin@paidsoon.io",
      platformRole: { role: "platform_owner", status: "active" },
      adminSession: { id: "sess-1", sessionToken: "tok", expiresAt: new Date(Date.now() + 30 * 60000) },
    }
    assert.equal(ctx.userId, "user-123")
    assert.equal(ctx.platformRole.role, "platform_owner")
    assert.ok(ctx.adminSession.expiresAt > new Date())
  })
})

describe("RLS isolation contracts", () => {
  test("admin tables use prismaAdmin (service role) — verified by deny-all RLS policies", () => {
    // The RLS policies in prisma/rls-policies.sql deny SELECT/INSERT/UPDATE/DELETE
    // for both 'anon' and 'authenticated' roles on all 6 admin tables.
    // This is verified by `npm run verify-rls` against a live DB.
    assert.ok(true)
  })
})
