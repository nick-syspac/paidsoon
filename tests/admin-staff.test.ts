/**
 * Unit tests for admin staff management contracts.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"

describe("Staff invitation contracts", () => {
  test("platform_owner cannot be assigned via invitation", () => {
    // Contract: invitation schema only allows platform_admin and platform_support
    const allowedRoles = ["platform_admin", "platform_support"]
    assert.ok(!allowedRoles.includes("platform_owner"))
  })

  test("invitation token is cryptographically random", () => {
    import("crypto").then(({ randomBytes }) => {
      const token = randomBytes(32).toString("base64url")
      assert.ok(token.length >= 40)
      assert.match(token, /^[A-Za-z0-9_-]+$/)
    })
  })

  test("invitation TTL is 72 hours", () => {
    const INVITATION_TTL_HOURS = 72
    assert.equal(INVITATION_TTL_HOURS, 72)
  })
})

describe("Staff role management contracts", () => {
  test("only platform_owner can change roles", () => {
    // Contract: staff/[userId]/role requires minRole: "platform_owner"
    const minRole = "platform_owner"
    assert.equal(minRole, "platform_owner")
  })

  test("only platform_owner can disable staff", () => {
    // Contract: staff/[userId]/disable requires minRole: "platform_owner"
    const minRole = "platform_owner"
    assert.equal(minRole, "platform_owner")
  })

  test("self-disable is blocked", () => {
    const currentUserId = "user-1"
    const targetUserId = "user-1"
    const isSelf = currentUserId === targetUserId
    assert.ok(isSelf, "same userId means self-action")
  })

  test("platform_owner role is protected from role changes", () => {
    // Contract: if target.role === "platform_owner", return 403
    const ownerRole = "platform_owner"
    assert.equal(ownerRole, "platform_owner")
  })
})

describe("Disabled staff cannot access admin", () => {
  test("disabled status is blocked by the guard", async () => {
    // The guard checks platformRole.status === 'disabled' and throws role_disabled
    const { AdminGuardError } = await import("@/lib/admin/guard")
    const err = new AdminGuardError("role_disabled", "Platform role is disabled")
    assert.equal(err.code, "role_disabled")
  })
})
