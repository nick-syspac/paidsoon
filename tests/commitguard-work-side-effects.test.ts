import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import type { PrismaTx } from "@/lib/db/withUserContext"

let boundary: typeof import("@/lib/commitguard/workSideEffects")
let trace: string[], role: string, committed: string[], pending: string[]
let clock: Date, expires: Date, revoked: boolean, revision: number, owner: string, fence: number
let workKind: string, workRevision: number, enabled: boolean, detectionEnabled: boolean
let failRestore: boolean
const input = { userId: "tenant", workItemId: "work", kind: "evaluate" as const,
  leaseOwner: "worker", fence: 4, expectedCalculationRevision: 7 }
const auth = () => assert.equal(role, "authenticated")

before(async () => {
  await mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async (userId: string, callback: (tx: PrismaTx) => Promise<unknown>) => {
      assert.equal(userId, input.userId)
      role = "authenticated"
      const tx = {
        $executeRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
          const text = sql.join("?")
          if (text.includes("pg_advisory_xact_lock")) {
            auth(); assert.deepEqual(values, ["commitguard:tenant"]); trace.push("tenant-lock")
          } else if (text === "SET LOCAL ROLE NONE") {
            role = "executor"; trace.push("executor")
          } else if (text === "SET LOCAL ROLE authenticated") {
            if (failRestore && role === "executor") throw new Error("restore failed")
            role = "authenticated"; trace.push("authenticated")
          } else assert.fail(text)
        },
        $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
          const text = sql.join("?")
          if (text.includes("FOR UPDATE")) {
            assert.equal(role, "executor"); assert.equal(trace[0], "tenant-lock")
            assert.deepEqual(values, ["work", "tenant", input.kind]); trace.push("work-lock")
            return workKind === input.kind ? [{ id: "work" }] : []
          }
          if (text.includes("UPDATE public.commit_guard_work_items")) {
            assert.equal(role, "executor"); trace.push("fence")
            assert.match(text, /lease_expires_at > \(clock_timestamp\(\) AT TIME ZONE 'UTC'\)/)
            assert.doesNotMatch(text, /CURRENT_TIMESTAMP|now\(\)/)
            assert.match(text, /ELSE \(clock_timestamp\(\) AT TIME ZONE 'UTC'\) \+ interval '60 seconds' END/)
            assert.equal(values.includes("worker"), true)
            const valid = expires > clock && expires.getTime() <= clock.getTime() + 60_000 &&
              owner === "worker" && fence === 4 && revision === 7 && workRevision === 7
            if (valid && !values[0]) expires = new Date(clock.getTime() + 60_000)
            return valid ? [{ id: "work" }] : []
          }
          assert.equal(text, "SELECT clock_timestamp() AS now"); auth(); return [{ now: clock }]
        },
        platformRole: { findUnique: async () => { assert.equal(role, "executor"); return null } },
        userProfile: { findUnique: async () => { auth(); trace.push("access"); return {
          subscriptionStatus: "cancelled", subscriptionTier: "business_pro", stripeSubscriptionId: null,
          trialEndsAt: null, billingAccessVersion: 1,
        } } },
        tenantTrialGrant: { findUnique: async () => { auth(); return { plan: "business_pro",
          startsAt: new Date("2026-10-01"), expiresAt: new Date("2026-10-20"), revokedAt: revoked ? clock : null } } },
        tenantBillingRisk: { findMany: async () => { auth(); return [] } },
        commitGuardSetting: { findUnique: async () => { auth(); return { enabled,
          detectRecurringCommitments: detectionEnabled, calculationRevision: revision } } },
        commitGuardEvaluationState: { upsert: async ({ create, update }: { create: object; update: object }) => {
          assert.equal(role, "executor"); trace.push("state"); assert.deepEqual(create, { ...update, userId: "tenant" }); pending.push("state")
        } },
      }
      try {
        const result = await callback(tx as unknown as PrismaTx)
        auth(); committed.push(...pending); return result
      } finally { pending = []; role = "session" }
    },
  } })
  boundary = await import("@/lib/commitguard/workSideEffects")
})
beforeEach(() => {
  trace = []; pending = []; committed = []; role = "session"
  clock = new Date("2026-10-19T12:00:00Z"); expires = new Date(clock.getTime() + 60_000)
  revoked = false; revision = 7; workRevision = 7; owner = "worker"; fence = 4; workKind = "evaluate"
  enabled = true; detectionEnabled = true; failRestore = false
})
test("6.1 real helper orders locks, scopes role switches, stages state and returns callback result", async () => {
  const result = await boundary.withCommitGuardWorkSideEffects(input, async (_tx, effects) => {
    auth(); assert.ok(trace.indexOf("work-lock") > trace.indexOf("tenant-lock"))
    effects.saveEvaluationState({ calculationRevision: 7, cashRiskRelevance: "active" })
    assert.equal(trace.includes("state"), false, "no elevation even while callback continues")
    auth(); pending.push("candidate", "event"); return { processed: 2 }
  })
  assert.deepEqual(result, { processed: 2 }); assert.deepEqual(committed, ["candidate", "event", "state"])
  assert.equal(trace.filter((item) => item === "fence").length, 2)
  assert.ok(trace.lastIndexOf("fence") > trace.indexOf("state")); assert.equal(role, "session")
})
test("6.1 post-callback expiry, revocation, revision, owner and fence invalidate ALL writes", async () => {
  for (const invalidate of [() => { clock = expires }, () => { revoked = true },
    () => { revision++ }, () => { owner = "replacement" }, () => { fence++ }]) {
    clock = new Date("2026-10-19T12:00:00Z"); expires = new Date(clock.getTime() + 60_000)
    revoked = false; revision = 7; owner = "worker"; fence = 4
    await assert.rejects(boundary.withCommitGuardWorkSideEffects(input, async (_tx, effects) => {
      pending.push("candidate", "event"); effects.saveEvaluationState({ calculationRevision: 7 }); invalidate()
    }), boundary.CommitGuardWorkBoundaryError)
    assert.deepEqual(committed, []); assert.equal(role, "session")
  }
})
test("6.1 denied admission never calls financial callback", async () => {
  for (const invalidate of [() => { revoked = true }, () => { enabled = false }, () => { revision++ },
    () => { expires = clock }, () => { owner = "wrong" }, () => { fence++ }, () => { workKind = "detect" },
    () => { workRevision++ }]) {
    revoked = false; enabled = true; revision = 7; expires = new Date(clock.getTime() + 60_000)
    owner = "worker"; fence = 4; workKind = "evaluate"; workRevision = 7
    invalidate()
    await assert.rejects(boundary.withCommitGuardWorkSideEffects(input, async () => assert.fail("financial callback")), boundary.CommitGuardWorkBoundaryError)
    assert.deepEqual(committed, [])
  }
})
test("6.1 runtime queue permission/SQL keys are rejected before a transaction", async () => {
  for (const extra of [{ effectiveTier: "business_pro" }, { allowAccess: true }, { role: "postgres" }, { sql: "DROP TABLE x" }]) {
    await assert.rejects(boundary.withCommitGuardWorkSideEffects({ ...input, ...extra }, async () => assert.fail("callback")))
    assert.deepEqual(trace, [])
  }
})
test("6.1 state allowlist and revision cannot be bypassed by catching the staging error", async () => {
  for (const patch of [{ userId: "foreign" }, { calculationRevision: 8 }, { sql: "SELECT 1" }]) {
    await assert.rejects(boundary.withCommitGuardWorkSideEffects(input, async (_tx, effects) => {
      pending.push("event")
      try { effects.saveEvaluationState(patch as never) } catch { /* intentionally swallowed */ }
    }))
    assert.deepEqual(committed, [])
  }
})
test("6.1 callback failure and role restoration failure roll back; escaped capability is closed", async () => {
  let escaped: import("@/lib/commitguard/workSideEffects").CommitGuardWorkEffects | undefined
  await assert.rejects(boundary.withCommitGuardWorkSideEffects(input, async (_tx, effects) => {
    escaped = effects; pending.push("event"); throw new Error("callback failed")
  }), /callback failed/)
  assert.throws(() => escaped!.saveEvaluationState({}), { reason: "boundary_closed" })
  failRestore = true
  await assert.rejects(boundary.withCommitGuardWorkSideEffects(input, async () => assert.fail("callback")), /restore failed/)
  assert.deepEqual(committed, []); assert.equal(role, "session")
})

test("6.3 private fence renews unexpired lease at transaction boundaries, never resurrects exact expiry", async () => {
  expires = new Date(clock.getTime() + 5_000)
  await boundary.withCommitGuardWorkSideEffects(input, async () => {
    assert.equal(expires.getTime(), clock.getTime() + 60_000)
    clock = new Date(clock.getTime() + 10_000)
  })
  assert.equal(expires.getTime(), clock.getTime() + 60_000)
  expires = clock
  await assert.rejects(boundary.withCommitGuardWorkSideEffects(input, async () => assert.fail("expired callback")), boundary.CommitGuardWorkBoundaryError)
  assert.equal(expires, clock)
})