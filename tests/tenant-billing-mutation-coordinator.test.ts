import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import type Stripe from "stripe"
import { Prisma, type TenantBillingMutationAction, type UserProfile } from "@/lib/generated/prisma/client"
import type { CustomerBillingIntent } from "@/lib/billing/customerBillingPlan"
import type { CustomerBillingFence } from "@/lib/billing/tenantBillingFence"
import type { BillingStepInput, CustomerBillingReservationInput } from "@/lib/billing/tenantBillingMutationCoordinator"

type Row = Record<string, unknown>
const tenant = "11111111-1111-4111-8111-111111111111"
const foreign = "22222222-2222-4222-8222-222222222222"
const rootId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const nextId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
let api: typeof import("@/lib/billing/tenantBillingMutationCoordinator")
let executorsApi: typeof import("@/lib/billing/customerBillingExecutors")
let plansApi: typeof import("@/lib/billing/customerBillingPlan")
let coordinator: ReturnType<typeof api.createTenantBillingMutationCoordinator>
let db: JournalDatabaseMock
let time: Date
let provider: Row
let customerMetadata: Record<string, string>
let readHook: (() => void) | undefined
let reads: number
let routeStripe: Stripe

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((yes) => { resolve = yes })
  return { promise, resolve }
}
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "NOT") return !matches(row, expected as Row)
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      if ("in" in expected) return (expected.in as unknown[]).includes(row[key])
      if ("gt" in expected) return row[key] instanceof Date && row[key] > (expected.gt as Date)
    }
    return row[key] === expected
  })
}
function apply(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (value === Prisma.JsonNull || value === Prisma.DbNull) row[key] = null
    else if (value && typeof value === "object" && "increment" in value) row[key] = Number(row[key]) + Number(value.increment)
    else row[key] = structuredClone(value)
  }
}

/** Only Prisma/transaction/lock semantics are mocked, NOT coordinator behavior. */
class JournalDatabaseMock {
  profile: Row = {
    userId: tenant, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1",
    billingAccessVersion: 7, pendingTrialOperationId: null, pendingBillingMutationId: null,
    stripeScheduleId: null, pendingDowngradeTier: null, subscriptionTier: "business_control",
    subscriptionStatus: "trialing", trialEndsAt: new Date("2026-10-30"),
  }
  operations: Row[] = []
  steps: Row[] = []
  owners: Row[] = []
  extraProfiles: Row[] = []
  active = 0
  failCommit = false
  failWrite: string | undefined
  log: string[] = []
  private tail = Promise.resolve()

  private delegate(table: "profile" | "operations" | "steps" | "owners") {
    const rows = () => table === "profile" ? [this.profile, ...this.extraProfiles] : this[table]
    const access = () => { assert.equal(this.active, 1, `tenant lock before ${table}`) }
    const write = () => {
      access(); this.log.push(`write:${table}`)
      if (this.failWrite === table) throw new Error(`mock ${table} write failure`)
    }
    return {
      findUnique: async ({ where }: { where: Row }) => { access(); return structuredClone(rows().find((row) => matches(row, where)) ?? null) },
      findFirst: async ({ where }: { where: Row }) => { access(); return structuredClone(rows().find((row) => matches(row, where)) ?? null) },
      findMany: async ({ where }: { where: Row }) => { access(); return structuredClone(rows().filter((row) => matches(row, where)).sort((a, b) => Number(a.sequence) - Number(b.sequence))) },
      create: async ({ data }: { data: Row }) => {
        write()
        const row: Row = { id: `step-${this.steps.length}`, status: "pending", attempts: 0,
          fencingToken: 0, leaseOwner: null, leaseExpiresAt: null, firstAttemptAt: null, lastAttemptAt: null,
          completedAt: null, executionVersion: null, parentMutationId: null, stripeCustomerId: null,
          stripeSubscriptionId: null, stripeSessionId: null, stripeScheduleId: null, stripeRequestId: null,
          providerResult: null, result: null, failureCode: null, createdAt: time }
        apply(row, data)
        assert.ok(!rows().some((other) => other.id === row.id), "mock global primary key")
        rows().push(row)
        return structuredClone(row)
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        write(); const row = rows().find((row) => matches(row, where)); assert.ok(row, "mock update target")
        apply(row, data); return structuredClone(row)
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        write(); const found = rows().filter((row) => matches(row, where))
        for (const row of found) apply(row, data)
        return { count: found.length }
      },
    }
  }
  transaction = async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
    let release: (() => void) | undefined
    let snapshot: { profile: Row; operations: Row[]; steps: Row[]; owners: Row[] } | undefined
    const tx = {
      $executeRawUnsafe: async (sql: string, key: string) => {
        assert.equal(sql, "SELECT pg_advisory_xact_lock(hashtext($1))")
        assert.equal(key, `billing-access:${tenant}`)
        const previous = this.tail, gate = deferred(); this.tail = gate.promise; release = gate.resolve
        await previous
        this.active++; this.log.push("tenant-lock")
        snapshot = structuredClone({ profile: this.profile, operations: this.operations, steps: this.steps, owners: this.owners })
      },
      userProfile: this.delegate("profile"), tenantBillingMutation: this.delegate("operations"),
      tenantBillingMutationStep: this.delegate("steps"), tenantTrialOperation: this.delegate("owners"),
    }
    try {
      const result = await run(tx as unknown as Prisma.TransactionClient)
      if (this.failCommit) throw new Error("mock commit failure")
      this.log.push("commit")
      return result
    } catch (error) {
      if (snapshot) Object.assign(this, snapshot)
      this.log.push("rollback"); throw error
    } finally { if (release) { this.active--; release() } }
  }
}
const stripe = {
  customers: { retrieve: async (id: string) => {
    reads++; readHook?.()
    return { id, metadata: customerMetadata }
  } },
  subscriptions: { retrieve: async (id: string) => {
    reads++; readHook?.()
    return structuredClone({ ...provider, id })
  } },
} as unknown as Stripe
function step(stepKey = "checkout_create", request: JsonInput = { customer: "cus_1", price: "price_control" }): BillingStepInput {
  return { stepKey, normalizedRequest: request, method: "POST", objectTarget: "/v1/checkout/sessions" }
}
type JsonInput = BillingStepInput["normalizedRequest"]
function request(action: TenantBillingMutationAction = "checkout_create", operationId = rootId): CustomerBillingReservationInput {
  const normalizedInput: JsonInput = action === "cancel" ? { redirectUrl: "https://paidsoon.test/settings?cancellation=ended" } : { plan: "business_control" }
  return { operationId, userId: tenant, actorUserId: tenant, action, expectedVersion: 7,
    normalizedInput, inputHash: api.billingMutationInputHash(action, normalizedInput),
    steps: action === "cancel" ? [] : [step(api.BILLING_MUTATION_STEPS[action][0])] }
}
async function accepted(action: TenantBillingMutationAction = "checkout_create"): Promise<CustomerBillingFence> {
  await coordinator.reserve(request(action)); return coordinator.claim(tenant, rootId, "worker")
}
async function succeed(fence: CustomerBillingFence, stepKey = "checkout_create", safeResponse: JsonInput = { url: "https://checkout.stripe.test/session" }): Promise<void> {
  await coordinator.recordStep(tenant, fence, stepKey, async () => ({ kind: "succeeded",
    proof: { verified: "operation-correlation" }, refs: { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", stripeSessionId: "cs_1" }, safeResponse }))
}
const conflict = (code: string) => ({ code })

describe("D6a real durable coordinator with transactional Prisma mocks (offline)", () => {
  before(async () => {
    await mock.module("server-only", { namedExports: {} })
    await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
      $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.transaction(run),
    } } })
    await mock.module("@/lib/billing/stripeClient", { namedExports: { createStripeClient: () => routeStripe } })
    api = await import("@/lib/billing/tenantBillingMutationCoordinator")
    executorsApi = await import("@/lib/billing/customerBillingExecutors")
    plansApi = await import("@/lib/billing/customerBillingPlan")
    process.env.STRIPE_SOLO_PRICE_ID = "price_control"
  })
  beforeEach(() => {
    db = new JournalDatabaseMock(); time = new Date("2026-10-15T12:00:00Z")
    coordinator = api.createTenantBillingMutationCoordinator({ transaction: db.transaction, now: () => new Date(time) })
    provider = { id: "sub_1", customer: "cus_1", metadata: { userId: tenant }, status: "past_due", trial_end: null,
      items: { data: [{ price: { id: "price_control" } }], has_more: false },
      cancel_at: null, cancel_at_period_end: false, latest_invoice: { period_start: 1800000000, period_end: 1900000000 } }
    customerMetadata = { userId: tenant }; readHook = undefined; reads = 0
  })

  test("no provider dispatch without committed acceptance, claim, matching binding and first attempt", async () => {
    let mutations = 0
    const forged: CustomerBillingFence = { kind: "customer", operationId: rootId, leaseOwner: "worker", fencingToken: 1, executionVersion: 8 }
    await assert.rejects(coordinator.dispatch(tenant, forged, "checkout_create", async () => { mutations++ }))
    for (const table of ["operations", "steps", "profile"]) {
      db.failWrite = table
      await assert.rejects(coordinator.reserve(request()))
      assert.equal(db.operations.length, 0); assert.equal(db.profile.pendingBillingMutationId, null)
      db.failWrite = undefined
    }
    db.failCommit = true
    await assert.rejects(coordinator.reserve(request()))
    assert.equal(db.operations.length, 0); db.failCommit = false
    const fence = await accepted()
    db.failCommit = true
    await assert.rejects(coordinator.dispatch(tenant, fence, "checkout_create", async () => { mutations++ }))
    assert.equal(mutations, 0); assert.equal(db.steps[0].firstAttemptAt, null)
    db.failCommit = false
    await coordinator.dispatch(tenant, fence, "checkout_create", async (frozen) => {
      assert.equal(db.active, 0, "no DB transaction or advisory lock across provider mutation")
      assert.equal(db.log.at(-1), "commit", "pre-call attempt is durable")
      assert.equal(db.profile.pendingBillingMutationId, rootId)
      assert.deepEqual(db.steps[0].firstAttemptAt, time); assert.equal(frozen.attempts, 1); mutations++
    })
    assert.equal(mutations, 1)
  })
  test("global UUID, authenticated actor, action, hash and normalized intent cannot change on replay", async () => {
    await coordinator.reserve(request())
    for (const change of [
      { actorUserId: foreign }, { action: "portal_create" as const }, { normalizedInput: { plan: "business_pro" } },
      { inputHash: "0".repeat(64) },
    ]) await assert.rejects(coordinator.reserve({ ...request(), ...change }), conflict("billing_operation_key_conflict"))
    db.operations[0].userId = foreign
    await assert.rejects(coordinator.reserve(request()), conflict("billing_operation_key_conflict"))
    db.operations[0].userId = tenant
    for (const id of ["not-a-uuid", "aaaaaaaa-aaaa-0aaa-0aaa-aaaaaaaaaaaa"]) {
      await assert.rejects(coordinator.reserve({ ...request(), operationId: id }))
    }
    assert.equal(db.operations.length, 1)
  })
  test("owner journal UUID is never reinterpreted as a customer request", async () => {
    db.owners.push({ id: rootId, userId: tenant })
    await assert.rejects(coordinator.reserve(request()), conflict("billing_operation_key_conflict"))
    assert.equal(db.operations.length, 0)
  })
  test("simultaneous different customer requests reserve at most one and reject stale previews", async () => {
    const results = await Promise.allSettled([request(), request("portal_create", nextId)].map((input) => coordinator.reserve(input)))
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
    assert.equal(db.operations.length, 1); assert.equal(db.profile.billingAccessVersion, 8)
    await assert.rejects(coordinator.reserve(request("portal_create", nextId)), conflict("billing_mutation_in_progress"))
  })
  test("owner reservation blocks every customer action including local cancellation and portal creation", async () => {
    db.profile.pendingTrialOperationId = nextId
    for (const action of Object.keys(api.BILLING_MUTATION_STEPS).filter((key) => key !== "customer_create") as TenantBillingMutationAction[]) {
      await assert.rejects(coordinator.reserve(request(action)), conflict("trial_operation_in_progress"))
    }
    assert.equal(db.operations.length, 0)
  })
  test("null JSON intents/requests round-trip through Prisma JsonNull, not JS null writes", async () => {
    const input = request(); input.normalizedInput = null; input.inputHash = api.billingMutationInputHash(input.action, null)
    input.steps = [step("checkout_create", null)]
    await coordinator.reserve(input)
    assert.equal(db.operations[0].normalizedInput, null); assert.equal(db.steps[0].normalizedRequest, null)
    const replay = await coordinator.reserve({ ...input, expectedVersion: 0 })
    assert.equal(replay.replay, true)
  })
  test("intent hashing is stable across JSON object ordering", () => {
    assert.equal(api.billingMutationInputHash("upgrade", { a: 1, b: { c: true, d: null } }),
      api.billingMutationInputHash("upgrade", { b: { d: null, c: true }, a: 1 }))
  })
  test("terminal replay uses immutable safe response before today's version and config", async () => {
    const fence = await accepted()
    await coordinator.dispatch(tenant, fence, "checkout_create", async () => undefined)
    await succeed(fence)
    const finished = await coordinator.finalize(stripe, tenant, fence)
    assert.equal(finished.status, "succeeded"); assert.equal(db.profile.billingAccessVersion, 9)
    assert.equal(db.profile.pendingBillingMutationId, null)
    const replay = await coordinator.reserve({ ...request(), expectedVersion: 0, steps: [step("checkout_create", { price: "new_config" })] })
    assert.equal(replay.replay, true)
    assert.deepEqual(replay.operation.result, { url: "https://checkout.stripe.test/session" })
    assert.deepEqual(db.steps[0].normalizedRequest, request().steps[0].normalizedRequest)
    await assert.rejects(coordinator.dispatch(tenant, fence, "checkout_create", async () => undefined))
    await assert.rejects(coordinator.reserve({ ...request("portal_create", nextId), expectedVersion: 7 }), conflict("billing_version_conflict"))
  })
  test("no caller supplied status, projection, result, provider references or arbitrary patch is accepted at reserve", async () => {
    for (const extra of [{ status: "succeeded" }, { result: { url: "https://evil.test" } }, { subscriptionTier: "business_pro" }, { stripeCustomerId: "cus_other" }]) {
      await assert.rejects(coordinator.reserve({ ...request(), ...extra }))
    }
    assert.equal(db.operations.length, 0)
  })
  test("terminal replay never supplies a different, newer reservation for execution", async () => {
    const fence = await accepted()
    await coordinator.dispatch(tenant, fence, "checkout_create", async () => undefined); await succeed(fence)
    await coordinator.finalize(stripe, tenant, fence)
    await coordinator.reserve({ ...request("portal_create", nextId), expectedVersion: 9 })
    const replay = await coordinator.reserve(request())
    assert.equal(replay.operation.id, rootId); assert.equal(replay.reservedOperationId, null)
    assert.equal(db.profile.pendingBillingMutationId, nextId)
  })
  test("empty proof, missing provider objects and forged evidence cannot complete an attempted step", async () => {
    const fence = await accepted()
    await coordinator.dispatch(tenant, fence, "checkout_create", async () => undefined)
    await assert.rejects(coordinator.recordStep(tenant, fence, "checkout_create", async () => ({ kind: "succeeded", proof: {},
      refs: { stripeCustomerId: "cus_1", stripeSessionId: "cs_1" }, safeResponse: { url: "https://checkout.stripe.test" } })))
    await assert.rejects(coordinator.recordStep(tenant, fence, "checkout_create", async () => ({ kind: "succeeded", proof: { correlated: true },
      refs: { stripeCustomerId: "cus_1" } })), conflict("billing_step_evidence_missing"))
    await succeed(fence)
    const saved = structuredClone(db.steps[0].providerResult) as Row
    for (const altered of [{ mutationId: nextId }, { requestHash: "other" }, { stepKey: "portal_create" },
      { outcome: "rejected" }, { refs: { stripeCustomerId: "cus_1", stripeSessionId: "cs_other" } }]) {
      db.steps[0].providerResult = { ...saved, ...altered }
      await assert.rejects(coordinator.finalize(stripe, tenant, fence), conflict("billing_step_evidence_missing"))
      assert.equal(db.profile.pendingBillingMutationId, rootId)
    }
  })
  test("finalization requires attempted keyed evidence for every required step, not requested success", async () => {
    const fence = await accepted()
    await assert.rejects(coordinator.finalize(stripe, tenant, fence), conflict("billing_step_evidence_missing"))
    await assert.rejects(succeed(fence), conflict("billing_step_conflict"))
    await coordinator.dispatch(tenant, fence, "checkout_create", async () => undefined)
    await assert.rejects(coordinator.finalize(stripe, tenant, fence), conflict("billing_outcome_unknown"))
    db.steps[0].status = "succeeded"
    await assert.rejects(coordinator.finalize(stripe, tenant, fence))
    assert.equal(db.profile.pendingBillingMutationId, rootId)
  })
  test("timeout and cached 500 preserve reservation and first-attempt deadline across process replacement", async () => {
    const fence = await accepted()
    await assert.rejects(coordinator.dispatch(tenant, fence, "checkout_create", async () => { throw new Error("cached 500") }))
    assert.equal(db.operations[0].status, "reconciliation_required")
    assert.equal(db.steps[0].status, "reconciliation_required")
    const firstAttempt = db.steps[0].firstAttemptAt
    time = new Date(time.getTime() + 60001)
    coordinator = api.createTenantBillingMutationCoordinator({ transaction: db.transaction, now: () => new Date(time) })
    const recovered = await coordinator.claim(tenant, rootId, "worker")
    assert.equal(recovered.fencingToken, fence.fencingToken + 1, "same lease owner is a new fenced executor")
    assert.equal(db.profile.pendingBillingMutationId, rootId)
    await assert.rejects(coordinator.reserve(request("portal_create", nextId)), conflict("billing_mutation_in_progress"))
    await coordinator.dispatch(tenant, recovered, "checkout_create", async (frozen) => {
      assert.deepEqual(frozen.firstAttemptAt, firstAttempt); assert.equal(frozen.attempts, 2)
    })
    assert.deepEqual(db.steps[0].firstAttemptAt, firstAttempt)
  })
  test("stale same-owner token cannot dispatch, record evidence, mark uncertainty, freeze a later step, finalize or clear", async () => {
    const stale = await accepted("schedule_downgrade")
    await coordinator.dispatch(tenant, stale, "schedule_create", async () => undefined)
    time = new Date(time.getTime() + 60001)
    const recovered = await coordinator.claim(tenant, rootId, "worker")
    assert.equal(recovered.leaseOwner, stale.leaseOwner)
    let callbacks = 0
    const attempts = [
      () => coordinator.dispatch(tenant, stale, "schedule_create", async () => { callbacks++ }),
      () => coordinator.recordStep(tenant, stale, "schedule_create", async () => { callbacks++; return { kind: "succeeded" as const, proof: { ok: true }, refs: {} } }),
      () => coordinator.uncertain(tenant, stale, "schedule_create"),
      () => coordinator.freezeStep(tenant, stale, step("schedule_phase_update")),
      () => coordinator.finalize(stripe, tenant, stale),
    ]
    for (const attempt of attempts) await assert.rejects(attempt(), conflict("billing_mutation_fence_lost"))
    assert.equal(callbacks, 0); assert.equal(db.profile.pendingBillingMutationId, rootId)
    assert.equal(db.operations[0].fencingToken, recovered.fencingToken)
  })
  test("lease expiry alone neither clears reservation nor allows same-operation live double claims", async () => {
    const fence = await accepted()
    await assert.rejects(coordinator.claim(tenant, rootId, "worker"), conflict("billing_execution_in_progress"))
    time = new Date(time.getTime() + 60000)
    await assert.rejects(coordinator.dispatch(tenant, fence, "checkout_create", async () => undefined), conflict("billing_mutation_fence_lost"))
    assert.equal(db.profile.pendingBillingMutationId, rootId)
    assert.equal(db.profile.billingAccessVersion, 8)
  })
  test("a slow old provider result cannot commit after a replacement claim while the call is outside all locks", async () => {
    const stale = await accepted(), entered = deferred(), release = deferred()
    const call = coordinator.dispatch(tenant, stale, "checkout_create", async () => {
      assert.equal(db.active, 0); entered.resolve(); await release.promise
    })
    await entered.promise
    time = new Date(time.getTime() + 60001)
    const newer = await coordinator.claim(tenant, rootId, "worker")
    release.resolve(); await call
    await assert.rejects(succeed(stale), conflict("billing_mutation_fence_lost"))
    await succeed(newer)
    assert.equal(db.operations[0].fencingToken, newer.fencingToken)
    assert.equal(db.profile.pendingBillingMutationId, rootId)
  })
  test("step request/key/method/target are write-once; config changes cannot replace accepted bytes", async () => {
    const fence = await accepted(), original = structuredClone(db.steps[0])
    await coordinator.freezeStep(tenant, fence, request().steps[0])
    for (const extra of [{ normalizedRequest: { price: "changed" } }, { objectTarget: "/different" }]) {
      await assert.rejects(coordinator.freezeStep(tenant, fence, { ...request().steps[0], ...extra }), conflict("billing_step_conflict"))
    }
    assert.deepEqual(db.steps[0], original)
    await coordinator.dispatch(tenant, fence, "checkout_create", async (frozen) => {
      assert.deepEqual(frozen.normalizedRequest, original.normalizedRequest)
      assert.equal(frozen.stripeIdempotencyKey, `billing/${rootId}/checkout_create`)
    })
  })
  test("step replay allowed strictly before 24h, blocked at/after boundary without mutation or new keys", async () => {
    const initial = new Date(time), fence = await accepted()
    await coordinator.dispatch(tenant, fence, "checkout_create", async () => undefined)
    time = new Date(initial.getTime() + 86400000 - 1)
    const recovered = await coordinator.claim(tenant, rootId, "recovery")
    await coordinator.dispatch(tenant, recovered, "checkout_create", async () => undefined)
    for (const offset of [86400000, 86400001]) {
      time = new Date(initial.getTime() + offset)
      await assert.rejects(coordinator.dispatch(tenant, recovered, "checkout_create", async () => assert.fail("late create")), conflict("billing_step_replay_window_expired"))
    }
    assert.equal(db.steps[0].attempts, 2); assert.deepEqual(db.steps[0].firstAttemptAt, initial)
    assert.equal(db.profile.pendingBillingMutationId, rootId)
  })
  test("schedule create evidence must commit before dependent phases freeze/dispatch, and partial rejection stays reserved", async () => {
    const fence = await accepted("schedule_downgrade")
    const phaseStep = step("schedule_phase_update", { schedule: "sched_1", phases: [{ start_date: 100 }] })
    await assert.rejects(coordinator.freezeStep(tenant, fence, phaseStep), conflict("billing_step_order_conflict"))
    await coordinator.dispatch(tenant, fence, "schedule_create", async () => undefined)
    await coordinator.recordStep(tenant, fence, "schedule_create", async () => ({ kind: "succeeded", proof: { created: "sched_1" },
      refs: { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", stripeScheduleId: "sched_1" } }))
    await assert.rejects(coordinator.finalize(stripe, tenant, fence), conflict("billing_step_evidence_missing"))
    await coordinator.freezeStep(tenant, fence, phaseStep)
    await coordinator.dispatch(tenant, fence, "schedule_phase_update", async (frozen) => {
      assert.equal(db.active, 0); assert.equal(db.steps[0].status, "succeeded")
      assert.deepEqual(frozen.normalizedRequest, phaseStep.normalizedRequest)
      assert.notEqual(frozen.stripeIdempotencyKey, db.steps[0].stripeIdempotencyKey)
    })
    await coordinator.recordStep(tenant, fence, "schedule_phase_update", async () => ({ kind: "rejected", proof: { definitive: "invalid_phases" }, failureCode: "invalid_phases" }))
    await assert.rejects(coordinator.finalize(stripe, tenant, fence), conflict("billing_partial_outcome"))
    assert.equal(db.profile.pendingBillingMutationId, rootId); assert.equal(db.operations[0].status, "reconciliation_required")
  })
  test("definitive rejection releases only after proven nonexecution of every attempted step", async () => {
    const fence = await accepted()
    await coordinator.dispatch(tenant, fence, "checkout_create", async () => undefined)
    await coordinator.recordStep(tenant, fence, "checkout_create", async () => ({ kind: "rejected", proof: { definitive: "validation_rejected" }, failureCode: "validation_rejected" }))
    const finished = await coordinator.finalize(stripe, tenant, fence)
    assert.equal(finished.status, "failed"); assert.equal(reads, 0)
    assert.equal(db.profile.pendingBillingMutationId, null); assert.equal(db.profile.billingAccessVersion, 9)
    const replay = await coordinator.reserve(request()); assert.equal(replay.operation.status, "failed")
  })
  test("finalization projects fresh provider truth (never requested tier/status/old invoice period), atomically with result and release", async () => {
    const fence = await accepted("upgrade")
    await coordinator.dispatch(tenant, fence, "upgrade", async () => undefined)
    await succeed(fence, "upgrade", { url: "https://paidsoon.test/success" })
    db.failWrite = "profile"
    await assert.rejects(coordinator.finalize(stripe, tenant, fence))
    assert.equal(db.operations[0].status, "reconciliation_required"); assert.equal(db.operations[0].result, null)
    assert.equal(db.profile.pendingBillingMutationId, rootId); assert.equal(db.profile.billingAccessVersion, 8)
    db.failWrite = undefined
    await coordinator.finalize(stripe, tenant, fence)
    assert.equal(db.profile.subscriptionStatus, "past_due")
    assert.equal(db.profile.subscriptionTier, "business_control")
    assert.deepEqual(db.profile.subscriptionCurrentPeriodEnd, new Date(1900000000000))
    assert.equal(db.profile.trialEndsAt, null); assert.equal(db.profile.pendingBillingMutationId, null)
  })
  test("fence expiring DURING current-state verification rolls back journal result/projection/release", async () => {
    const fence = await accepted()
    await coordinator.dispatch(tenant, fence, "checkout_create", async () => undefined); await succeed(fence)
    readHook = () => { time = new Date(time.getTime() + 60001) }
    await assert.rejects(coordinator.finalize(stripe, tenant, fence), conflict("billing_mutation_fence_lost"))
    assert.equal(db.operations[0].status, "reconciliation_required"); assert.equal(db.profile.billingAccessVersion, 8)
    assert.equal(db.profile.pendingBillingMutationId, rootId)
  })
  test("webhook version bumps with unchanged binding do not strand accepted execution generation", async () => {
    const fence = await accepted()
    db.profile.billingAccessVersion = 10
    await coordinator.dispatch(tenant, fence, "checkout_create", async () => undefined); await succeed(fence)
    await coordinator.finalize(stripe, tenant, fence)
    assert.equal(db.profile.billingAccessVersion, 11); assert.equal(db.profile.pendingBillingMutationId, null)
  })
  test("changed current binding or another reservation cannot be overwritten/cleared by old operation", async () => {
    const fence = await accepted()
    await coordinator.dispatch(tenant, fence, "checkout_create", async () => undefined); await succeed(fence)
    db.profile.stripeSubscriptionId = "sub_new"
    await assert.rejects(coordinator.finalize(stripe, tenant, fence), conflict("billing_mutation_fence_lost"))
    db.profile.stripeSubscriptionId = "sub_1"; db.profile.pendingTrialOperationId = nextId
    await assert.rejects(coordinator.finalize(stripe, tenant, fence), conflict("trial_operation_in_progress"))
    assert.equal(db.profile.pendingBillingMutationId, rootId); assert.equal(db.profile.pendingTrialOperationId, nextId)
  })
  test("known provider success followed by process death/commit failure remains durable for evidence-based recovery", async () => {
    const stale = await accepted()
    await coordinator.dispatch(tenant, stale, "checkout_create", async () => "created-at-provider")
    db.failCommit = true
    await assert.rejects(succeed(stale)); db.failCommit = false
    assert.equal(db.steps[0].providerResult, null); assert.equal(db.steps[0].attempts, 1)
    time = new Date(time.getTime() + 60001)
    const recovery = await coordinator.claim(tenant, rootId, "recovery")
    await succeed(recovery); await coordinator.finalize(stripe, tenant, recovery)
    assert.equal(db.operations[0].status, "succeeded"); assert.equal(db.steps[0].attempts, 1, "retrieval proof needs no repeat mutation")
  })
  test("local cancel has no provider step/key/read and preserves independent grant state", async () => {
    db.profile.stripeSubscriptionId = null
    const fence = await accepted("cancel")
    const result = await coordinator.finalize(stripe, tenant, fence)
    assert.deepEqual(result.result, { redirectUrl: "https://paidsoon.test/settings?cancellation=ended" })
    assert.equal(db.profile.subscriptionStatus, "canceled"); assert.equal(db.profile.subscriptionTier, "essentials")
    assert.equal(reads, 0); assert.equal(db.steps.length, 0)
    assert.equal(db.profile.billingAccessVersion, 9)
  })

  async function prerequisite(): Promise<{ childId: string; fence: CustomerBillingFence }> {
    db.profile.stripeCustomerId = null; db.profile.stripeSubscriptionId = null
    const input = request(); input.steps = []
    input.customerPrerequisite = { normalizedInput: { email: "owner@example.test", userId: tenant },
      step: { ...step("customer_create", { email: "owner@example.test" }), objectTarget: "/v1/customers" } }
    const reserved = await coordinator.reserve(input), childId = api.billingCustomerPrerequisiteId(rootId)
    assert.equal(reserved.reservedOperationId, childId); assert.equal(db.operations.length, 2)
    const fence = await coordinator.claim(tenant, childId, "child-worker")
    return { childId, fence }
  }
  test("root and prerequisite are persisted atomically, only child reserved; unreserved root cannot dispatch", async () => {
    const { childId } = await prerequisite()
    assert.equal(db.profile.pendingBillingMutationId, childId)
    assert.equal(db.operations.find((row) => row.id === rootId)?.executionVersion, null)
    await assert.rejects(coordinator.claim(tenant, rootId, "root-worker"), conflict("billing_mutation_in_progress"))
    const replay = await coordinator.reserve({ ...request(), expectedVersion: 0 })
    assert.equal(replay.reservedOperationId, childId); assert.equal(db.operations.length, 2)
  })
  test("verified child binding, child completion and root handoff are one transaction without unreserved gap", async () => {
    const { childId, fence } = await prerequisite()
    await coordinator.dispatch(tenant, fence, "customer_create", async () => undefined)
    await coordinator.recordStep(tenant, fence, "customer_create", async () => ({ kind: "succeeded", proof: { created: "cus_new" }, refs: { stripeCustomerId: "cus_new" }, safeResponse: {} }))
    customerMetadata = { userId: tenant, operationId: childId }
    db.failWrite = "profile"
    await assert.rejects(coordinator.handoff(stripe, tenant, fence)); db.failWrite = undefined
    assert.equal(db.profile.pendingBillingMutationId, childId); assert.equal(db.profile.stripeCustomerId, null)
    assert.equal(db.operations.find((row) => row.id === childId)?.status, "reconciliation_required")
    const root = await coordinator.handoff(stripe, tenant, fence)
    assert.equal(root.executionVersion, 9); assert.equal(db.profile.billingAccessVersion, 9)
    assert.equal(db.profile.pendingBillingMutationId, rootId); assert.equal(db.profile.stripeCustomerId, "cus_new")
    assert.equal(db.operations.find((row) => row.id === childId)?.status, "succeeded")
    const rootFence = await coordinator.claim(tenant, rootId, "root-worker")
    await coordinator.freezeStep(tenant, rootFence, step("checkout_create", { customer: "cus_new" }))
    await coordinator.dispatch(tenant, rootFence, "checkout_create", async (frozen) => {
      assert.equal(db.active, 0); assert.deepEqual(frozen.normalizedRequest, { customer: "cus_new" })
    })
    await assert.rejects(coordinator.handoff(stripe, tenant, fence), conflict("billing_mutation_in_progress"))
  })
  test("unproven/conflicting customer cannot hand off and stale child cannot clear root", async () => {
    const { childId, fence } = await prerequisite()
    await coordinator.dispatch(tenant, fence, "customer_create", async () => undefined)
    await coordinator.recordStep(tenant, fence, "customer_create", async () => ({ kind: "succeeded", proof: { created: "cus_new" }, refs: { stripeCustomerId: "cus_new" } }))
    customerMetadata = { userId: foreign, operationId: childId }
    await assert.rejects(coordinator.handoff(stripe, tenant, fence), conflict("billing_customer_evidence_conflict"))
    customerMetadata = { userId: tenant }
    await assert.rejects(coordinator.handoff(stripe, tenant, fence), conflict("billing_customer_evidence_conflict"))
    assert.equal(db.profile.pendingBillingMutationId, childId); assert.equal(db.profile.stripeCustomerId, null)
  })
  test("proven customer-create nonexecution fails child and waiting root with one atomic reservation release", async () => {
    const { childId, fence } = await prerequisite()
    await coordinator.dispatch(tenant, fence, "customer_create", async () => undefined)
    await coordinator.recordStep(tenant, fence, "customer_create", async () => ({ kind: "rejected",
      proof: { definitive: "invalid_customer" }, failureCode: "invalid_customer" }))
    db.failWrite = "profile"
    await assert.rejects(coordinator.finalize(stripe, tenant, fence)); db.failWrite = undefined
    assert.equal(db.profile.pendingBillingMutationId, childId)
    assert.equal(db.operations.find((row) => row.id === rootId)?.status, "pending")
    await coordinator.finalize(stripe, tenant, fence)
    assert.equal(db.profile.pendingBillingMutationId, null); assert.equal(db.profile.billingAccessVersion, 9)
    assert.equal(db.operations.find((row) => row.id === childId)?.status, "failed")
    const replay = await coordinator.reserve(request())
    assert.equal(replay.operation.status, "failed"); assert.deepEqual(replay.operation.result, { error: "invalid_customer" })
    assert.equal(reads, 0)
  })
  test("crash after handoff resumes the same root/post-binding version rather than creating another customer", async () => {
    const { childId, fence } = await prerequisite()
    await coordinator.dispatch(tenant, fence, "customer_create", async () => undefined)
    await coordinator.recordStep(tenant, fence, "customer_create", async () => ({ kind: "succeeded", proof: { created: "cus_new" }, refs: { stripeCustomerId: "cus_new" } }))
    customerMetadata = { userId: tenant, operationId: childId }
    await coordinator.handoff(stripe, tenant, fence)
    coordinator = api.createTenantBillingMutationCoordinator({ transaction: db.transaction, now: () => new Date(time) })
    const replay = await coordinator.reserve(request())
    assert.equal(replay.reservedOperationId, rootId); assert.equal(replay.operation.executionVersion, 9)
    const claim = await coordinator.claim(tenant, rootId, "root-worker")
    assert.equal(claim.executionVersion, 9); assert.equal(db.operations.length, 2)
  })
  test("discovered subscription binding is verified in-reservation, versioned and fences the old binding generation", async () => {
    db.profile.stripeSubscriptionId = null
    const fence = await accepted("cancel_portal_create")
    provider.customer = "cus_other"
    await assert.rejects(coordinator.bindDiscoveredSubscription(stripe, tenant, fence, "sub_1"))
    assert.equal(db.profile.stripeSubscriptionId, null)
    provider.customer = "cus_1"
    const updated = await coordinator.bindDiscoveredSubscription(stripe, tenant, fence, "sub_1")
    assert.equal(updated.executionVersion, 9); assert.equal(db.profile.stripeSubscriptionId, "sub_1")
    assert.equal(db.profile.pendingBillingMutationId, rootId)
    await assert.rejects(coordinator.dispatch(tenant, fence, "cancel_portal_create", async () => undefined), conflict("billing_mutation_fence_lost"))
    await coordinator.dispatch(tenant, updated, "cancel_portal_create", async () => undefined)
  })

  describe("task 3.11 pinned SDK executors through the real coordinator, fully mocked providers", () => {
    type Call = { method: string; target: string | null; params: unknown; key: string }
    let calls: Call[], listed: Row[][], listCalls: Row[], schedule: Row, checkout: Row
    let mutationError: unknown, customerReads: number, subscriptionReads: number
    let mockStripe: Stripe, executor: ReturnType<typeof executorsApi.createCustomerBillingExecutors>
    let crashAfterCreate: boolean
    const invoke = (method: string, target: string | null, params: unknown, options: Stripe.RequestOptions): void => {
      assert.equal(options.maxNetworkRetries, 0, "one explicit dispatch has no SDK automatic retry")
      assert.equal(db.active, 0, `${method} outside DB transaction`)
      assert.equal(db.log.at(-1), "commit", "fenced first attempt committed before dispatch")
      assert.ok(db.profile.pendingBillingMutationId)
      const step = db.steps.find((row) => row.stripeIdempotencyKey === options.idempotencyKey)
      assert.ok(step?.firstAttemptAt, "persisted step/key before each provider call")
      calls.push({ method, target, params: structuredClone(params), key: options.idempotencyKey! })
      if (mutationError) throw mutationError
    }
    const fixtureProfile = (): UserProfile => structuredClone(db.profile) as unknown as UserProfile
    const acceptIntent = (intent: CustomerBillingIntent, operationId = rootId) => executor.accept({
      operationId, expectedVersion: Number(db.profile.billingAccessVersion), intent, profile: fixtureProfile(), email: "owner@example.test",
    })
    const runIntent = async (intent: CustomerBillingIntent) => {
      const result = await acceptIntent(intent)
      assert.ok(result.reservedOperationId)
      return executor.execute(tenant, result.reservedOperationId, "executor")
    }
    beforeEach(() => {
      process.env.NEXT_PUBLIC_APP_URL = "https://paidsoon.test"
      process.env.STRIPE_STARTER_PRICE_ID = "price_essentials"
      process.env.STRIPE_SOLO_PRICE_ID = "price_control"
      process.env.STRIPE_SMALL_BUSINESS_PRICE_ID = "price_small"
      process.env.STRIPE_BUSINESS_PRO_PRICE_ID = "price_pro"
      process.env.STRIPE_TRIAL_PERIOD_DAYS = "14"
      provider.items = { has_more: false, data: [{ id: "si_1", quantity: 1,
        price: { id: "price_control", type: "recurring", recurring: { interval: "month", interval_count: 1 } } }] }
      calls = []; listed = [[structuredClone(provider)]]; listCalls = []; mutationError = undefined
      customerReads = 0; subscriptionReads = 0; crashAfterCreate = false
      schedule = { id: "sched_1", customer: "cus_1", subscription: "sub_1", status: "active", metadata: {},
        phases: [{ start_date: 1800000000, end_date: 1900000000, items: [{ price: "price_control", quantity: 1 }] }] }
      checkout = {}
      mockStripe = {
        customers: {
          create: async (params: Stripe.CustomerCreateParams, options: Stripe.RequestOptions) => {
            invoke("customer.create", null, params, options); customerMetadata = params.metadata as Record<string, string>
            return { id: "cus_new", metadata: customerMetadata, lastResponse: { requestId: "req_customer" } }
          },
          retrieve: async (id: string) => { customerReads++; return { id, metadata: customerMetadata } },
        },
        subscriptions: {
          list: async (params: Row) => { listCalls.push(params)
            const index = params.starting_after ? listed.findIndex((page) => page.at(-1)?.id === params.starting_after) + 1 : 0
            return { data: listed[index] ?? [], has_more: index < listed.length - 1 } },
          retrieve: async (id: string) => { subscriptionReads++; return structuredClone({ ...provider, id }) },
          update: async (id: string, params: Stripe.SubscriptionUpdateParams, options: Stripe.RequestOptions) => {
            invoke("subscription.update", id, params, options)
            provider.metadata = params.metadata
            provider.items = { has_more: false, data: [{ quantity: 1, price: { id: params.items![0].price } }] }
            return { ...structuredClone(provider), id, lastResponse: { requestId: "req_upgrade" } }
          },
        },
        checkout: { sessions: {
          create: async (params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) => {
            invoke("checkout.create", null, params, options)
            checkout = { id: "cs_1", customer: params.customer, mode: params.mode, metadata: params.metadata,
              success_url: params.success_url, cancel_url: params.cancel_url, url: "https://checkout.stripe.test/cs_1", status: "open",
              line_items: { has_more: false, data: params.line_items!.map((line) => ({ price: line.price, quantity: line.quantity })) } }
            return { ...checkout, lastResponse: { requestId: "req_checkout" } }
          },
          retrieve: async (id: string, params: unknown) => { assert.equal(id, "cs_1"); assert.deepEqual(params, { expand: ["line_items"] }); return checkout },
        } },
        billingPortal: { sessions: { create: async (params: Stripe.BillingPortal.SessionCreateParams, options: Stripe.RequestOptions) => {
          invoke("portal.create", null, params, options)
          return { id: "bps_1", customer: params.customer, return_url: params.return_url,
            flow: params.flow_data, url: "https://billing.stripe.test/bps_1", lastResponse: { requestId: "req_portal" } }
        } } },
        subscriptionSchedules: {
          create: async (params: Stripe.SubscriptionScheduleCreateParams, options: Stripe.RequestOptions) => {
            invoke("schedule.create", null, params, options); provider.schedule = "sched_1"
            return { ...structuredClone(schedule), lastResponse: { requestId: "req_schedule" } }
          },
          retrieve: async () => structuredClone(schedule),
          update: async (id: string, params: Stripe.SubscriptionScheduleUpdateParams, options: Stripe.RequestOptions) => {
            invoke("schedule.update", id, params, options)
            schedule.phases = params.phases!.map((phase, index) => ({ ...phase,
              start_date: phase.start_date ?? (index === 1 ? params.phases![0].end_date : 1800000000) }))
            schedule.metadata = params.metadata
            return { ...structuredClone(schedule), lastResponse: { requestId: "req_phase" } }
          },
          release: async (id: string, params: Stripe.SubscriptionScheduleReleaseParams, options: Stripe.RequestOptions) => {
            invoke("schedule.release", id, params, options); schedule.status = "released"; schedule.released_subscription = "sub_1"
            schedule.subscription = null; provider.schedule = null
            return { ...structuredClone(schedule), lastResponse: { requestId: "req_release" } }
          },
        },
      } as unknown as Stripe
      executor = executorsApi.createCustomerBillingExecutors({ stripe: mockStripe, coordinator: {
        ...coordinator, freezeStep: async (...args: Parameters<typeof coordinator.freezeStep>) => {
          if (crashAfterCreate && args[2].stepKey === "schedule_phase_update") throw new Error("crash between schedule calls")
          return coordinator.freezeStep(...args)
        },
      } })
    })

    test("open Checkout creation succeeds without claiming an active subscription; exact frozen trial/URLs/metadata/key", async () => {
      db.profile.stripeSubscriptionId = null; listed = [[]]
      const result = await runIntent({ kind: "checkout", tier: "small_business" })
      assert.equal(result.status, "succeeded"); assert.equal(db.profile.pendingBillingMutationId, null)
      assert.equal(db.profile.subscriptionStatus, "trialing"); assert.equal(db.profile.stripeSubscriptionId, null)
      assert.equal(result.stripeSessionId, "cs_1")
      assert.ok(result.executionVersion !== null && result.executionVersion > result.startingVersion)
      assert.deepEqual(result.startingBinding, { stripeCustomerId: "cus_1", stripeSubscriptionId: null })
      const created = structuredClone(result), dispatched = calls.length
      const replay = await acceptIntent({ kind: "checkout", tier: "small_business" })
      assert.equal(replay.reservedOperationId, null); assert.equal(replay.replay, true)
      assert.deepEqual(replay.operation, created, "creation outcome remains immutable while hosted session is open")
      assert.equal(calls.length, dispatched); assert.equal(db.profile.pendingBillingMutationId, null)
      assert.deepEqual(calls, [{ method: "checkout.create", target: null, key: `billing/${rootId}/checkout_create`, params: {
        customer: "cus_1", mode: "subscription", line_items: [{ price: "price_small", quantity: 1 }],
        subscription_data: { trial_period_days: 14, metadata: { user_id: tenant, userId: tenant,
          plan: "small_business", source: "paidsoon_checkout", operationId: rootId } },
        metadata: { user_id: tenant, userId: tenant, plan: "small_business", selectedTier: "small_business", source: "paidsoon_checkout", operationId: rootId },
        success_url: "https://paidsoon.test/api/billing/checkout/success?session_id={CHECKOUT_SESSION_ID}&tier=small_business",
        cancel_url: "https://paidsoon.test/dashboard/settings/subscription?cancelled=true",
      } }])
    })
    for (const trialSetting of ["0", "-1", "not-a-number"]) test(`Checkout preserves no-trial behavior for ${trialSetting} while correlating future subscription`, async () => {
      process.env.STRIPE_TRIAL_PERIOD_DAYS = trialSetting; db.profile.stripeSubscriptionId = null; listed = [[]]
      await runIntent({ kind: "checkout", tier: "essentials" })
      const params = calls[0].params as Stripe.Checkout.SessionCreateParams
      assert.equal(params.subscription_data?.trial_period_days, undefined)
      assert.equal(params.subscription_data?.metadata?.operationId, rootId)
    })
    test("upgrade keeps exact item/proration behavior and projects final past_due rather than synthetic active", async () => {
      const result = await runIntent({ kind: "checkout", tier: "small_business" })
      assert.deepEqual(calls, [{ method: "subscription.update", target: "sub_1", key: `billing/${rootId}/upgrade`,
        params: { items: [{ price: "price_small" }], proration_behavior: "create_prorations", metadata: { userId: tenant, operationId: rootId } } }])
      assert.equal(db.profile.subscriptionStatus, "past_due"); assert.equal(db.profile.subscriptionTier, "small_business")
      assert.deepEqual(db.profile.subscriptionCurrentPeriodEnd, new Date(1900000000000))
      assert.deepEqual(result.result, { url: "https://paidsoon.test/dashboard/settings/subscription?success=upgraded&tier=small_business" })
    })
    test("normalized legacy tiers remain supported, hidden/unknown grant rules are not used for checkout", () => {
      assert.deepEqual(plansApi.normalizeCustomerBillingIntent("checkout", "solo"), { kind: "checkout", tier: "business_control" })
      assert.deepEqual(plansApi.normalizeCustomerBillingIntent("checkout", "unknown"), { kind: "checkout", tier: "essentials" })
      assert.throws(() => plansApi.normalizeCustomerBillingIntent("checkout", "accountant_partner"))
    })
    test("acceptance errors and failed durable persistence cannot call a provider mutation", async () => {
      db.failWrite = "operations"
      await assert.rejects(acceptIntent({ kind: "checkout", tier: "small_business" })); db.failWrite = undefined
      assert.equal(calls.length, 0); assert.equal(db.operations.length, 0)
      provider.status = "active"; listed = [[provider]]
      await assert.rejects(acceptIntent({ kind: "checkout", tier: "business_control" }), conflict("billing_already_active"))
      provider.items = { has_more: false, data: [{ id: "si_1", quantity: 1,
        price: { id: "price_small", type: "recurring", recurring: { interval: "month", interval_count: 1 } } }] }
      listed = [[provider]]
      await assert.rejects(acceptIntent({ kind: "checkout", tier: "business_control" }), conflict("billing_use_downgrade"))
      assert.equal(calls.length, 0)
    })
    test("local onboarding cancellation clears onboarding expiry as before and preserves independent grant, with zero provider calls", async () => {
      db.profile.stripeSubscriptionId = null; db.profile.independentGrant = { id: "grant", expiresAt: "2027-01-01" }
      const result = await runIntent({ kind: "cancel" })
      assert.equal(calls.length, 0); assert.equal(customerReads, 0); assert.equal(subscriptionReads, 0); assert.equal(listCalls.length, 0)
      assert.equal(db.profile.trialEndsAt, null); assert.deepEqual(db.profile.independentGrant, { id: "grant", expiresAt: "2027-01-01" })
      assert.equal(db.profile.subscriptionStatus, "canceled"); assert.equal(db.profile.subscriptionTier, "essentials")
      assert.deepEqual(result.result, { redirectUrl: "https://paidsoon.test/dashboard/settings/subscription?cancellation=ended" })
    })
    test("cancel portal freezes exact flow/period redirect and never cancels the subscription", async () => {
      await runIntent({ kind: "cancel" })
      assert.deepEqual(calls, [{ method: "portal.create", target: null, key: `billing/${rootId}/cancel_portal_create`, params: {
        customer: "cus_1", return_url: "https://paidsoon.test/dashboard/settings/subscription", flow_data: {
          type: "subscription_cancel", subscription_cancel: { subscription: "sub_1" }, after_completion: {
            type: "redirect", redirect: { return_url: `https://paidsoon.test/dashboard/settings/subscription?cancellation=scheduled&cancelAt=${encodeURIComponent(new Date(1900000000000).toISOString())}` },
          },
        },
      } }])
      assert.equal(db.profile.subscriptionStatus, "past_due"); assert.equal(db.profile.subscriptionCancelAtPeriodEnd, false)
    })
    test("cancel portal retains the existing recorded-period fallback when invoice has no end", async () => {
      provider.latest_invoice = null; db.profile.subscriptionCurrentPeriodEnd = new Date("2026-12-01T00:00:00Z")
      await runIntent({ kind: "cancel" })
      const params = calls[0].params as Stripe.BillingPortal.SessionCreateParams
      assert.ok(params.flow_data?.after_completion?.redirect?.return_url.includes("cancelAt=2026-12-01T00%3A00%3A00.000Z"))
    })
    test("general portal has no unsupported metadata/retrieve and does not change lifecycle", async () => {
      await runIntent({ kind: "portal" })
      assert.deepEqual(calls, [{ method: "portal.create", target: null, key: `billing/${rootId}/portal_create`,
        params: { customer: "cus_1", return_url: "https://paidsoon.test/dashboard/settings/subscription" } }])
      assert.equal(db.profile.subscriptionStatus, "past_due"); assert.equal(db.profile.pendingBillingMutationId, null)
    })
    test("customer prerequisite is keyed, verified and atomically handed off before root creation", async () => {
      db.profile.stripeCustomerId = null; db.profile.stripeSubscriptionId = null; listed = [[]]
      const accepted = await acceptIntent({ kind: "checkout", tier: "small_business" }), child = api.billingCustomerPrerequisiteId(rootId)
      assert.equal(db.profile.pendingBillingMutationId, child)
      assert.equal(db.operations.find((row) => row.id === rootId)?.executionVersion, null)
      await executor.execute(tenant, accepted.reservedOperationId!, "executor")
      assert.deepEqual(calls[0], { method: "customer.create", target: null, key: `billing/${child}/customer_create`,
        params: { email: "owner@example.test", metadata: { userId: tenant, operationId: child } } })
      assert.equal((calls[1].params as Stripe.Checkout.SessionCreateParams).customer, "cus_new")
      assert.equal(db.profile.stripeCustomerId, "cus_new"); assert.equal(db.profile.billingAccessVersion, 10)
      assert.equal(db.operations.find((row) => row.id === child)?.status, "succeeded")
      assert.equal(calls.length, 2)
    })
    test("portal shares the same customer prerequisite without parallel unkeyed creation", async () => {
      db.profile.stripeCustomerId = null; db.profile.stripeSubscriptionId = null
      await runIntent({ kind: "portal" })
      assert.equal(calls[0].method, "customer.create"); assert.equal(calls[1].method, "portal.create")
      assert.equal((calls[1].params as Stripe.BillingPortal.SessionCreateParams).customer, "cus_new")
    })
    test("all paginated subscriptions are examined; a unique discovered supported subscription binds before upgrade", async () => {
      db.profile.stripeSubscriptionId = null
      listed = [[{ id: "sub_old", status: "canceled" }], [structuredClone(provider)]]
      await runIntent({ kind: "checkout", tier: "small_business" })
      assert.deepEqual(listCalls, [{ customer: "cus_1", status: "all", limit: 100 },
        { customer: "cus_1", status: "all", limit: 100, starting_after: "sub_old" }])
      assert.equal(db.profile.stripeSubscriptionId, "sub_1"); assert.equal(calls[0].method, "subscription.update")
      assert.equal(db.profile.billingAccessVersion, 10)
    })
    test("ambiguous, paused, mismatched, unknown-price, multi-item and nonmonthly discovery fail closed without duplicate creation", async () => {
      const original = structuredClone(provider)
      for (const change of [
        { status: "paused" }, { customer: "cus_foreign" }, { metadata: { userId: foreign } },
        { items: { has_more: true, data: [] } },
        { items: { has_more: false, data: [{ price: { id: "unknown" } }] } },
        { items: { has_more: false, data: [{ price: { id: "price_control", type: "recurring", recurring: { interval: "year", interval_count: 1 } } }] } },
      ]) {
        provider = { ...original, ...change }; listed = [[provider]]; listCalls = []
        await assert.rejects(acceptIntent({ kind: "checkout", tier: "small_business" }))
      }
      provider = original; listed = [[provider], [{ ...provider, id: "sub_other" }]]; listCalls = []
      await assert.rejects(acceptIntent({ kind: "checkout", tier: "small_business" }), conflict("billing_ambiguous_subscriptions"))
      assert.equal(calls.length, 0); assert.equal(db.operations.length, 0)
    })
    test("schedule create/update freeze exact prices, quantities, invoice boundary and returned start with distinct keys", async () => {
      provider.status = "active"; listed = [[provider]]
      const result = await runIntent({ kind: "downgrade", tier: "essentials" })
      assert.deepEqual(calls, [
        { method: "schedule.create", target: null, key: `billing/${rootId}/schedule_create`, params: { from_subscription: "sub_1" } },
        { method: "schedule.update", target: "sched_1", key: `billing/${rootId}/schedule_phase_update`, params: {
          phases: [{ start_date: 1800000000, items: [{ price: "price_control", quantity: 1 }], end_date: 1900000000 },
            { items: [{ price: "price_essentials", quantity: 1 }] }], metadata: { userId: tenant, operationId: rootId },
        } },
      ])
      assert.equal(db.profile.pendingDowngradeTier, "essentials"); assert.equal(db.profile.subscriptionTier, "business_control")
      assert.deepEqual(result.result, { scheduledAt: new Date(1900000000000).toISOString() })
    })
    test("stored trialing subscription downgrade preserves existing schedule behavior rather than forcing paid active", async () => {
      provider.status = "trialing"; listed = [[provider]]
      await runIntent({ kind: "downgrade", tier: "essentials" })
      assert.equal(db.profile.subscriptionStatus, "trialing")
      assert.equal(calls[0].method, "schedule.create"); assert.equal(calls[1].method, "schedule.update")
      assert.equal((db.operations[0].normalizedInput as Row).subscriptionItemId, "si_1")
    })
    test("portal cannot create a new customer for an inconsistent stored subscription/customer binding", async () => {
      db.profile.stripeCustomerId = null
      await assert.rejects(acceptIntent({ kind: "portal" }), conflict("billing_binding_conflict"))
      assert.equal(calls.length, 0); assert.equal(db.operations.length, 0); assert.equal(customerReads, 0)
    })
    test("crash between schedule calls resumes durable create proof even after start/config drift, never duplicates create", async () => {
      provider.status = "active"; listed = [[provider]]; crashAfterCreate = true
      await assert.rejects(runIntent({ kind: "downgrade", tier: "essentials" }), /crash between/)
      assert.equal(calls.length, 1); assert.equal(db.steps[0].status, "succeeded"); assert.equal(db.profile.pendingBillingMutationId, rootId)
      process.env.STRIPE_STARTER_PRICE_ID = "new_price"; process.env.STRIPE_SOLO_PRICE_ID = "new_control"
      process.env.NEXT_PUBLIC_APP_URL = "https://new.test"; schedule.phases = [{ start_date: 1850000000 }]
      time = new Date(time.getTime() + 60001); crashAfterCreate = false
      const replay = await acceptIntent({ kind: "downgrade", tier: "essentials" })
      await executor.execute(tenant, replay.reservedOperationId!, "replacement")
      assert.equal(calls.length, 2); assert.equal(calls[1].method, "schedule.update")
      const phase = (calls[1].params as Stripe.SubscriptionScheduleUpdateParams).phases![0]
      assert.equal(phase.start_date, 1800000000); assert.equal(phase.items[0].price, "price_control")
      assert.equal(db.profile.pendingDowngradeTier, "essentials")
    })
    test("schedule release passes an empty immutable request plus its key and never cancels or resumes", async () => {
      db.profile.stripeScheduleId = "sched_1"; db.profile.pendingDowngradeTier = "essentials"
      const result = await runIntent({ kind: "undo_downgrade" })
      assert.deepEqual(calls, [{ method: "schedule.release", target: "sched_1", params: {}, key: `billing/${rootId}/schedule_release` }])
      assert.deepEqual(result.result, { cancelled: true }); assert.equal(db.profile.stripeScheduleId, null)
      assert.equal(db.profile.subscriptionStatus, "past_due"); assert.equal(db.profile.pendingDowngradeTier, null)
    })
    test("missing returned schedule phase start preserves the existing omitted-start parameter shape", async () => {
      provider.status = "active"; listed = [[provider]]
      schedule.phases = [{ items: [{ price: "price_control", quantity: 1 }] }]
      await runIntent({ kind: "downgrade", tier: "essentials" })
      assert.equal("start_date" in (calls[1].params as Stripe.SubscriptionScheduleUpdateParams).phases![0], false)
    })
    test("phase-update uncertain replay uses its already frozen request/key and never reruns schedule create", async () => {
      provider.status = "active"; listed = [[provider]]
      const original = mockStripe.subscriptionSchedules.update
      mockStripe.subscriptionSchedules.update = async (...args) => {
        mutationError = { type: "StripeAPIError", statusCode: 500 }
        return original(...args)
      }
      await assert.rejects(runIntent({ kind: "downgrade", tier: "essentials" }))
      const firstPhaseCall = structuredClone(calls[1]), firstAttempt = db.steps[1].firstAttemptAt
      process.env.STRIPE_STARTER_PRICE_ID = "changed"; schedule.phases = [{ start_date: 1850000000 }]
      mockStripe.subscriptionSchedules.update = original; mutationError = undefined; time = new Date(time.getTime() + 60001)
      await executor.execute(tenant, rootId, "replacement")
      assert.deepEqual(calls[2], firstPhaseCall); assert.deepEqual(db.steps[1].firstAttemptAt, firstAttempt)
      assert.equal(calls.filter((call) => call.method === "schedule.create").length, 1)
    })
    test("customer lost response retains the child, and exact keyed replay uses frozen email/metadata then hands off", async () => {
      db.profile.stripeCustomerId = null; db.profile.stripeSubscriptionId = null
      const accepted = await acceptIntent({ kind: "portal" })
      mutationError = new Error("connection lost")
      await assert.rejects(executor.execute(tenant, accepted.reservedOperationId!, "executor"))
      const first = structuredClone(calls[0]); assert.equal(db.profile.pendingBillingMutationId, accepted.reservedOperationId)
      time = new Date(time.getTime() + 60001); mutationError = undefined
      const replay = await executor.accept({ operationId: rootId, expectedVersion: 0, intent: { kind: "portal" },
        profile: fixtureProfile(), email: "changed@example.test" })
      await executor.execute(tenant, replay.reservedOperationId!, "replacement")
      assert.deepEqual(calls[1], first); assert.equal(calls[2].method, "portal.create")
    })
    test("final upgrade projection is from the final current subscription, not even the returned requested price", async () => {
      const original = mockStripe.subscriptions.retrieve
      mockStripe.subscriptions.retrieve = async (...args) => {
        if (calls.length && subscriptionReads >= 2) {
          provider.status = "unpaid"; provider.items = { has_more: false, data: [{ price: { id: "price_control" } }] }
        }
        return original(...args)
      }
      await runIntent({ kind: "checkout", tier: "small_business" })
      assert.equal(db.profile.subscriptionStatus, "unpaid"); assert.equal(db.profile.subscriptionTier, "business_control")
    })
    test("provider success followed by failed proof commit retains its attempt and reservation, not false success", async () => {
      const original = mockStripe.billingPortal.sessions.create
      mockStripe.billingPortal.sessions.create = async (...args) => {
        const response = await original(...args); db.failCommit = true; return response
      }
      await assert.rejects(runIntent({ kind: "portal" }), /mock commit failure/)
      assert.equal(calls.length, 1); assert.equal(db.profile.pendingBillingMutationId, rootId)
      assert.equal(db.steps[0].attempts, 1); assert.equal(db.steps[0].providerResult, null)
      assert.equal(db.operations[0].result, null)
    })
    test("exact first-step replay and terminal replay ignore configuration drift and do not change a key's parameters", async () => {
      db.profile.stripeSubscriptionId = null; listed = [[]]
      const accepted = await acceptIntent({ kind: "checkout", tier: "small_business" })
      mutationError = { type: "StripeAPIError", statusCode: 500 }
      await assert.rejects(executor.execute(tenant, accepted.reservedOperationId!, "executor"))
      const first = structuredClone(calls[0])
      process.env.NEXT_PUBLIC_APP_URL = "https://changed.test"; process.env.STRIPE_SMALL_BUSINESS_PRICE_ID = "changed_price"
      process.env.STRIPE_TRIAL_PERIOD_DAYS = "7"; mutationError = undefined; time = new Date(time.getTime() + 60001)
      const replay = await acceptIntent({ kind: "checkout", tier: "small_business" })
      await executor.execute(tenant, replay.reservedOperationId!, "replacement")
      assert.deepEqual(calls[1], first)
      const terminal = await acceptIntent({ kind: "checkout", tier: "small_business" })
      assert.equal(terminal.reservedOperationId, null); assert.equal(terminal.operation.status, "succeeded")
      assert.deepEqual(terminal.operation.result, { url: "https://checkout.stripe.test/cs_1" }); assert.equal(calls.length, 2)
      await assert.rejects(acceptIntent({ kind: "checkout", tier: "essentials" }), conflict("billing_operation_key_conflict"))
    })
    for (const error of [new Error("timeout"), { type: "StripeConnectionError" }, { type: "StripeAPIError", statusCode: 500 },
      { type: "StripeCardError", statusCode: 402 }, { type: "StripeInvalidRequestError", statusCode: 409 }]) {
      test(`conservative provider failure retains the reservation (${JSON.stringify(error)})`, async () => {
        mutationError = error
        await assert.rejects(runIntent({ kind: "portal" }))
        assert.equal(db.profile.pendingBillingMutationId, rootId); assert.equal(db.operations[0].status, "reconciliation_required")
        assert.equal(calls.length, 1)
      })
    }
    test("definitive provider validation rejection closes a no-effect root, but successful prerequisite makes it partial", async () => {
      mutationError = { type: "StripeInvalidRequestError", statusCode: 400, requestId: "req_invalid" }
      await assert.rejects(runIntent({ kind: "portal" }))
      assert.equal(db.profile.pendingBillingMutationId, null); assert.equal(db.operations[0].status, "failed")
      db = new JournalDatabaseMock(); db.profile.stripeCustomerId = null; db.profile.stripeSubscriptionId = null
      coordinator = api.createTenantBillingMutationCoordinator({ transaction: db.transaction, now: () => new Date(time) })
      executor = executorsApi.createCustomerBillingExecutors({ stripe: mockStripe, coordinator })
      mutationError = undefined
      const originalCreate = mockStripe.billingPortal.sessions.create
      mockStripe.billingPortal.sessions.create = async (...args) => {
        mutationError = { type: "StripeInvalidRequestError", statusCode: 400, requestId: "req_invalid" }
        return originalCreate(...args)
      }
      await assert.rejects(runIntent({ kind: "portal" }), conflict("billing_partial_outcome"))
      assert.equal(db.profile.pendingBillingMutationId, rootId); assert.equal(db.operations.find((row) => row.id === rootId)?.status, "reconciliation_required")
    })
    test("phase rejection after successful schedule creation remains reserved without automatic release", async () => {
      provider.status = "active"; listed = [[provider]]
      const original = mockStripe.subscriptionSchedules.update
      mockStripe.subscriptionSchedules.update = async (...args) => {
        mutationError = { type: "StripeInvalidRequestError", statusCode: 400, requestId: "req_invalid" }
        return original(...args)
      }
      await assert.rejects(runIntent({ kind: "downgrade", tier: "essentials" }), conflict("billing_partial_outcome"))
      assert.deepEqual(calls.map((call) => call.method), ["schedule.create", "schedule.update"])
      assert.equal(db.profile.pendingBillingMutationId, rootId); assert.equal(db.operations[0].status, "reconciliation_required")
      assert.equal(db.steps[1].status, "failed")
    })
    test("customer handoff failure keeps verified child reserved and resumes it without a second create", async () => {
      db.profile.stripeCustomerId = null; db.profile.stripeSubscriptionId = null
      const accepted = await acceptIntent({ kind: "portal" }), child = accepted.reservedOperationId!
      const original = coordinator.handoff
      const interrupted = executorsApi.createCustomerBillingExecutors({ stripe: mockStripe, coordinator: {
        ...coordinator, handoff: async () => { throw new Error("crash before handoff commit") },
      } })
      await assert.rejects(interrupted.execute(tenant, child, "executor"), /crash before handoff/)
      assert.equal(db.profile.pendingBillingMutationId, child); assert.equal(db.steps[0].status, "succeeded")
      assert.equal(db.profile.stripeCustomerId, null)
      assert.ok(original); time = new Date(time.getTime() + 60001)
      await executor.execute(tenant, child, "replacement")
      assert.deepEqual(calls.map((call) => call.method), ["customer.create", "portal.create"])
      assert.equal(db.profile.stripeCustomerId, "cus_new")
    })
    test("proof mismatch cannot finalize a created session or project requested billing state", async () => {
      db.profile.stripeSubscriptionId = null; listed = [[]]
      mockStripe.checkout.sessions.retrieve = async () => ({ ...checkout, metadata: { userId: foreign } }) as unknown as Stripe.Response<Stripe.Checkout.Session>
      await assert.rejects(runIntent({ kind: "checkout", tier: "small_business" }), conflict("billing_owner_evidence_conflict"))
      assert.equal(db.profile.pendingBillingMutationId, rootId); assert.equal(db.steps[0].status, "reconciliation_required")
      assert.equal(db.profile.subscriptionTier, "business_control")
    })
    test("local known-unsent and explicit 400 validation classify definitive; plain 400/cached500/idempotency conflicts stay uncertain", () => {
      assert.equal(executorsApi.classifyBillingProviderFailure(new executorsApi.KnownUnsentBillingError()), "definitive")
      assert.equal(executorsApi.classifyBillingProviderFailure({ type: "StripeInvalidRequestError", statusCode: 400, requestId: "req" }), "definitive")
      for (const error of [{ statusCode: 400 }, { type: "StripeInvalidRequestError", statusCode: 500, requestId: "req" },
        { type: "StripeInvalidRequestError", statusCode: 400, requestId: "req", code: "idempotency_key_in_use" }]) {
        assert.equal(executorsApi.classifyBillingProviderFailure(error), "uncertain")
      }
    })

    describe("task 3.6 actual mutation routes through real journal, executors and projections", () => {
      type Route = (request: Request) => Promise<Response>
      let checkoutPost: Route, portalPost: Route, cancelPost: Route, downgradePost: Route, downgradeDelete: Route
      let reconcilePost: typeof import("@/app/api/billing/operations/[operationId]/reconcile/route").POST
      before(async () => {
        await mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({ auth: {
          getUser: async () => ({ data: { user: { id: tenant, email: "owner@example.test" } }, error: null }),
        } }) } })
        await mock.module("@/lib/actions/auth", { namedExports: { createUserProfile: () => assert.fail("present profile never bootstrapped") } })
        await mock.module("@/lib/db/withUserContext", { namedExports: {
          withUserContext: async (id: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
            assert.equal(id, tenant)
            return run({ userProfile: { findUnique: async () => fixtureProfile(),
              update: () => assert.fail("RLS billing write forbidden") } } as unknown as Prisma.TransactionClient)
          },
        } })
        ;({ POST: checkoutPost } = await import("@/app/api/billing/checkout/route"))
        ;({ POST: portalPost } = await import("@/app/api/billing/portal/route"))
        ;({ POST: cancelPost } = await import("@/app/api/billing/cancel/route"))
        ;({ POST: downgradePost, DELETE: downgradeDelete } = await import("@/app/api/billing/downgrade/route"))
        ;({ POST: reconcilePost } = await import("@/app/api/billing/operations/[operationId]/reconcile/route"))
      })
      beforeEach(() => { routeStripe = mockStripe })
      const req = (body = "", method = "POST", id = rootId, version = "7") => new Request("https://paidsoon.test/api/billing/mutation", {
        method, body: body || undefined, headers: { origin: "https://paidsoon.test", "idempotency-key": id, "x-billing-access-version": version },
      })
      const ok = async (route: Route, body = "", method = "POST") => {
        const res = await route(req(body, method)); assert.equal(res.status, 200, JSON.stringify(await res.clone().json())); return res.json()
      }
      test("new Checkout creates root+child, binds verified customer and releases open-session reservation", async () => {
        db.profile.stripeCustomerId = null; db.profile.stripeSubscriptionId = null; listed = [[]]
        assert.deepEqual(await ok(checkoutPost, '{"tier":"small_business"}'), { url: "https://checkout.stripe.test/cs_1" })
        assert.deepEqual(calls.map((call) => call.method), ["customer.create", "checkout.create"])
        assert.equal(db.operations.length, 2); assert.equal(db.operations[0].action, "checkout_create")
        assert.equal(db.operations[1].parentMutationId, rootId); assert.equal(db.profile.stripeCustomerId, "cus_new")
        assert.equal(db.profile.stripeSubscriptionId, null); assert.equal(db.profile.pendingBillingMutationId, null)
        assert.ok(db.operations.every((op) => op.status === "succeeded"))
      })
      test("existing-customer Checkout uses no customer create and replays original result before version/config reads", async () => {
        db.profile.stripeSubscriptionId = null; listed = [[]]
        const original = await ok(checkoutPost, '{"tier":"solo"}')
        const frozen = structuredClone(db.operations[0])
        process.env.NEXT_PUBLIC_APP_URL = "https://changed.test"; process.env.STRIPE_SOLO_PRICE_ID = "changed_price"
        process.env.STRIPE_TRIAL_PERIOD_DAYS = "30"
        mockStripe.customers.retrieve = async () => assert.fail("retry must not re-read provider")
        const replay = await checkoutPost(req('{"tier":"business_control"}', "POST", rootId, "0"))
        assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), original)
        assert.equal(calls.length, 1); assert.deepEqual(db.operations[0], frozen)
      })
      test("upgrade uses actual Stripe plan instead of stale local or grant tier and never synthesizes active", async () => {
        db.profile.subscriptionTier = "business_pro"; db.profile.independentGrant = { plan: "business_pro" }
        assert.deepEqual(await ok(checkoutPost, '{"tier":"small_business"}'), {
          url: "https://paidsoon.test/dashboard/settings/subscription?success=upgraded&tier=small_business",
        })
        assert.equal(calls[0].method, "subscription.update"); assert.equal(db.profile.subscriptionTier, "small_business")
        assert.equal(db.profile.subscriptionStatus, "past_due"); assert.equal(db.profile.pendingBillingMutationId, null)
        assert.deepEqual(db.profile.independentGrant, { plan: "business_pro" })
      })
      test("actual paid plan prevents a hidden downgrade via Checkout despite stale local tier", async () => {
        db.profile.subscriptionTier = "essentials"
        const res = await checkoutPost(req('{"tier":"essentials"}'))
        assert.equal(res.status, 400); assert.equal(calls.length, 0); assert.equal(db.operations.length, 0)
      })
      test("root identity hashes normalized business intent, not a regenerated price/URL/trial configuration", async () => {
        db.profile.stripeSubscriptionId = null; listed = [[]]
        await ok(checkoutPost, '{"tier":"solo"}')
        const plan = db.operations[0].normalizedInput as JsonInput
        assert.equal(db.operations[0].inputHash, api.billingMutationInputHash("checkout_create", { kind: "checkout", tier: "business_control" }))
        assert.equal(db.operations[0].inputHash, api.billingMutationInputHash("checkout_create", {
          ...(plan as Record<string, JsonInput>), returnUrl: "https://different.test/return", trialDays: 30,
        }))
      })
      test("duplicate customer binding owned by another profile conflicts before any provider mutation", async () => {
        customerMetadata = {}
        db.extraProfiles = [{ userId: foreign, stripeCustomerId: "cus_1" }]
        const res = await portalPost(req()); assert.equal(res.status, 409)
        assert.deepEqual(await res.json(), { error: "billing_conflict" })
        assert.equal(calls.length, 0); assert.equal(db.operations.length, 0)
      })
      test("foreign customer/subscription metadata and ambiguous subscriptions cannot bind or dispatch", async () => {
        customerMetadata = { userId: foreign }
        assert.equal((await checkoutPost(req('{"tier":"small_business"}'))).status, 409)
        customerMetadata = { userId: tenant }; provider.metadata = { userId: foreign }
        assert.equal((await checkoutPost(req('{"tier":"small_business"}'))).status, 409)
        provider.metadata = { userId: tenant }; listed = [[provider, { ...provider, id: "sub_other" }]]
        assert.equal((await checkoutPost(req('{"tier":"small_business"}'))).status, 409)
        assert.equal(calls.length, 0); assert.equal(db.operations.length, 0)
      })
      test("fresh unknown/stale versions fail before provider reads, but completed own intent ignores today's version", async () => {
        assert.equal((await portalPost(req("", "POST", rootId, "6"))).status, 409)
        assert.equal(customerReads, 0); assert.equal(calls.length, 0)
        await ok(portalPost)
        assert.equal((await portalPost(req("", "POST", rootId, "0"))).status, 200)
        assert.equal(calls.length, 1)
      })
      test("discovered subscription binds inside the root reservation before upgrade, never through customer role", async () => {
        db.profile.stripeSubscriptionId = null
        await ok(checkoutPost, '{"tier":"small_business"}')
        assert.equal(db.profile.stripeSubscriptionId, "sub_1"); assert.equal(db.profile.billingAccessVersion, 10)
        assert.equal(db.operations[0].stripeSubscriptionId, "sub_1"); assert.equal(calls[0].method, "subscription.update")
      })
      for (const customerMissing of [false, true]) test(`portal journals keyed creation with customerMissing=${customerMissing}`, async () => {
        if (customerMissing) { db.profile.stripeCustomerId = null; db.profile.stripeSubscriptionId = null }
        assert.deepEqual(await ok(portalPost), { url: "https://billing.stripe.test/bps_1" })
        assert.equal(calls.length, customerMissing ? 2 : 1)
        assert.equal(calls.at(-1)?.method, "portal.create"); assert.equal(db.profile.pendingBillingMutationId, null)
        assert.equal(db.operations[0].action, "portal_create")
      })
      test("local cancellation keeps original redirect, clears onboarding expiry and preserves grant/risk/invoice sequences", async () => {
        db.profile.stripeSubscriptionId = null
        db.profile.independentGrant = { plan: "small_business", expiresAt: "2027-01-01" }
        db.profile.risk = { blocking: true }; db.profile.invoiceSequence = { stage: 2, paused: false }
        const before = structuredClone(db.profile)
        assert.deepEqual(await ok(cancelPost), { redirectUrl: "https://paidsoon.test/dashboard/settings/subscription?cancellation=ended" })
        assert.equal(calls.length, 0); assert.equal(customerReads, 0); assert.equal(subscriptionReads, 0)
        assert.equal(db.profile.trialEndsAt, null); assert.equal(db.profile.subscriptionStatus, "canceled")
        for (const key of ["independentGrant", "risk", "invoiceSequence"]) assert.deepEqual(db.profile[key], before[key])
      })
      for (const discovered of [false, true]) test(`subscription cancellation only creates portal, discovered=${discovered}`, async () => {
        db.profile.subscriptionStatus = "active"
        if (discovered) db.profile.stripeSubscriptionId = null
        assert.deepEqual(await ok(cancelPost), { url: "https://billing.stripe.test/bps_1" })
        assert.deepEqual(calls.map((call) => call.method), ["portal.create"])
        assert.equal(db.operations[0].action, "cancel_portal_create"); assert.equal(db.profile.stripeSubscriptionId, "sub_1")
        assert.equal(db.profile.subscriptionStatus, "past_due"); assert.equal(db.profile.subscriptionCancelAtPeriodEnd, false)
      })
      test("downgrade POST uses actual price/period and durable create then phases; DELETE only releases", async () => {
        provider.status = "active"; listed = [[provider]]; db.profile.subscriptionTier = "essentials"
        assert.deepEqual(await ok(downgradePost, '{"tier":"starter"}'), { scheduledAt: new Date(1900000000000).toISOString() })
        assert.deepEqual(calls.map((call) => call.method), ["schedule.create", "schedule.update"])
        assert.equal(db.profile.subscriptionTier, "business_control"); assert.equal(db.profile.pendingDowngradeTier, "essentials")
        const res = await downgradeDelete(req("", "DELETE", nextId, String(db.profile.billingAccessVersion)))
        assert.equal(res.status, 200); assert.deepEqual(await res.json(), { cancelled: true })
        assert.equal(calls.at(-1)?.method, "schedule.release"); assert.equal(db.profile.pendingDowngradeTier, null)
      })
      test("downgrade discovery binds verified active subscription in reservation before either keyed step", async () => {
        provider.status = "active"; listed = [[provider]]; db.profile.stripeSubscriptionId = null
        await ok(downgradePost, '{"tier":"essentials"}')
        assert.equal(db.profile.stripeSubscriptionId, "sub_1"); assert.equal(db.profile.billingAccessVersion, 10)
        assert.deepEqual(calls.map((call) => call.method), ["schedule.create", "schedule.update"])
      })
      test("owner/customer reservations and reused foreign/action/hash keys all uniformly conflict without mutations", async () => {
        const actions: [Route, string, string][] = [[checkoutPost, '{"tier":"small_business"}', "POST"], [portalPost, "", "POST"],
          [cancelPost, "", "POST"], [downgradePost, '{"tier":"essentials"}', "POST"], [downgradeDelete, "", "DELETE"]]
        db.profile.stripeScheduleId = "sched_1"
        for (const reservation of ["pendingTrialOperationId", "pendingBillingMutationId"]) {
          db.profile[reservation] = nextId
          for (const [route, body, method] of actions) {
            const res = await route(req(body, method)); assert.equal(res.status, 409); assert.deepEqual(await res.json(), { error: "billing_conflict" })
          }
          db.profile[reservation] = null
        }
        assert.equal(calls.length, 0)
        await ok(portalPost)
        for (const [route, body, method] of [actions[0], actions[2], actions[3], actions[4]]) {
          const res = await route(req(body, method)); assert.equal(res.status, 409); assert.deepEqual(await res.json(), { error: "billing_conflict" })
        }
        db.operations[0].userId = foreign
        const res = await portalPost(req()); assert.equal(res.status, 409); assert.deepEqual(await res.json(), { error: "billing_conflict" })
        assert.equal(calls.length, 1)
      })
      test("changed normalized plan conflicts but aliases of the accepted plan replay", async () => {
        db.profile.stripeSubscriptionId = null; listed = [[]]
        await ok(checkoutPost, '{"tier":"solo"}')
        const res = await checkoutPost(req('{"tier":"small_business"}'))
        assert.equal(res.status, 409); assert.deepEqual(await res.json(), { error: "billing_conflict" }); assert.equal(calls.length, 1)
      })
      test("initial persistence failure is503 and cannot dispatch", async () => {
        db.failWrite = "operations"
        const res = await portalPost(req()); assert.equal(res.status, 503)
        assert.equal(db.operations.length, 0); assert.equal(calls.length, 0)
      })
      test("initial verification failure is503, never customer/session mutation", async () => {
        mockStripe.customers.retrieve = async () => { throw new Error("provider unavailable") }
        const res = await portalPost(req()); assert.equal(res.status, 503); assert.equal(calls.length, 0); assert.equal(db.operations.length, 0)
      })
      test("definitive first-step rejection returns502 and terminal retry never starts a replacement", async () => {
        mutationError = { type: "StripeInvalidRequestError", statusCode: 400, requestId: "req_rejected" }
        const res = await portalPost(req()); assert.equal(res.status, 502); assert.deepEqual(await res.json(), { error: "billing_provider_rejected" })
        assert.equal(db.operations[0].status, "failed"); assert.equal(db.profile.pendingBillingMutationId, null)
        mutationError = undefined
        assert.equal((await portalPost(req())).status, 502); assert.equal(calls.length, 1)
      })
      test("unknown timeout returns safe202; identical retry only observes, explicit recovery reuses original step/key", async () => {
        mutationError = new Error("private owner@example.test provider key payload")
        const first = await portalPost(req()); assert.equal(first.status, 202)
        const safe = await first.json()
        assert.deepEqual(Object.keys(safe).sort(), ["operationId", "action", "status", "result", "failureCode", "reconciliationRequired", "canReconcile", "createdAt", "completedAt", "statusUrl"].sort())
        assert.equal(safe.operationId, rootId); assert.equal(safe.statusUrl, `/api/billing/operations/${rootId}`)
        assert.equal(safe.reconciliationRequired, true); assert.equal(db.profile.pendingBillingMutationId, rootId)
        mutationError = undefined
        const replay = await portalPost(req("", "POST", rootId, "0")); assert.equal(replay.status, 202); assert.equal(calls.length, 1)
        db.operations[0].leaseExpiresAt = new Date(0)
        const recovered = await reconcilePost(new Request("https://paidsoon.test/api/billing/operations/reconcile", {
          method: "POST", body: "{}", headers: { origin: "https://paidsoon.test" },
        }), { params: Promise.resolve({ operationId: rootId }) })
        assert.equal(recovered.status, 200); assert.deepEqual(await recovered.json(), { url: "https://billing.stripe.test/bps_1" })
        assert.equal(calls.length, 2); assert.deepEqual(calls[1], calls[0]); assert.equal(db.profile.pendingBillingMutationId, null)
      })
      test("success followed by result-write failure returns202 with durable attempt and no replacement on retry", async () => {
        const original = mockStripe.billingPortal.sessions.create
        mockStripe.billingPortal.sessions.create = async (...args) => { const returned = await original(...args); db.failWrite = "steps"; return returned }
        assert.equal((await portalPost(req())).status, 202); db.failWrite = undefined
        assert.ok(db.steps[0].firstAttemptAt); assert.equal(db.profile.pendingBillingMutationId, rootId)
        assert.equal((await portalPost(req())).status, 202); assert.equal(calls.length, 1)
      })
      test("customer success plus rejected root is partial202, not safe502 or permission to create again", async () => {
        db.profile.stripeCustomerId = null; db.profile.stripeSubscriptionId = null; listed = [[]]
        mockStripe.checkout.sessions.create = async (params, options) => {
          invoke("checkout.create", null, params, options!)
          throw { type: "StripeInvalidRequestError", statusCode: 400, requestId: "req_checkout_rejected" }
        }
        const res = await checkoutPost(req('{"tier":"small_business"}')); assert.equal(res.status, 202)
        assert.equal(db.operations[1].status, "succeeded"); assert.equal(db.profile.pendingBillingMutationId, rootId)
        assert.equal((await checkoutPost(req('{"tier":"small_business"}'))).status, 202); assert.equal(calls.length, 2)
      })
      test("schedule success plus phase rejection stays reserved202 with no compensating release", async () => {
        provider.status = "active"; listed = [[provider]]
        mockStripe.subscriptionSchedules.update = async (id, params, options) => {
          invoke("schedule.update", id, params, options!)
          throw { type: "StripeInvalidRequestError", statusCode: 400, requestId: "req_phase_rejected" }
        }
        const res = await downgradePost(req('{"tier":"essentials"}')); assert.equal(res.status, 202)
        assert.equal(db.steps[0].status, "succeeded"); assert.equal(db.steps[1].status, "failed")
        assert.equal(db.profile.pendingBillingMutationId, rootId); assert.deepEqual(calls.map((call) => call.method), ["schedule.create", "schedule.update"])
      })
    })

    describe("task 3.12 one-attempt evidence recovery through the real coordinator", () => {
      let operations: typeof import("@/lib/billing/customerBillingOperations")
      const expireLease = () => { time = new Date(time.getTime() + 60001) }
      const recover = () => executor.recover(tenant, rootId, "explicit-recovery")
      const service = () => operations.createCustomerBillingOperations({ coordinator, executors: executor, now: () => new Date(time) })
      // SDK list promises add auto-paging methods. These tests exercise explicit pages only.
      const pageResult = <T>(value: { data: T[]; has_more: boolean }): Stripe.ApiListPromise<T> =>
        Promise.resolve(value) as unknown as Stripe.ApiListPromise<T>
      before(async () => { operations = await import("@/lib/billing/customerBillingOperations") })
      beforeEach(() => {
        mockStripe.customers.list = () => pageResult({ data: [], has_more: false })
        mockStripe.checkout.sessions.list = () => pageResult({ data: [], has_more: false })
        mockStripe.subscriptionSchedules.list = () => pageResult({ data: [], has_more: false })
      })
      async function uncertainPortal(): Promise<void> {
        mutationError = new Error("lost response")
        await assert.rejects(runIntent({ kind: "portal" }))
        mutationError = undefined; expireLease()
      }
      async function lostCheckout(): Promise<void> {
        db.profile.stripeSubscriptionId = null; listed = [[]]
        const original = mockStripe.checkout.sessions.create
        mockStripe.checkout.sessions.create = async (...args) => {
          const result = await original(...args); throw Object.assign(new Error("response lost"), { discardedResult: result })
        }
        await assert.rejects(runIntent({ kind: "checkout", tier: "small_business" }))
        mockStripe.checkout.sessions.create = original; expireLease()
      }
      test("terminal status/reconcile are read-only and replay the original URL without claim or provider calls", async () => {
        await runIntent({ kind: "portal" }); const snapshot = structuredClone(db.operations)
        mockStripe.customers.retrieve = async () => assert.fail("terminal must not read provider")
        const result = await service().reconcile(tenant, rootId)
        assert.deepEqual(result, { httpStatus: 200, body: { url: "https://billing.stripe.test/bps_1" } })
        assert.deepEqual(db.operations, snapshot); assert.equal(calls.length, 1)
        const safe = await service().status(tenant, rootId)
        assert.equal(safe.canReconcile, false); assert.equal(safe.reconciliationRequired, false)
      })
      test("live lease conflicts without a second provider mutation; stale fence cannot finalize recovered result", async () => {
        mutationError = new Error("timeout"); await assert.rejects(runIntent({ kind: "portal" }))
        assert.equal((await service().status(tenant, rootId)).canReconcile, false)
        await assert.rejects(service().reconcile(tenant, rootId), conflict("billing_execution_in_progress"))
        assert.equal(calls.length, 1)
      })
      for (const offset of [86400000 - 1, 86400000, 86400000 + 1]) test(`portal retention boundary ${offset}ms never invents retrieve or a key`, async () => {
        await uncertainPortal()
        time = new Date((db.steps[0].firstAttemptAt as Date).getTime() + offset)
        const before = structuredClone(calls[0]), state = await service().status(tenant, rootId)
        assert.equal(state.canReconcile, offset < 86400000)
        const result = await service().reconcile(tenant, rootId)
        if (offset < 86400000) {
          assert.equal(result.httpStatus, 200); assert.deepEqual(calls[1], before)
        } else {
          assert.equal(result.httpStatus, 202); assert.equal(calls.length, 1)
          assert.equal(db.profile.pendingBillingMutationId, rootId)
        }
      })
      test("cached500 is exactly one explicit replay, remains reserved and cannot be converted to rejection", async () => {
        await uncertainPortal(); mutationError = { type: "StripeAPIError", statusCode: 500 }
        const before = structuredClone(calls[0])
        const result = await service().reconcile(tenant, rootId)
        assert.equal(result.httpStatus, 202); assert.equal(calls.length, 2); assert.deepEqual(calls[1], before)
        assert.equal(db.profile.pendingBillingMutationId, rootId)
        assert.equal(db.steps[0].attempts, 2); assert.equal(db.operations[0].result, null)
      })
      test("later validation rejection is not proof that an earlier uncertain dispatch had no effect", async () => {
        await uncertainPortal(); mutationError = { type: "StripeInvalidRequestError", statusCode: 400, requestId: "req_later" }
        assert.equal((await service().reconcile(tenant, rootId)).httpStatus, 202)
        assert.equal(db.steps[0].status, "reconciliation_required"); assert.equal(db.profile.pendingBillingMutationId, rootId)
      })
      test("Checkout known ID retrieval after DB success/failure uses no replay even beyond retention", async () => {
        await lostCheckout()
        db.operations[0].stripeSessionId = "cs_1"
        time = new Date((db.steps[0].firstAttemptAt as Date).getTime() + 86400000)
        await recover()
        assert.equal(calls.length, 1); assert.equal(db.operations[0].status, "succeeded")
        assert.equal(db.steps[0].attempts, 1); assert.equal(db.profile.pendingBillingMutationId, null)
      })
      test("Checkout exhaustive customer-scoped listing finds a unique attributable object on a later page", async () => {
        await lostCheckout(); time = new Date(time.getTime() + 86400000)
        const paramsSeen: Row[] = []
        mockStripe.checkout.sessions.list = (params) => {
          paramsSeen.push(params as Row)
          return pageResult((params?.starting_after ? { data: [checkout], has_more: false }
            : { data: [{ id: "cs_other", metadata: {} }], has_more: true }) as unknown as { data: Stripe.Checkout.Session[]; has_more: boolean })
        }
        await recover()
        assert.deepEqual(paramsSeen, [{ customer: "cus_1", limit: 100 }, { customer: "cus_1", limit: 100, starting_after: "cs_other" }])
        assert.equal(calls.length, 1); assert.equal(db.operations[0].status, "succeeded")
      })
      for (const scenario of ["none", "ambiguous", "repeat", "wrong-tenant", "wrong-price", "unavailable"] as const) {
        test(`late Checkout discovery ${scenario} never proves nonexecution or blindly creates`, async () => {
          await lostCheckout(); time = new Date(time.getTime() + 86400000)
          mockStripe.checkout.sessions.list = () => {
            if (scenario === "unavailable") throw new Error("provider read unavailable")
            const data = scenario === "none" ? [] : scenario === "ambiguous" ? [checkout, { ...checkout, id: "cs_2" }]
              : scenario === "wrong-tenant" ? [{ ...checkout, metadata: { userId: foreign, operationId: rootId } }] : [checkout]
            return pageResult({ data, has_more: scenario === "repeat" } as unknown as { data: Stripe.Checkout.Session[]; has_more: boolean })
          }
          if (scenario === "wrong-price") checkout.line_items = { has_more: false, data: [{ price: "other", quantity: 1 }] }
          assert.equal((await service().reconcile(tenant, rootId)).httpStatus, 202)
          assert.equal(calls.length, 1); assert.equal(db.profile.pendingBillingMutationId, rootId)
          assert.notEqual(db.operations[0].status, "superseded")
        })
      }
      test("unknown Checkout within retention replays exact frozen params despite config drift", async () => {
        await lostCheckout(); const first = structuredClone(calls[0])
        process.env.NEXT_PUBLIC_APP_URL = "https://changed.test"; process.env.STRIPE_SMALL_BUSINESS_PRICE_ID = "changed_price"
        await recover(); assert.equal(calls.length, 2); assert.deepEqual(calls[1], first)
      })
      test("customer prerequisite discovery exhausts the correct default population, verifies metadata and hands off only own root", async () => {
        db.profile.stripeCustomerId = null; db.profile.stripeSubscriptionId = null
        const original = mockStripe.customers.create
        mockStripe.customers.create = async (...args) => { await original(...args); throw new Error("lost customer response") }
        await assert.rejects(runIntent({ kind: "portal" })); mockStripe.customers.create = original
        const child = api.billingCustomerPrerequisiteId(rootId)
        time = new Date(time.getTime() + 86400000)
        const pages: Row[] = []
        mockStripe.customers.list = (params) => {
          pages.push(params as Row)
          return pageResult((params?.starting_after ? { data: [{ id: "cus_new", metadata: customerMetadata }], has_more: false }
            : { data: [{ id: "cus_unrelated", metadata: {} }], has_more: true }) as unknown as { data: Stripe.Customer[]; has_more: boolean })
        }
        await recover()
        assert.deepEqual(pages, [{ limit: 100 }, { limit: 100, starting_after: "cus_unrelated" }])
        assert.equal(db.operations.find((row) => row.id === child)?.status, "succeeded")
        assert.equal(db.profile.stripeCustomerId, "cus_new")
        assert.deepEqual(calls.map((call) => call.method), ["customer.create", "portal.create"])
        await assert.rejects(service().status(tenant, child), conflict("billing_operation_not_found"))
      })
      test("late customer list absence keeps child reservation and never dispatches its waiting root", async () => {
        db.profile.stripeCustomerId = null; db.profile.stripeSubscriptionId = null
        mutationError = new Error("timeout"); await assert.rejects(runIntent({ kind: "portal" }))
        mutationError = undefined; time = new Date(time.getTime() + 86400000)
        assert.equal((await service().reconcile(tenant, rootId)).httpStatus, 202)
        assert.equal(db.profile.pendingBillingMutationId, api.billingCustomerPrerequisiteId(rootId))
        assert.equal(calls.length, 1); assert.equal(db.operations[0].executionVersion, null)
      })
      test("provider success followed by proof DB failure is recovered by unique Checkout discovery, not replacement", async () => {
        db.profile.stripeSubscriptionId = null; listed = [[]]
        const original = mockStripe.checkout.sessions.create
        mockStripe.checkout.sessions.create = async (...args) => { const response = await original(...args); db.failCommit = true; return response }
        await assert.rejects(runIntent({ kind: "checkout", tier: "small_business" }))
        db.failCommit = false; expireLease()
        mockStripe.checkout.sessions.list = () => pageResult({ data: [checkout] as unknown as Stripe.Checkout.Session[], has_more: false })
        await recover()
        assert.equal(calls.length, 1); assert.equal(db.operations[0].status, "succeeded")
      })
      test("durable portal proof plus failed final commit can finalize late without unsupported retrieval", async () => {
        const interrupted = executorsApi.createCustomerBillingExecutors({ stripe: mockStripe, coordinator: { ...coordinator,
          finalize: async () => { throw new Error("final commit unavailable") },
        } })
        const accepted = await acceptIntent({ kind: "portal" })
        await assert.rejects(interrupted.execute(tenant, accepted.reservedOperationId!, "executor"))
        assert.equal(db.steps[0].status, "succeeded"); time = new Date(time.getTime() + 86400000)
        assert.equal((await service().status(tenant, rootId)).canReconcile, true)
        await recover(); assert.equal(calls.length, 1); assert.equal(db.profile.pendingBillingMutationId, null)
      })
      test("interrupted schedule uses durable create proof, freezes next step once and never repeats create", async () => {
        provider.status = "active"; listed = [[provider]]; crashAfterCreate = true
        await assert.rejects(runIntent({ kind: "downgrade", tier: "essentials" }))
        crashAfterCreate = false; time = new Date(time.getTime() + 86400000)
        await recover(); assert.deepEqual(calls.map((call) => call.method), ["schedule.create", "schedule.update"])
      })
      test("unattributable unique from_subscription schedule is not creation proof; late list absence never causes recreation", async () => {
        provider.status = "active"; listed = [[provider]]
        const original = mockStripe.subscriptionSchedules.create
        mockStripe.subscriptionSchedules.create = async (...args) => { await original(...args); throw new Error("lost schedule") }
        await assert.rejects(runIntent({ kind: "downgrade", tier: "essentials" }))
        mockStripe.subscriptionSchedules.list = (params) => {
          assert.deepEqual(params, { customer: "cus_1", limit: 100 })
          return pageResult({ data: [schedule] as unknown as Stripe.SubscriptionSchedule[], has_more: false })
        }
        time = new Date(time.getTime() + 86400000)
        assert.equal((await service().reconcile(tenant, rootId)).httpStatus, 202)
        assert.equal(calls.length, 1); assert.equal(db.profile.pendingBillingMutationId, rootId)
      })
      test("known schedule release is retrieved late and verified without another release or cancellation", async () => {
        db.profile.stripeScheduleId = "sched_1"; db.profile.pendingDowngradeTier = "essentials"
        const original = mockStripe.subscriptionSchedules.release
        mockStripe.subscriptionSchedules.release = async (...args) => { await original(...args); throw new Error("lost release") }
        await assert.rejects(runIntent({ kind: "undo_downgrade" })); time = new Date(time.getTime() + 86400000)
        await recover(); assert.equal(calls.length, 1); assert.equal(db.profile.pendingDowngradeTier, null)
      })
      test("correlated upgrade retrieval recovers late; current price without operation correlation cannot prove execution", async () => {
        const original = mockStripe.subscriptions.update
        mockStripe.subscriptions.update = async (...args) => { await original(...args); throw new Error("lost upgrade") }
        await assert.rejects(runIntent({ kind: "checkout", tier: "small_business" }))
        time = new Date(time.getTime() + 86400000)
        const metadata = provider.metadata; provider.metadata = { userId: tenant }
        assert.equal((await service().reconcile(tenant, rootId)).httpStatus, 202); assert.equal(calls.length, 1)
        expireLease(); provider.metadata = metadata
        await recover(); assert.equal(calls.length, 1); assert.equal(db.profile.subscriptionTier, "small_business")
      })
      test("partial rejected phases stay unknown/reserved with no loop, compensation, or new key", async () => {
        provider.status = "active"; listed = [[provider]]
        const original = mockStripe.subscriptionSchedules.update
        mockStripe.subscriptionSchedules.update = async (...args) => {
          mutationError = { type: "StripeInvalidRequestError", statusCode: 400, requestId: "req_invalid" }; return original(...args)
        }
        await assert.rejects(runIntent({ kind: "downgrade", tier: "essentials" })); expireLease()
        const count = calls.length
        assert.equal((await service().reconcile(tenant, rootId)).httpStatus, 202)
        assert.equal((await service().status(tenant, rootId)).canReconcile, false)
        assert.equal(calls.length, count); assert.equal(db.profile.pendingBillingMutationId, rootId)
      })
      test("durable definitive rejection interrupted before final commit remains usefully recoverable without redispatch", async () => {
        const interrupted = executorsApi.createCustomerBillingExecutors({ stripe: mockStripe, coordinator: { ...coordinator,
          finalize: async () => { throw new Error("failed final commit") },
        } })
        const accepted = await acceptIntent({ kind: "portal" })
        mutationError = { type: "StripeInvalidRequestError", statusCode: 400, requestId: "req_invalid" }
        await assert.rejects(interrupted.execute(tenant, accepted.reservedOperationId!, "executor"))
        expireLease(); mutationError = undefined
        assert.equal((await service().status(tenant, rootId)).canReconcile, true)
        assert.deepEqual(await service().reconcile(tenant, rootId), { httpStatus: 502, body: { error: "billing_provider_rejected" } })
        const snapshot = structuredClone(db.operations)
        assert.deepEqual(await service().reconcile(tenant, rootId), { httpStatus: 502, body: { error: "billing_provider_rejected" } })
        assert.deepEqual(db.operations, snapshot); assert.equal(calls.length, 1)
      })
      test("late unknown phase update retrieves its own known schedule and proves intended phases without replay", async () => {
        provider.status = "active"; listed = [[provider]]
        const original = mockStripe.subscriptionSchedules.update
        mockStripe.subscriptionSchedules.update = async (...args) => { await original(...args); throw new Error("phase response lost") }
        await assert.rejects(runIntent({ kind: "downgrade", tier: "essentials" }))
        time = new Date(time.getTime() + 86400000)
        await recover()
        assert.equal(calls.length, 2); assert.equal(db.operations[0].status, "succeeded")
        assert.equal(db.profile.pendingDowngradeTier, "essentials")
      })
      test("late known schedule with changed or foreign phases cannot invent success or release reservation", async () => {
        provider.status = "active"; listed = [[provider]]
        const original = mockStripe.subscriptionSchedules.update
        mockStripe.subscriptionSchedules.update = async (...args) => { await original(...args); throw new Error("phase response lost") }
        await assert.rejects(runIntent({ kind: "downgrade", tier: "essentials" }))
        time = new Date(time.getTime() + 86400000)
        schedule.phases = [{ items: [{ price: "price_control", quantity: 1 }] }]
        assert.equal((await service().reconcile(tenant, rootId)).httpStatus, 202)
        assert.equal(calls.length, 2); assert.equal(db.profile.pendingBillingMutationId, rootId)
      })
      test("read/discovery page budget is bounded and exhaustion is not uniqueness or nonexecution proof", async () => {
        await lostCheckout(); time = new Date(time.getTime() + 86400000)
        let pages = 0
        mockStripe.checkout.sessions.list = () => {
          pages++
          return pageResult({ data: [{ id: `cs_page_${pages}`, metadata: {} }] as unknown as Stripe.Checkout.Session[], has_more: true })
        }
        assert.equal((await service().reconcile(tenant, rootId)).httpStatus, 202)
        assert.equal(pages, 100); assert.equal(calls.length, 1); assert.equal(db.profile.pendingBillingMutationId, rootId)
      })
      test("failure during recovered proof persistence remains unknown and retains the same attempt/key", async () => {
        await lostCheckout()
        mockStripe.checkout.sessions.list = () => pageResult({ data: [checkout] as unknown as Stripe.Checkout.Session[], has_more: false })
        const original = mockStripe.checkout.sessions.retrieve
        mockStripe.checkout.sessions.retrieve = async (...args) => {
          const result = await original(...args); db.failWrite = "steps"; return result
        }
        const result = await service().reconcile(tenant, rootId)
        assert.equal(result.httpStatus, 202); assert.equal(calls.length, 1)
        assert.equal(db.profile.pendingBillingMutationId, rootId); assert.equal(db.operations[0].result, null)
        assert.equal(db.steps[0].stripeIdempotencyKey, `billing/${rootId}/checkout_create`)
      })
      test("post-acceptance unreadable journal never fabricates a202 or success result", async () => {
        await uncertainPortal()
        const broken = operations.createCustomerBillingOperations({ now: () => new Date(time), executors: {
          ...executor, recover: async () => { db.failWrite = "operations"; throw new Error("DB unavailable") },
        }, coordinator: { ...coordinator, readOwn: async (...args) => {
          if (db.failWrite) throw new Error("DB unavailable")
          return coordinator.readOwn(...args)
        } } })
        await assert.rejects(broken.reconcile(tenant, rootId), /DB unavailable/)
        assert.equal(db.profile.pendingBillingMutationId, rootId)
      })
      test("changed binding remains blocked and is not mislabeled superseded from matching provider status", async () => {
        await uncertainPortal(); db.profile.stripeSubscriptionId = "sub_new"
        assert.equal((await service().status(tenant, rootId)).canReconcile, false)
        assert.equal((await service().reconcile(tenant, rootId)).httpStatus, 202)
        assert.equal(calls.length, 1); assert.equal(db.profile.pendingBillingMutationId, rootId)
        assert.equal(db.profile.stripeSubscriptionId, "sub_new")
      })
      test("stored superseded terminal result replays without reinterpreting unknown state or touching a newer reservation", async () => {
        await runIntent({ kind: "portal" })
        db.operations[0].status = "superseded"; db.profile.pendingTrialOperationId = nextId
        const snapshot = structuredClone(db.operations)
        assert.equal((await service().reconcile(tenant, rootId)).httpStatus, 200)
        assert.deepEqual(db.operations, snapshot); assert.equal(calls.length, 1)
        assert.equal(db.profile.pendingTrialOperationId, nextId)
      })
      async function knownUpgradeOnObsoleteBinding(): Promise<void> {
        const interrupted = executorsApi.createCustomerBillingExecutors({ stripe: mockStripe, coordinator: {
          ...coordinator, finalize: async () => { throw new Error("interrupted final commit") },
        } })
        const accepted = await acceptIntent({ kind: "checkout", tier: "small_business" })
        await assert.rejects(interrupted.execute(tenant, accepted.reservedOperationId!, "executor"))
        assert.equal(db.steps[0].status, "succeeded")
        db.profile.stripeSubscriptionId = "sub_new"; db.profile.subscriptionStatus = "active"
        db.profile.subscriptionTier = "business_pro"; db.profile.billingAccessVersion = 12
        const previous = structuredClone(provider)
        mockStripe.subscriptions.retrieve = async (id) => ({
          ...previous, id, status: id === "sub_1" ? "canceled" : "active",
          items: { has_more: false, data: [{ price: { id: id === "sub_1" ? "price_small" : "price_pro" } }] },
        }) as unknown as Stripe.Response<Stripe.Subscription>
        expireLease()
      }
      test("fully proven old upgrade can be fenced-superseded only after old ended/new current binding verification, without projecting stale values", async () => {
        await knownUpgradeOnObsoleteBinding()
        assert.equal((await service().status(tenant, rootId)).canReconcile, true)
        const before = structuredClone(db.profile)
        const result = await service().reconcile(tenant, rootId)
        assert.equal(result.httpStatus, 200); assert.equal(db.operations[0].status, "superseded")
        assert.equal(calls.length, 1); assert.equal(db.profile.pendingBillingMutationId, null)
        assert.equal(db.profile.billingAccessVersion, 13)
        assert.equal(db.profile.stripeSubscriptionId, "sub_new"); assert.equal(db.profile.subscriptionTier, before.subscriptionTier)
        assert.equal(db.profile.subscriptionStatus, before.subscriptionStatus)
        assert.equal(db.operations[0].fencingToken, 2)
        assert.deepEqual(await service().reconcile(tenant, rootId), result)
        assert.equal(calls.length, 1)
      })
      for (const scenario of ["old-live", "foreign-current", "unknown-price", "missing-proof", "expired-fence", "db-failure"] as const) {
        test(`supersession ${scenario} cannot release unknown effects or overwrite newer state`, async () => {
          await knownUpgradeOnObsoleteBinding()
          const original = mockStripe.subscriptions.retrieve
          mockStripe.subscriptions.retrieve = async (...args) => {
            const value = await original(...args)
            if (scenario === "old-live" && args[0] === "sub_1") value.status = "active"
            if (scenario === "foreign-current" && args[0] === "sub_new") value.customer = "cus_other"
            if (scenario === "unknown-price" && args[0] === "sub_new") value.items.data[0].price.id = "unmapped"
            if (scenario === "expired-fence") time = new Date(time.getTime() + 60001)
            if (scenario === "db-failure") db.failWrite = "profile"
            return value
          }
          if (scenario === "missing-proof") { db.steps[0].status = "reconciliation_required"; db.steps[0].providerResult = null }
          assert.equal((await service().reconcile(tenant, rootId)).httpStatus, 202)
          assert.equal(db.profile.pendingBillingMutationId, rootId); assert.notEqual(db.operations[0].status, "superseded")
          assert.equal(db.profile.stripeSubscriptionId, "sub_new"); assert.equal(db.profile.subscriptionTier, "business_pro")
          assert.equal(calls.length, 1)
        })
      }
      test("safe projection excludes provider references, raw intent, leases, identities, email and arbitrary result fields", async () => {
        await runIntent({ kind: "portal" })
        const safe = await service().status(tenant, rootId), text = JSON.stringify(safe)
        for (const secret of [tenant, "cus_1", "sub_1", "req_portal", "owner@example.test", "idempotency", "normalized", "fencing", "leaseOwner"]) {
          assert.equal(text.includes(secret), false, secret)
        }
        db.operations[0].result = { url: "https://billing.stripe.test/bps_1", rawParams: { email: "private@example.test" } }
        assert.equal((await service().status(tenant, rootId)).result, null)
        await assert.rejects(service().reconcile(tenant, rootId), /billing_operation_result_unavailable/)
        assert.equal(calls.length, 1, "invalid stored result never starts replacement work")
      })
      test("foreign actor/tenant, owner journal and missing UUIDs have no journal exposure/provider calls", async () => {
        await uncertainPortal(); const count = calls.length
        for (const change of [{ userId: foreign }, { actorUserId: foreign }]) {
          const prior = structuredClone(db.operations[0]); Object.assign(db.operations[0], change)
          await assert.rejects(service().status(tenant, rootId), conflict("billing_operation_not_found"))
          Object.assign(db.operations[0], prior)
        }
        db.owners.push({ id: nextId, userId: tenant })
        await assert.rejects(service().reconcile(tenant, nextId), conflict("billing_operation_not_found"))
        assert.equal(calls.length, count)
      })
    })
  })
})