import { before, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import type { Prisma } from "@/lib/generated/prisma/client"
import type {
  AdminAuditEventInput, AdminAuditTransaction, TrialAuditEventInput, TrialAuditSnapshot,
} from "@/lib/admin/audit"

type AuditRow = Prisma.AdminAuditEventUncheckedCreateInput
type Attempt = Extract<TrialAuditEventInput, { subtype: "trial_attempt" }>
let audit: typeof import("@/lib/admin/audit")
const legacyRows: AuditRow[] = []
let legacyFailure: Error | undefined

before(async () => {
  // Mock before importing the real helper: no DB construction or connection.
  mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
    adminAuditEvent: { create: async ({ data }: { data: AuditRow }) => {
      if (legacyFailure) throw legacyFailure
      legacyRows.push(data)
    } },
  } } })
  audit = await import("@/lib/admin/audit")
})

const snapshot: TrialAuditSnapshot = {
  source: "onboarding_trial", effectivePlan: "essentials",
  effectiveAccessExpiresAt: new Date("2026-10-20T00:00:00Z"),
  effectiveTrialExpiresAt: new Date("2026-10-20T00:00:00Z"),
  effectiveExpirySource: "onboarding_trial", stripeTrialEndsAt: null,
  grantPlan: null, grantExpiresAt: null, billingPlan: "essentials",
  billingStatus: "trialing", stripeSubscriptionId: null, stripeCustomerId: null,
  billingAccessVersion: 4,
}
const after: TrialAuditSnapshot = {
  ...snapshot, source: "admin_grant", effectivePlan: "business_control",
  effectiveAccessExpiresAt: new Date("2026-10-27T00:00:00Z"),
  effectiveTrialExpiresAt: new Date("2026-10-27T00:00:00Z"),
  effectiveExpirySource: "admin_grant", grantPlan: "business_control",
  grantExpiresAt: new Date("2026-10-27T00:00:00Z"), billingAccessVersion: 5,
}
function attempt(): Attempt {
  return {
    subtype: "trial_attempt", operationId: "c3b3d080-af3e-4ea2-a539-41f103328221",
    operationAction: "extend_or_grant", source: "admin_grant",
    occurredAt: new Date("2026-10-16T10:00:00+10:00"),
    actor: {
      actorUserId: "owner-1", actorEmail: "owner@example.test", platformRole: "platform_owner",
      adminSessionId: "session-1", adminDeviceId: "device-1",
      ipAddress: "127.0.0.1", userAgent: "node-test", requestId: "request-1",
    },
    tenantId: "tenant-1", reason: "  Approved evaluation extension  ",
    previous: structuredClone(snapshot), after: structuredClone(after), result: { status: "pending" },
  }
}
function writer(rows: AuditRow[]): AdminAuditTransaction {
  return { adminAuditEvent: { create: async ({ data }) => { rows.push(structuredClone(data)) } } }
}
function metadata(row: AuditRow): Record<string, unknown> {
  assert.ok(row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata))
  return row.metadata as Record<string, unknown>
}

describe("mandatory owner trial audit", () => {
  test("narrow transaction is Prisma-compatible and exposes create only", () => {
    const prismaCompatible: Prisma.TransactionClient extends AdminAuditTransaction ? true : false = true
    const createOnly: keyof AdminAuditTransaction["adminAuditEvent"] extends "create" ? true : false = true
    const auditOnly: keyof AdminAuditTransaction extends "adminAuditEvent" ? true : false = true
    assert.deepStrictEqual([prismaCompatible, createOnly, auditOnly], [true, true, true])
  })

  test("maps mandatory owner identity, reason, target, plans and UTC snapshots onto existing audit columns", async () => {
    const rows: AuditRow[] = []
    await audit.writeTrialAuditEvent(writer(rows), attempt())
    assert.strictEqual(rows.length, 1)
    const row = rows[0]
    assert.strictEqual(row.action, "admin_tenant_action")
    assert.strictEqual(row.actorUserId, "owner-1")
    assert.strictEqual(row.actorEmail, "owner@example.test")
    assert.strictEqual(row.platformRole, "platform_owner")
    assert.strictEqual(row.adminSessionId, "session-1")
    assert.strictEqual(row.adminDeviceId, "device-1")
    assert.strictEqual(row.tenantId, "tenant-1")
    assert.strictEqual(row.targetId, "tenant-1")
    assert.strictEqual(row.targetUserId, "tenant-1")
    assert.strictEqual(row.targetType, "user_profile")
    assert.strictEqual(row.resourceId, attempt().operationId)
    assert.strictEqual(row.reason, "Approved evaluation extension")
    assert.strictEqual(row.success, true)
    assert.deepStrictEqual(metadata(row), {
      operationId: attempt().operationId, operationAction: "extend_or_grant", source: "admin_grant",
      occurredAt: "2026-10-16T00:00:00.000Z", action: "trial_attempt", result: { status: "pending" },
      previous: { ...snapshot, effectiveAccessExpiresAt: "2026-10-20T00:00:00.000Z", effectiveTrialExpiresAt: "2026-10-20T00:00:00.000Z" },
      after: { ...after, effectiveAccessExpiresAt: "2026-10-27T00:00:00.000Z", effectiveTrialExpiresAt: "2026-10-27T00:00:00.000Z", grantExpiresAt: "2026-10-27T00:00:00.000Z" },
    })
  })

  test("each attempt, result, recovery and notification appends without rewriting earlier failure or reason", async () => {
    const rows: AuditRow[] = []
    const tx = writer(rows)
    const failure = { code: "provider_outcome_unknown", stage: "provider", retryable: true } as const
    await audit.writeTrialAuditEvent(tx, attempt())
    await audit.writeTrialAuditEvent(tx, { ...attempt(), subtype: "trial_result", result: { status: "reconciliation_required", failure } })
    const original = structuredClone(rows)
    await audit.writeTrialAuditEvent(tx, attempt())
    await audit.writeTrialAuditEvent(tx, { ...attempt(), subtype: "trial_recovery", originalSessionId: "session-1", recoveringSessionId: "session-1", result: { status: "pending" } })
    await audit.writeTrialAuditEvent(tx, { ...attempt(), subtype: "trial_recovery", originalSessionId: "session-1", recoveringSessionId: "session-1", result: { status: "succeeded" } })
    await audit.writeTrialAuditEvent(tx, { ...attempt(), subtype: "trial_notification", result: { status: "failed", failure: { code: "notification_failed", stage: "notification", retryable: true } } })
    await audit.writeTrialAuditEvent(tx, { ...attempt(), subtype: "trial_notification", result: { status: "sent" } })
    assert.deepStrictEqual(rows.slice(0, 2), original)
    assert.deepStrictEqual(rows.map((row) => metadata(row).action), [
      "trial_attempt", "trial_result", "trial_attempt", "trial_recovery", "trial_recovery", "trial_notification", "trial_notification",
    ])
    assert.deepStrictEqual(rows.map((row) => row.success), [true, false, true, false, true, false, true])
    assert.ok(rows.every((row) => row.reason === "Approved evaluation extension" && row.resourceId === attempt().operationId))
  })

  test("keeps Stripe billing and grant fields separate, including revocation and remaining paid access", async () => {
    const rows: AuditRow[] = []
    const stripeSnapshot: TrialAuditSnapshot = {
      ...snapshot, source: "stripe_trial", stripeSubscriptionId: "sub_trial1", stripeCustomerId: "cus_tenant1",
      stripeTrialEndsAt: new Date("2026-10-20T00:00:00Z"), billingPlan: "small_business",
      effectivePlan: "small_business", effectiveExpirySource: "stripe_trial",
    }
    await audit.writeTrialAuditEvent(writer(rows), {
      ...attempt(), source: "stripe_trial", previous: stripeSnapshot,
      after: { ...stripeSnapshot, stripeTrialEndsAt: new Date("2026-10-27T00:00:00Z") },
    })
    await audit.writeTrialAuditEvent(writer(rows), {
      ...attempt(), subtype: "trial_result", operationAction: "revoke_grant", result: { status: "succeeded" },
      after: { ...after, source: "paid", effectivePlan: "small_business", effectiveAccessExpiresAt: null, grantPlan: null, grantExpiresAt: null },
    })
    assert.strictEqual((metadata(rows[0]).previous as Record<string, unknown>).stripeSubscriptionId, "sub_trial1")
    assert.strictEqual(metadata(rows[1]).operationAction, "revoke_grant")
    assert.strictEqual((metadata(rows[1]).after as Record<string, unknown>).source, "paid")
  })

  test("strips extra contact, secrets, SDK payload and provider-error fields rather than serializing them", async () => {
    const rows: AuditRow[] = []
    const input = {
      ...attempt(), subtype: "trial_result" as const,
      metadata: { secret: "top-secret" },
      previous: { ...snapshot, email: "tenant@example.test", token: "top-secret" },
      after: { ...after, rawProviderResponse: { secret: "top-secret" } },
      result: { status: "failed" as const, providerError: new Error("top-secret"), failure: {
        code: "provider_rejected" as const, stage: "provider" as const, retryable: false,
        message: "tenant@example.test top-secret", stack: "top-secret", raw: { secret: "top-secret" },
      } },
    }
    await audit.writeTrialAuditEvent(writer(rows), input)
    const json = JSON.stringify(metadata(rows[0]))
    assert.ok(!json.includes("top-secret") && !json.includes("@") && !json.includes("providerError"))
    assert.deepStrictEqual((metadata(rows[0]).result as Record<string, unknown>).failure, {
      code: "provider_rejected", stage: "provider", retryable: false,
    })
    assert.strictEqual(rows[0].details, undefined)
  })

  test("rejects invalid reason, owner/session, UUID, dates and arbitrary failure codes before create", async () => {
    const invalid = [
      { ...attempt(), reason: "   " }, { ...attempt(), reason: "x".repeat(1001) },
      { ...attempt(), actor: { ...attempt().actor, adminSessionId: "" } },
      { ...attempt(), actor: { ...attempt().actor, platformRole: "platform_support" } },
      { ...attempt(), operationId: "not-a-uuid" }, { ...attempt(), occurredAt: new Date(NaN) },
      { ...attempt(), previous: { ...snapshot, grantPlan: "accountant_partner" } },
      { ...attempt(), subtype: "trial_result", result: { status: "failed", failure: { code: "secret-provider-message", stage: "provider", retryable: false } } },
    ]
    const rows: AuditRow[] = []
    for (const input of invalid) {
      // Exercise the runtime boundary for structurally invalid callers too.
      await assert.rejects(audit.writeTrialAuditEvent(writer(rows), input as TrialAuditEventInput))
    }
    assert.deepStrictEqual(rows, [])
  })

  test("propagates the original create failure without invoking global best-effort logging", async () => {
    const failure = new Error("audit unavailable")
    const tx: AdminAuditTransaction = { adminAuditEvent: { create: async () => { throw failure } } }
    await assert.rejects(audit.writeTrialAuditEvent(tx, attempt()), (error) => error === failure)
    assert.deepStrictEqual(legacyRows, [])
  })
})

// Transactional service seam, not a saga: real acceptance primitive orchestrates
// audit + DB callback; a separate injected provider is called only after commit.
// Staged state is discarded on callback/commit errors, like Prisma $transaction.
function serviceSeam(options: {
  auditFails?: boolean; callbackFails?: boolean; commitFails?: boolean
  localGrant?: boolean; resultAuditFails?: boolean
} = {}) {
  const initialState = {
    audits: [] as AuditRow[],
    operation: { id: attempt().operationId, userId: "tenant-1", status: "previewed" },
    profile: { userId: "tenant-1", pendingTrialOperationId: null as string | null, billingAccessVersion: 4 },
    grant: null as Prisma.TenantTrialGrantUncheckedCreateInput | null,
  }
  let durable = structuredClone(initialState)
  const trace: string[] = []
  let providerCalls = 0
  const failure = new Error("injected persistence failure")
  type AcceptanceTx = AdminAuditTransaction & {
    tenantTrialOperation: {
      update(args: { where: { id: string }; data: { status: "pending" } }): Promise<void>
    }
    userProfile: {
      update(args: {
        where: { userId: string }
        data: { pendingTrialOperationId: string | null; billingAccessVersion: { increment: number } }
      }): Promise<void>
    }
    tenantTrialGrant: {
      create(args: { data: Prisma.TenantTrialGrantUncheckedCreateInput }): Promise<void>
    }
  }
  // Minimal upcoming owner-service boundary: persist the journal acceptance and
  // profile reservation/version in the supplied transaction, then dispatch the
  // provider outside it. No eligibility, locking, preview or saga policy here.
  const accept = mock.fn(async (tx: AcceptanceTx) => {
    await tx.tenantTrialOperation.update({ where: { id: attempt().operationId }, data: { status: "pending" } })
    if (options.localGrant) {
      await tx.tenantTrialGrant.create({ data: {
        userId: "tenant-1", plan: "business_control", expiresAt: new Date("2026-10-27T00:00:00Z"),
        startsAt: new Date("2026-10-16T00:00:00Z"),
        creatorOperationId: attempt().operationId, lastOperationId: attempt().operationId,
      } })
    }
    await tx.userProfile.update({
      where: { userId: "tenant-1" },
      data: { pendingTrialOperationId: options.localGrant ? null : attempt().operationId, billingAccessVersion: { increment: 1 } },
    })
    if (options.callbackFails) throw failure
    if (options.localGrant) {
      await audit.writeTrialAuditEvent(tx, { ...attempt(), subtype: "trial_result", result: { status: "succeeded" } })
    }
    return { operationId: attempt().operationId }
  })
  const transaction = async <T>(work: (tx: AcceptanceTx) => Promise<T>): Promise<T> => {
    const staged = structuredClone(durable)
    const tx: AcceptanceTx = {
      adminAuditEvent: { create: async ({ data }: { data: AuditRow }) => {
        trace.push("audit")
        if (options.auditFails || (options.resultAuditFails && staged.audits.length > 0)) throw failure
        staged.audits.push(structuredClone(data))
      } },
      tenantTrialOperation: { update: async ({ where, data }) => {
        assert.strictEqual(where.id, staged.operation.id)
        trace.push("journal")
        staged.operation.status = data.status
      } },
      userProfile: { update: async ({ where, data }) => {
        assert.strictEqual(where.userId, staged.profile.userId)
        trace.push("reservation")
        staged.profile.pendingTrialOperationId = data.pendingTrialOperationId
        staged.profile.billingAccessVersion += data.billingAccessVersion.increment
      } },
      tenantTrialGrant: { create: async ({ data }) => {
        trace.push("grant")
        staged.grant = structuredClone(data)
      } },
    }
    const result = await work(tx)
    if (options.commitFails) throw failure
    durable = staged
    trace.push("commit")
    return result
  }
  return {
    run: async () => {
      const accepted = await audit.withTrialAttemptAudit(transaction, attempt(), accept)
      if (!options.localGrant) {
        trace.push("provider")
        providerCalls++
      }
      return accepted
    },
    state: () => durable, initialState, trace, accept, failure, providerCalls: () => providerCalls,
  }
}

describe("audit-first owner acceptance transaction seam", () => {
  test("initial audit failure prevents the acceptance callback, access writes and post-commit provider dispatch", async () => {
    const service = serviceSeam({ auditFails: true })
    await assert.rejects(service.run(), (error) => error === service.failure)
    assert.strictEqual(service.accept.mock.callCount(), 0)
    assert.deepStrictEqual(service.state(), service.initialState)
    assert.strictEqual(service.providerCalls(), 0)
    assert.deepStrictEqual(service.trace, ["audit"])
  })

  test("callback failure rolls back the audit and staged acceptance/access changes and prevents dispatch", async () => {
    const service = serviceSeam({ callbackFails: true })
    await assert.rejects(service.run(), (error) => error === service.failure)
    assert.strictEqual(service.accept.mock.callCount(), 1)
    assert.deepStrictEqual(service.trace, ["audit", "journal", "reservation"])
    assert.deepStrictEqual(service.state(), service.initialState)
    assert.strictEqual(service.providerCalls(), 0)
  })

  test("commit failure cannot dispatch despite successful callback", async () => {
    const service = serviceSeam({ commitFails: true })
    await assert.rejects(service.run(), (error) => error === service.failure)
    assert.deepStrictEqual(service.state(), service.initialState)
    assert.strictEqual(service.providerCalls(), 0)
    assert.deepStrictEqual(service.trace, ["audit", "journal", "reservation"])
  })

  test("successful acceptance commits audit and access/version together before provider dispatch", async () => {
    const service = serviceSeam()
    assert.deepStrictEqual(await service.run(), { operationId: attempt().operationId })
    assert.strictEqual(service.state().audits.length, 1)
    assert.strictEqual(service.state().operation.status, "pending")
    assert.strictEqual(service.state().profile.pendingTrialOperationId, attempt().operationId)
    assert.strictEqual(service.state().profile.billingAccessVersion, 5)
    assert.strictEqual(service.providerCalls(), 1)
    assert.deepStrictEqual(service.trace, ["audit", "journal", "reservation", "commit", "provider"])
  })

  test("initial audit failure prevents the local grant callback as well as Stripe acceptance", async () => {
    const service = serviceSeam({ localGrant: true, auditFails: true })
    await assert.rejects(service.run(), (error) => error === service.failure)
    assert.strictEqual(service.accept.mock.callCount(), 0)
    assert.deepStrictEqual(service.trace, ["audit"])
    assert.deepStrictEqual(service.state(), service.initialState)
    assert.strictEqual(service.providerCalls(), 0)
  })

  test("mandatory result-audit failure rolls back staged grant, version and initial attempt", async () => {
    const service = serviceSeam({ localGrant: true, resultAuditFails: true })
    await assert.rejects(service.run(), (error) => error === service.failure)
    assert.deepStrictEqual(service.trace, ["audit", "journal", "grant", "reservation", "audit"])
    assert.deepStrictEqual(service.state(), service.initialState)
    assert.strictEqual(service.providerCalls(), 0)
  })

  test("local callback commits grant/version with both attempt and result audits, without provider dispatch", async () => {
    const service = serviceSeam({ localGrant: true })
    await service.run()
    assert.strictEqual(service.state().grant?.plan, "business_control")
    assert.strictEqual(service.state().profile.billingAccessVersion, 5)
    assert.deepStrictEqual(service.state().audits.map((row) => metadata(row).action), ["trial_attempt", "trial_result"])
    assert.strictEqual(service.providerCalls(), 0)
    assert.deepStrictEqual(service.trace, ["audit", "journal", "grant", "reservation", "audit", "commit"])
  })
})

describe("legacy best-effort admin audit", () => {
  const legacy: AdminAuditEventInput = {
    actorUserId: "support-1", actorEmail: "support@example.test", platformRole: "platform_support",
    action: "tenant_viewed", ipAddress: "127.0.0.1", userAgent: "node-test", requestId: "legacy-request",
    success: true, details: { legacy: true }, metadata: { unchanged: true },
  }

  test("preserves the existing event mapping and optional null/JSON fields", async () => {
    await audit.logAdminEvent(legacy)
    assert.deepStrictEqual(legacyRows[0], {
      ...legacy, adminDeviceId: null, adminDeviceFingerprint: null, adminSessionId: null,
      targetType: null, targetId: null, targetUserId: null, resourceId: null, tenantId: null, reason: null,
    })
  })

  test("still catches/logs persistence failure rather than rejecting unrelated callers", async () => {
    legacyFailure = new Error("legacy storage unavailable")
    const logger = mock.method(console, "error", () => {})
    try {
      await assert.doesNotReject(audit.logAdminEvent(legacy))
      assert.strictEqual(logger.mock.callCount(), 1)
      assert.deepStrictEqual(logger.mock.calls[0].arguments, ["[logAdminEvent] Failed to write audit event:", legacyFailure])
    } finally {
      legacyFailure = undefined
      logger.mock.restore()
    }
  })
})