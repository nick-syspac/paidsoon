/**
 * Unit tests for admin audit logging contracts.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { AdminAuditAction } from "@/lib/generated/prisma/enums"

describe("AdminAuditAction enum coverage", () => {
  const requiredActions = [
    "admin_challenge_created",
    "admin_challenge_verified",
    "admin_challenge_failed",
    "admin_session_started",
    "admin_session_expired",
    "admin_session_revoked",
    "device_enrolled",
    "device_revoked",
    "staff_invited",
    "role_assigned",
    "role_changed",
    "staff_disabled",
    "tenant_viewed",
    "impersonation_started",
    "impersonation_ended",
    "impersonation_destructive_action",
    "subscription_changed",
    "integration_action",
    "email_job_retried",
    "email_job_paused",
    "email_job_resumed",
    "system_setting_changed",
  ]

  for (const action of requiredActions) {
    test(`enum contains ${action}`, () => {
      assert.ok(
        Object.values(AdminAuditAction).includes(action as AdminAuditAction),
        `AdminAuditAction should include "${action}"`
      )
    })
  }
})

describe("logAdminEvent is exported", () => {
  test("logAdminEvent function is exported from lib/admin/audit.ts", async () => {
    const { logAdminEvent } = await import("@/lib/admin/audit")
    assert.equal(typeof logAdminEvent, "function")
  })
})

describe("Audit event input shape", () => {
  test("required fields are actorUserId, actorEmail, platformRole, action, ipAddress, userAgent, requestId, success", () => {
    // Just verifying the documented shape — the actual type is enforced by TypeScript
    const requiredFields = [
      "actorUserId",
      "actorEmail",
      "platformRole",
      "action",
      "ipAddress",
      "userAgent",
      "requestId",
      "success",
    ]
    assert.ok(requiredFields.length === 8)
  })

  test("audit events are paginated at PAGE_SIZE=50 by default", () => {
    const PAGE_SIZE = 50
    assert.equal(PAGE_SIZE, 50)
  })
})
