import assert from "node:assert/strict"
import { before, beforeEach, after, mock, test } from "node:test"
import type { PrismaTx } from "@/lib/db/withUserContext"
import { resolveEffectiveAccess, type EffectiveAccessSnapshot } from "@/lib/billing/effectiveAccess"
import type { OperationalCommitment } from "@/lib/commitguard/operationalEvaluation"
import type { CommitGuardEvaluationState, CommitmentEvent } from "@/lib/generated/prisma/client"

const userId = "synthetic-tenant"
const workItemId = "synthetic-work"
const body = { userId, workItemId, kind: "detect" }
const secret = "synthetic-internal-secret"
const originalSecret = process.env.INTERNAL_JOBS_SECRET
let route: typeof import("@/app/api/internal/jobs/commitguard/route")
let dispatch: typeof import("@/lib/commitguard/jobDispatch")
let trace: string[], committed: string[], staged: string[], logs: unknown[][]
let role: string, work: { userId: string; kind: string; state: string; fence: number;
  attempts: number; leaseOwner: string | null; expires: Date | null; nextAttemptAt: Date;
  sourceKind: string; sourceId: string | null; dedupeKey: string; calculationRevision: number }
let clock: Date, snapshot: EffectiveAccessSnapshot
let settings: Record<string, unknown>
let sourceValid: boolean, evidenceFailure: boolean, onTenantLock: (() => void) | undefined
let afterWrite: (() => void) | undefined
let tenantTransactions: number
let commitments: OperationalCommitment[], history: CommitmentEvent[], pendingHistory: CommitmentEvent[]
let evaluationState: CommitGuardEvaluationState | null, pendingState: CommitGuardEvaluationState | null
let cash: { amountCents: number; currency: string; balanceAsOf: Date; revision: number } | null
let transactionQueue = Promise.resolve()
let cashPlanEnabled = false
let cashSnapshots: Array<Record<string, unknown>> = [], pendingCashSnapshots: Array<Record<string, unknown>> = []
let afterSnapshot: (() => void) | undefined
async function serialized<T>(callback: () => Promise<T>): Promise<T> {
  const previous = transactionQueue
  let release!: () => void
  transactionQueue = new Promise<void>((resolve) => { release = resolve })
  await previous
  try { return await callback() } finally { release() }
}

function request(payload: unknown = body, authorization = `Bearer ${secret}`): Request {
  return new Request("http://localhost/api/internal/jobs/commitguard", { method: "POST",
    headers: { authorization, "content-type": "application/json" }, body: JSON.stringify(payload) })
}
function auth(): void { assert.equal(role, "authenticated") }
function financial(label: string): void {
  auth(); assert.ok(trace.includes("tenant-work-lock")); assert.ok(trace.includes("fence"))
  trace.push(label)
}
function noFinancial(): void {
  assert.equal(trace.some((item) => item.startsWith("financial:")), false)
  assert.deepEqual(committed, [])
}
function evaluateWork(): void {
  work.kind = "evaluate"; work.sourceKind = "mutation"; work.sourceId = null
  work.calculationRevision = 7; work.dedupeKey = "evaluation:7"
}
function grant(expiresAt: Date, revokedAt: Date | null = null): void {
  snapshot.profile = { ...snapshot.profile!, subscriptionStatus: "cancelled", stripeSubscriptionId: null }
  snapshot.grant = { plan: "business_pro", startsAt: new Date("2026-10-01"), expiresAt, revokedAt }
}

function transaction(tenant: boolean) {
  return {
    // Most D7/D8 fixtures have no CashPlan. The real default evaluator still
    // traverses the canonical no-plan path without inventing a plan/snapshot.
    cashPlan: { findFirst: async () => { auth(); return cashPlanEnabled ? {
      id: "plan-a", name: "Synthetic plan", currency: "aud", timezone: "Australia/Sydney",
      horizonWeeks: 13, bufferTargetCents: 0, updatedAt: clock,
    } : null } },
    cashPlanSetting: { findFirst: async () => { financial("financial:cashplan-settings"); return null } },
    cashPlanOverride: { findMany: async () => { financial("financial:cashplan-overrides"); return [] } },
    cashPlanSnapshot: {
      findFirst: async () => { financial("financial:cashplan-snapshot-read"); return pendingCashSnapshots.at(-1) ?? null },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        financial("financial:cashplan-snapshot"); staged.push("cashplan-snapshot")
        const saved = { id: `snapshot-${pendingCashSnapshots.length}`, ...data }
        pendingCashSnapshots.push(saved); afterSnapshot?.(); return { id: saved.id }
      },
    },
    $executeRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      const text = sql.join("?")
      if (text.includes("pg_advisory_xact_lock")) {
        assert.deepEqual(values, [`commitguard:${userId}`])
        trace.push(tenant ? "tenant-lock" : "claim-lock")
        if (tenant) onTenantLock?.()
      } else if (text === "SET LOCAL ROLE NONE") role = "executor"
      else if (text === "SET LOCAL ROLE authenticated") role = "authenticated"
      else if (text.includes("UPDATE public.commit_guard_work_items")) {
        assert.equal(role, "executor")
        if (text.includes("attempts = CASE WHEN")) {
          assert.ok(trace.includes("claim-work-lock"))
          const [superseded, deferred] = values
          const valid = work.state === "processing" && values[7] === workItemId && values[8] === userId &&
            values[9] === work.kind && values[10] === work.leaseOwner && values[11] === work.fence && work.expires! > clock
          if (valid) {
            work.state = superseded ? "skipped" : !deferred && work.attempts >= 6 ? "failed" : "pending"
            if (deferred) work.attempts--
            work.nextAttemptAt = new Date(clock.getTime() + (deferred ? 300_000 : 60_000 * 2 ** (work.attempts - 1)))
            work.leaseOwner = null; work.expires = null
          }
        } else {
          assert.match(text, /AND state = 'pending'/)
          if (work.state === "pending") {
            if (values[0]) work.state = "skipped"
            work.nextAttemptAt = new Date(clock.getTime() + 300_000)
          }
        }
      }
      else assert.fail(text)
    },
    $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      const text = sql.join("?")
      if (text.includes("FOR UPDATE")) {
        assert.equal(role, "executor")
        trace.push(tenant ? "tenant-work-lock" : "claim-work-lock")
        return values[0] === workItemId && values[1] === work.userId && values[2] === work.kind ? [{ id: workItemId }] : []
      }
      if (text.includes("attempts = attempts + 1")) {
        assert.equal(tenant, false); assert.equal(role, "executor")
        assert.match(text, /state = 'pending'/); assert.match(text, /attempts < 6/)
        assert.match(text, /next_attempt_at <= \(clock_timestamp\(\) AT TIME ZONE 'UTC'\)/)
        if (work.state !== "pending" || work.attempts >= 6 || work.nextAttemptAt > clock) return []
        work.state = "processing"; work.attempts++; work.fence++
        work.leaseOwner = values[0] as string; work.expires = new Date(clock.getTime() + 60_000)
        trace.push("claim"); return [{ fence: work.fence }]
      }
      if (text.includes("UPDATE public.commit_guard_work_items w")) {
        assert.equal(role, "executor"); trace.push("fence")
        assert.match(text, /lease_expires_at > \(clock_timestamp\(\) AT TIME ZONE 'UTC'\)/)
        assert.equal(values[4], workItemId); assert.equal(values[5], userId); assert.equal(values[6], work.kind)
        const valid = work.state === "processing" && values[7] === work.leaseOwner && values[8] === work.fence &&
          work.expires !== null && work.expires > clock && work.expires.getTime() <= clock.getTime() + 60_000 &&
          values[10] === settings.calculationRevision &&
          (work.kind === "detect" || work.calculationRevision === values[9])
        if (!valid) return []
        if (values[0]) staged.push("complete")
        return [{ id: workItemId }]
      }
      assert.equal(text, "SELECT clock_timestamp() AS now"); auth(); return [{ now: clock }]
    },
    commitGuardWorkItem: { findFirst: async ({ where }: { where: object }) => {
      assert.equal(role, "executor"); assert.deepEqual(where, { id: workItemId, userId, kind: work.kind }); return work
    } },
    accountingSyncRun: { findFirst: async ({ where, select }: { where: object; select: object }) => {
      assert.equal(role, "executor"); assert.deepEqual(select, { id: true })
      assert.deepEqual(where, { id: "source", userId, status: "success", completedAt: { not: null }, invoicesSkipped: 0 })
      return sourceValid ? { id: "source" } : null
    } },
    spendImportBatch: { findFirst: async ({ where, select }: { where: object; select: object }) => {
      assert.equal(role, "executor"); assert.deepEqual(select, { id: true })
      assert.deepEqual(where, { id: "source", userId, status: "completed", completedAt: { not: null }, rowsFailed: 0, rowsSkipped: 0 })
      return sourceValid ? { id: "source" } : null
    } },
    commitGuardSetting: { findUnique: async ({ where }: { where: object }) => {
      assert.deepEqual(where, { userId }); return settings
    } },
    platformRole: { findUnique: async () => { assert.equal(role, "executor"); return null } },
    userProfile: { findUnique: async () => { auth(); return snapshot.profile } },
    tenantTrialGrant: { findUnique: async () => { auth(); return snapshot.grant } },
    tenantBillingRisk: { findMany: async () => { auth(); return snapshot.billingRisks } },
    importedBill: { findMany: async () => {
      financial("financial:bills")
      if (evidenceFailure) throw new Error(`${userId} supplier-private recipient-private 987654321`)
      return work.kind === "detect" ? Array.from({ length: 3 }, (_, i) => ({
        accountingConnectionId: "connection", accountingConnection: { provider: "xero" }, sourceId: `bill-${i}`,
        supplierName: "supplier-private", supplierReference: null, documentNumber: null, status: "paid",
        sourceContactId: null, amountCents: 987654321, currency: "aud", dueDate: new Date(Date.UTC(2026, 0, 1 + i * 7)),
        paidDate: null, sourceUpdatedAt: null, createdAt: clock,
      })) : []
    } },
    importedBankTransaction: { findMany: async () => { financial("financial:bank"); return [] } },
    commitmentDetectionCandidate: {
      findMany: async () => { financial("financial:candidates"); return [] },
      findUnique: async () => { financial("financial:candidate"); return null },
      create: async ({ data }: { data: object }) => {
        financial("financial:write-candidate"); staged.push("candidate"); afterWrite?.(); return { ...data, id: "candidate" }
      },
    },
    commitmentEvent: {
      findMany: async ({ where }: { where: { userId: string; eventType: { in: string[] } } }) => {
        financial("financial:event-history"); assert.equal(where.userId, userId)
        return pendingHistory.filter((event) => where.eventType.in.includes(event.eventType))
      },
      updateMany: async ({ where, data }: { where: { id: string; userId: string }; data: Partial<CommitmentEvent> }) => {
        financial("financial:event-relevance"); assert.equal(where.userId, userId)
        pendingHistory = pendingHistory.map((event) => event.id === where.id ? { ...event, ...data } : event)
      },
      upsert: async (args?: { create?: Partial<CommitmentEvent>; update?: Partial<CommitmentEvent>;
        where?: { userId_dedupeKey: { userId: string; dedupeKey: string } } }) => {
        financial("financial:write-event"); staged.push("event")
        if (args?.create && args.where) {
          assert.equal(args.where.userId_dedupeKey.userId, userId)
          const existing = pendingHistory.find((event) => event.dedupeKey === args.where!.userId_dedupeKey.dedupeKey)
          if (existing) Object.assign(existing, args.update)
          else pendingHistory.push({ inputRevision: null, occurredAt: clock,
            ...args.create, id: `event-${pendingHistory.length}` } as CommitmentEvent)
        }
        afterWrite?.()
      },
    },
    commitment: { findMany: async ({ where }: { where: { userId: string } }) => {
      financial("financial:commitments"); assert.equal(where.userId, userId)
      return commitments.map((row) => ({ userId, createdAt: clock, updatedAt: clock,
        source: "manual", essentiality: "operational", category: "other", ...row }))
    } },
    commitGuardCashContext: { findUnique: async () => { financial("financial:cash"); return cash } },
    taxBufferConfiguration: { findUnique: async () => { financial("financial:tax"); return { enabled: false } } },
    taxReserveCategory: { findMany: async () => { financial("financial:categories"); return [] } },
    taxBufferObligation: { findMany: async () => { financial("financial:obligations"); return [] } },
    commitmentCoverage: { findMany: async () => { financial("financial:coverage"); return [] } },
    commitGuardEvaluationState: {
      findUnique: async () => { financial("financial:state"); return pendingState },
      upsert: async ({ update }: { update: Partial<CommitGuardEvaluationState> }) => {
        assert.equal(role, "executor"); staged.push("state"); trace.push("state"); assert.ok(update)
        pendingState = { ...pendingState, ...update } as CommitGuardEvaluationState
      },
    },
  }
}

before(async () => {
  await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => serialized(async () => {
      trace.push("claim-tx"); role = "executor"; return callback(transaction(false))
    }),
  } } })
  await mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async (tenant: string, callback: (tx: PrismaTx) => Promise<unknown>) => serialized(async () => {
      assert.equal(tenant, userId); tenantTransactions++; role = "authenticated"; staged = []
      pendingHistory = structuredClone(history)
      pendingState = structuredClone(evaluationState)
      pendingCashSnapshots = structuredClone(cashSnapshots)
      try {
        const result = await callback(transaction(true) as unknown as PrismaTx)
        auth(); committed.push(...staged)
        history = pendingHistory
        evaluationState = pendingState
        cashSnapshots = pendingCashSnapshots
        if (staged.includes("complete")) { work.state = "completed"; work.leaseOwner = null; work.expires = null }
        return result
      } finally { staged = []; role = "executor" }
    }),
  } })
  await mock.module("@/lib/billing/effectiveAccessSystem", { namedExports: {
    getEffectiveAccessForSystem: async (tenant: string) => {
      assert.equal(tenant, userId); trace.push("system-access"); return resolveEffectiveAccess(snapshot, clock)
    },
  } })
  await mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: {
    getEffectiveAccess: async () => assert.fail("job must not open an independent user access transaction"),
  } })
  mock.method(console, "error", (...args: unknown[]) => { logs.push(args) })
  route = await import("@/app/api/internal/jobs/commitguard/route")
  dispatch = await import("@/lib/commitguard/jobDispatch")
})
beforeEach(() => {
  process.env.INTERNAL_JOBS_SECRET = secret
  clock = new Date("2026-10-19T12:00:00Z"); trace = []; committed = []; staged = []; logs = []
  role = "executor"; sourceValid = true; evidenceFailure = false; onTenantLock = undefined; afterWrite = undefined; tenantTransactions = 0
  commitments = []; history = []; pendingHistory = []
  evaluationState = null; pendingState = null; cash = null
  cashPlanEnabled = false; cashSnapshots = []; pendingCashSnapshots = []; afterSnapshot = undefined
  snapshot = { profile: { subscriptionStatus: "active", subscriptionTier: "business_pro",
    stripeSubscriptionId: "sub_synthetic", trialEndsAt: null, billingAccessVersion: 1 }, grant: null, billingRisks: [] }
  settings = { enabled: true, detectRecurringCommitments: true, calculationRevision: 7,
    detectionMinOccurrences: 3, detectionAmountVariancePercent: 12, detectionIntervalToleranceDays: 3,
    detectionConfidenceThreshold: "low", defaultHorizonDays: 30, safetyBufferMode: "fixed_amount",
    safetyBufferFixedCents: 0, safetyBufferCurrency: null, safetyBufferPercent: null, safetyBufferWeeks: null,
    renewalWarningDays: [90, 30, 7], alertCommitmentDueSoon: true,
    alertRenewalApproaching: true, alertNoticePeriodApproaching: true,
    alertCommitmentAmountChanged: true, alertCommitmentBufferLow: true, alertCommitmentShortfall: true }
  work = { userId, kind: "detect", state: "pending", fence: 0, attempts: 0, leaseOwner: null,
    expires: null, nextAttemptAt: clock, sourceKind: "accounting_sync_run", sourceId: "source",
    dedupeKey: "detection:accounting_sync_run:source", calculationRevision: 0 }
})
after(() => {
  if (originalSecret === undefined) delete process.env.INTERNAL_JOBS_SECRET
  else process.env.INTERNAL_JOBS_SECRET = originalSecret
})

test("6.2 actual route rejects wrong/missing/empty/unconfigured secrets before all DB work", async () => {
  assert.equal((await route.POST(new Request("http://localhost/api/internal/jobs/commitguard", {
    method: "POST", body: JSON.stringify(body),
  }))).status, 401)
  for (const value of ["wrong", "", "Bearer undefined", "Bearer synthetic-internal-secreu"]) {
    assert.equal((await route.POST(request(body, value))).status, 401)
  }
  delete process.env.INTERNAL_JOBS_SECRET
  assert.equal((await route.POST(request(body, "Bearer undefined"))).status, 401)
  process.env.INTERNAL_JOBS_SECRET = ""
  assert.equal((await route.POST(request(body, "Bearer "))).status, 401)
  assert.deepEqual(trace, [])
})

test("6.2 actual route strictly rejects permissions/tier/fence/source overrides and unknown kinds", async () => {
  for (const payload of [{ ...body, kind: "send_email" }, { ...body, permissions: [] }, { ...body, tier: "business_pro" },
    { ...body, effectiveTier: "business_pro" }, { ...body, allowAccess: true }, { ...body, fence: 99 },
    { ...body, complete: true }, { ...body, sourceId: "source" }, { ...body, userId: "" }, { kind: "detect" }, null]) {
    const response = await route.POST(request(payload))
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: "Invalid request body" })
  }
  const malformed = new Request("http://localhost/api/internal/jobs/commitguard", { method: "POST",
    headers: { authorization: `Bearer ${secret}` }, body: "{" })
  assert.equal((await route.POST(malformed)).status, 400)
  assert.deepEqual(trace, [])
})

test("6.2 actual route mismatched tenant, ID and supported-but-wrong kind do no financial work or claim", async () => {
  work.userId = "other-tenant"
  assert.deepEqual(await (await route.POST(request())).json(), { status: "skipped", reason: "work_unavailable" })
  work.userId = userId
  for (const payload of [{ ...body, workItemId: "missing" }, { ...body, kind: "evaluate" }]) {
    assert.deepEqual(await (await route.POST(request(payload))).json(), { status: "skipped", reason: "work_unavailable" })
  }
  assert.equal(work.attempts, 0); assert.equal(tenantTransactions, 0); noFinancial()
})

for (const denied of ["revoked", "expired", "feature", "no-profile", "disabled", "opt-out"] as const) {
  test(`6.2 actual route ${denied} access prevents financial work`, async () => {
    if (denied === "revoked") grant(new Date("2026-11-01"), clock)
    if (denied === "expired") grant(clock)
    if (denied === "feature") snapshot.profile!.subscriptionTier = "essentials"
    if (denied === "no-profile") snapshot.profile = null
    if (denied === "disabled") settings.enabled = false
    if (denied === "opt-out") settings.detectRecurringCommitments = false
    const response = await route.POST(request())
    assert.equal(response.status, 200); assert.equal((await response.json()).status, "skipped")
    assert.equal(work.attempts, 0); noFinancial()
  })
}

test("6.2 actual route validates canonical persisted sources and successful tenant completion", async () => {
  for (const change of [() => { sourceValid = false }, () => { work.dedupeKey = "forged" },
    () => { work.sourceKind = "unknown" }]) {
    sourceValid = true; work.sourceKind = "accounting_sync_run"; work.dedupeKey = "detection:accounting_sync_run:source"
    change()
    assert.deepEqual(await (await route.POST(request())).json(), { status: "skipped", reason: "invalid_source" })
  }
  assert.equal(work.attempts, 0); noFinancial()
})

test("6.2 actual route ignores nonpending, future-attempt and exhausted work without financial reads", async () => {
  for (const change of [() => { work.state = "completed" }, () => { work.state = "processing" },
    () => { work.attempts = 6 }, () => { work.nextAttemptAt = new Date(clock.getTime() + 1) }]) {
    work.state = "pending"; work.attempts = 0; work.nextAttemptAt = clock; change()
    assert.deepEqual(await (await route.POST(request())).json(), { status: "skipped", reason: "work_unavailable" })
  }
  noFinancial()
})

test("6.2 actual route detects with the real detector on the SAME fenced tenant transaction and returns no financial DTO", async () => {
  grant(new Date("2026-11-01"))
  const response = await route.POST(request())
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: "completed" })
  assert.deepEqual(committed, ["candidate", "event", "complete"])
  assert.equal(tenantTransactions, 1); assert.equal(work.state, "completed"); assert.equal(work.attempts, 1)
  assert.ok(trace.indexOf("claim-lock") < trace.indexOf("claim-work-lock"))
  assert.ok(trace.indexOf("tenant-lock") < trace.indexOf("tenant-work-lock"))
  assert.ok(trace.lastIndexOf("fence") > trace.indexOf("financial:write-event"))
  assert.deepEqual(logs, [])
  assert.deepEqual(await (await route.POST(request())).json(), { status: "skipped", reason: "work_unavailable" })
  assert.equal(work.attempts, 1)
})

test("6.2 actual route also dispatches a successful completed spreadsheet source", async () => {
  work.sourceKind = "spend_import_batch"; work.dedupeKey = "detection:spend_import_batch:source"
  assert.deepEqual(await (await route.POST(request())).json(), { status: "completed" })
  assert.deepEqual(committed, ["candidate", "event", "complete"])
})

test("6.2 actual route rechecks access and settings after claim before financial reads", async () => {
  onTenantLock = () => grant(clock)
  assert.deepEqual(await (await route.POST(request())).json(), { status: "skipped", reason: "no_access" })
  assert.equal(work.state, "pending"); noFinancial()
})

test("6.2 actual evaluate route denies revoked/expired access before all summary reads", async () => {
  evaluateWork(); grant(clock)
  assert.deepEqual(await (await route.POST(request({ ...body, kind: "evaluate" }))).json(), { status: "skipped", reason: "no_access" })
  grant(new Date("2026-11-01"), clock)
  assert.deepEqual(await (await route.POST(request({ ...body, kind: "evaluate" }))).json(), { status: "skipped", reason: "no_access" })
  assert.equal(work.attempts, 0); noFinancial()
})

test("6.2 actual evaluate route rejects revision changed between claim and fenced reads", async () => {
  evaluateWork(); onTenantLock = () => { settings.calculationRevision = 8 }
  assert.deepEqual(await (await route.POST(request({ ...body, kind: "evaluate" }))).json(), { status: "skipped", reason: "superseded" })
  noFinancial()
})

test("7.6 evaluation work checks disabled current policy, retains records and runs after re-enable", async () => {
  evaluateWork()
  settings.enabled = false
  const originalHistory = structuredClone(history)
  const originalCommitments = structuredClone(commitments)
  assert.deepEqual(await (await route.POST(request({ ...body, kind: "evaluate" }))).json(), { status: "skipped", reason: "module_disabled" })
  noFinancial()
  assert.deepEqual(history, originalHistory)
  assert.deepEqual(commitments, originalCommitments)
  assert.equal(evaluationState, null)
  settings.enabled = true
  // Re-enable is a new settings revision/work request, not revival of skipped work.
  settings.calculationRevision = 8
  work = { ...work, state: "pending", nextAttemptAt: clock, calculationRevision: 8, dedupeKey: "evaluation:8" }
  assert.deepEqual(await (await route.POST(request({ ...body, kind: "evaluate" }))).json(), { status: "completed" })
  assert.ok(trace.includes("financial:commitments"))
  assert.ok(evaluationState)
})

test("7.6 a disable after evaluation claim stops before financial reads or side effects", async () => {
  evaluateWork()
  onTenantLock = () => { settings.enabled = false }
  assert.deepEqual(await (await route.POST(request({ ...body, kind: "evaluate" }))).json(), { status: "skipped", reason: "module_disabled" })
  noFinancial()
  assert.equal(evaluationState, null)
  assert.notEqual(work.state, "completed")
})

for (const invalidation of ["expiry", "revision", "revocation", "fence", "owner"] as const) {
  test(`6.2 actual route rolls back real detector writes on post-computation ${invalidation}`, async () => {
    afterWrite = () => {
      if (invalidation === "expiry") clock = work.expires!
      if (invalidation === "revision") settings.calculationRevision = 8
      if (invalidation === "revocation") grant(clock)
      if (invalidation === "fence") work.fence++
      if (invalidation === "owner") work.leaseOwner = "replacement"
    }
    const response = await route.POST(request())
    assert.equal(response.status, 200); assert.equal((await response.json()).status, "skipped")
    assert.deepEqual(committed, []); assert.notEqual(work.state, "completed")
  })
}

test("6.6 actual evaluate route completes timeline, risk and state on one fenced transaction even with unavailable cash", async () => {
  evaluateWork()
  const response = await route.POST(request({ ...body, kind: "evaluate" }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: "completed" })
  assert.ok(trace.includes("financial:event-history")); assert.ok(trace.includes("financial:commitments"))
  assert.equal(trace.includes("financial:cash"), true)
  assert.equal(tenantTransactions, 1); assert.equal(trace.filter((item) => item === "fence").length, 2)
  assert.deepEqual(committed, ["state", "complete"]); assert.equal(work.state, "completed")
  assert.equal(work.attempts, 1)
  assert.equal(evaluationState?.calculationRevision, 7)
  assert.equal(evaluationState?.cashRiskStatus, null)
})

test("6.2 stale evaluate revision is rejected before financial reads and leaves newer work alone", async () => {
  evaluateWork(); work.calculationRevision = 6; work.dedupeKey = "evaluation:6"
  assert.deepEqual(await (await route.POST(request({ ...body, kind: "evaluate" }))).json(), { status: "skipped", reason: "superseded" })
  assert.equal(work.attempts, 0); noFinancial()
})

test("6.2 reusable trusted evaluator injection stages state/events and completes only inside final fence", async () => {
  evaluateWork()
  assert.deepEqual(await dispatch.dispatchCommitGuardJob({ ...body, kind: "evaluate" }, async ({ tx, effects, now, access }) => {
    auth(); assert.equal(now, clock); assert.equal(access.allowAccess, true)
    await tx.commitmentEvent.upsert({} as never)
    effects.saveEvaluationState({ calculationRevision: 7, lastEvaluatedAt: now })
    assert.equal(trace.includes("state"), false)
  }), { status: "completed" })
  assert.deepEqual(committed, ["event", "state", "complete"])
  assert.ok(trace.lastIndexOf("fence") > trace.indexOf("state"))
})

test("6.2 reusable evaluator cannot persist protected state after expiry", async () => {
  evaluateWork()
  const result = await dispatch.dispatchCommitGuardJob({ ...body, kind: "evaluate" }, async ({ tx, effects, now }) => {
    await tx.commitmentEvent.upsert({} as never)
    effects.saveEvaluationState({ calculationRevision: 7, lastEvaluatedAt: now })
    clock = work.expires!
  })
  assert.deepEqual(result, { status: "skipped", reason: "lease_lost" })
  assert.deepEqual(committed, []); assert.equal(work.state, "processing")
})

test("6.2 actual route errors/logs expose fixed safe codes only, never DB identity/financial payloads", async () => {
  evidenceFailure = true
  const response = await route.POST(request())
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { status: "failed", reason: "internal_job_failed" })
  assert.deepEqual(logs, [["[commitguard] internal_job_failed"]])
  assert.deepEqual(committed, []); assert.equal(work.state, "pending")
})

test("6.3 out-of-order revisions skip only stale evaluation; newer revision completes and distinct ingestion remains independent", async () => {
  evaluateWork(); work.calculationRevision = 6; work.dedupeKey = "evaluation:6"
  const oldResult = await dispatch.dispatchCommitGuardJob({ ...body, kind: "evaluate" }, async () => assert.fail("stale evaluation"))
  assert.deepEqual(oldResult, { status: "skipped", reason: "superseded" })
  assert.equal(work.state, "skipped"); assert.equal(work.attempts, 0)
  work.state = "pending"; work.nextAttemptAt = clock; evaluateWork()
  assert.deepEqual(await dispatch.dispatchCommitGuardJob({ ...body, kind: "evaluate" }, async ({ effects, now }) => {
    effects.saveEvaluationState({ lastEvaluatedAt: now, calculationRevision: 7 })
  }), { status: "completed" })
  work.state = "pending"; work.nextAttemptAt = clock; work.kind = "detect"
  work.sourceKind = "spend_import_batch"; work.sourceId = "source"
  work.dedupeKey = "detection:spend_import_batch:source"; work.calculationRevision = 0
  assert.deepEqual(await dispatch.dispatchCommitGuardJob({ ...body, kind: "detect" }), { status: "completed" })
})

test("6.6 daily canonical source validates UTC dates and default pipeline advances successful daily state", async () => {
  evaluateWork(); work.sourceKind = "daily"; work.sourceId = "2026-02-30"; work.dedupeKey = "daily:2026-02-30"
  assert.deepEqual(await dispatch.dispatchCommitGuardJob({ ...body, kind: "evaluate" }), { status: "skipped", reason: "invalid_source" })
  work.state = "pending"; work.nextAttemptAt = clock; work.sourceId = "2026-10-19"; work.dedupeKey = "daily:2026-10-19"
  assert.deepEqual(await dispatch.dispatchCommitGuardJob({ ...body, kind: "evaluate" }), { status: "completed" })
  assert.equal(work.state, "completed"); assert.equal(work.attempts, 1)
  assert.equal(evaluationState?.lastSuccessfulDailyEvaluationAt?.getTime(), clock.getTime())
  assert.ok(committed.includes("state")); assert.ok(committed.includes("complete"))
})

function operationalRow(patch: Partial<OperationalCommitment> = {}): OperationalCommitment {
  return { id: "obligation", name: "Synthetic obligation", amountCents: 10000, currency: "aud",
    frequency: "weekly", confidence: "confirmed", status: "active", archivedAt: null,
    nextDueDate: new Date("1900-01-01Z"), startDate: null, endDate: null,
    renewalDate: new Date("2026-11-18"), noticePeriodDays: 0, ...patch }
}
async function runEvaluation(): Promise<Response> {
  return route.POST(request({ ...body, kind: "evaluate" }))
}
function readyEvaluation(): void { work.state = "pending"; work.nextAttemptAt = clock }

test("6.6 real route persists projected events and daily risk state together, retries deduplicate", async () => {
  evaluateWork(); commitments = [operationalRow()]
  work.sourceKind = "daily"; work.sourceId = "2026-10-19"; work.dedupeKey = "daily:2026-10-19"
  assert.equal((await runEvaluation()).status, 200)
  assert.equal(history.length, 4); assert.equal(work.state, "completed"); assert.equal(work.attempts, 1)
  assert.equal(trace.includes("state"), true); assert.equal(committed.includes("complete"), true)
  assert.ok(trace.lastIndexOf("fence") > trace.lastIndexOf("financial:write-event"))
  const keys = history.map((event) => event.dedupeKey)
  readyEvaluation(); await runEvaluation()
  assert.deepEqual(history.map((event) => event.dedupeKey), keys)
  clock = new Date("2026-10-20T00:00:00Z"); readyEvaluation(); await runEvaluation()
  assert.equal(history.length, 4)
  assert.equal(history.find((event) => event.dedupeKey?.endsWith("2026-10-19"))?.relevance, "resolved")
})

test("6.5 competing actual dispatches claim once and do not duplicate projected occurrence/cycle thresholds", async () => {
  evaluateWork(); commitments = [operationalRow()]
  const responses = await Promise.all([runEvaluation(), runEvaluation(), runEvaluation()])
  const results = await Promise.all(responses.map((response) => response.json()))
  assert.equal(results.filter((result) => result.status === "completed").length, 1)
  assert.equal(results.filter((result) => result.status === "skipped").length, 2)
  assert.equal(tenantTransactions, 1); assert.equal(history.length, 4)
  assert.equal(new Set(history.map((event) => event.dedupeKey)).size, 4)
})

for (const invalidation of ["expiry", "fence", "owner", "revision", "revocation", "advanced-access"] as const) {
  test(`6.5 real evaluator events/relevance roll back at final fence after ${invalidation}`, async () => {
    evaluateWork(); commitments = [operationalRow()]
    await runEvaluation()
    const original = structuredClone(history)
    commitments[0].renewalDate = new Date("2026-11-19")
    readyEvaluation(); committed = []
    afterWrite = () => {
      if (invalidation === "expiry") clock = work.expires!
      if (invalidation === "fence") work.fence++
      if (invalidation === "owner") work.leaseOwner = "replacement"
      if (invalidation === "revision") settings.calculationRevision = 8
      if (invalidation === "revocation") grant(clock)
      if (invalidation === "advanced-access") snapshot.profile!.subscriptionTier = "business_control"
    }
    assert.equal((await (await runEvaluation()).json()).status, "skipped")
    assert.deepEqual(history, original); assert.deepEqual(committed, [])
  })
}

test("6.5 real evaluator preserves history while superseding old cycles and respecting current categories/advanced access", async () => {
  evaluateWork(); commitments = [operationalRow()]; await runEvaluation()
  const oldCycle = history.find((event) => event.eventType === "COMMITMENT_RENEWAL_APPROACHING")!.cycleKey
  commitments[0].renewalDate = new Date("2026-11-19")
  readyEvaluation(); await runEvaluation()
  assert.ok(history.filter((event) => event.cycleKey === oldCycle).every((event) => event.relevance === "superseded"))
  const count = history.length
  settings.alertCommitmentDueSoon = false; readyEvaluation(); await runEvaluation()
  assert.ok(history.filter((event) => event.eventType === "COMMITMENT_DUE_SOON").every((event) => event.relevance === "suspended"))
  snapshot.profile!.subscriptionTier = "business_control"
  readyEvaluation(); await runEvaluation()
  assert.equal(history.length, count)
  assert.ok(history.filter((event) => event.relevance !== "superseded").every((event) => event.relevance === "suspended"))
})

test("6.5 actual route persists only crossed thresholds and one immutable missed deadline across daily retries", async () => {
  evaluateWork(); commitments = [operationalRow({ nextDueDate: null })]
  await runEvaluation()
  assert.equal(history.length, 2)
  for (const value of ["2026-10-20", "2026-10-21"]) {
    clock = new Date(`${value}T12:00:00Z`); readyEvaluation(); await runEvaluation()
    assert.equal(history.length, 2)
  }
  clock = new Date("2026-11-12T12:00:00Z"); readyEvaluation(); await runEvaluation()
  assert.equal(history.length, 4)
  assert.equal(history.filter((event) => event.relevance === "active").length, 2)
  clock = new Date("2026-11-19T12:00:00Z"); readyEvaluation(); await runEvaluation()
  assert.equal(history.length, 5)
  const missed = structuredClone(history.find((event) => event.dedupeKey?.endsWith(":missed")))
  assert.equal(missed?.relevance, "historical")
  clock = new Date("2026-11-20T12:00:00Z"); readyEvaluation(); committed = []; await runEvaluation()
  assert.equal(history.length, 5)
  assert.deepEqual(history.find((event) => event.dedupeKey?.endsWith(":missed")), missed)
  assert.equal(committed.includes("event"), false)
})

test("6.5 actual route suspended obligations emit no new events and reactivation reuses occurrence identity", async () => {
  evaluateWork(); commitments = [operationalRow({ renewalDate: null })]
  await runEvaluation(); const identities = history.map((event) => event.id)
  for (const patch of [{ status: "paused" }, { status: "cancelled" }, { status: "expired" },
    { status: "active", archivedAt: new Date("2026-10-19") }]) {
    commitments[0] = operationalRow({ renewalDate: null, ...patch })
    readyEvaluation(); committed = []; await runEvaluation()
    assert.equal(history.length, 2); assert.ok(history.every((event) => event.relevance === "suspended"))
    assert.equal(committed.includes("event"), false)
  }
  commitments[0] = operationalRow({ renewalDate: null })
  readyEvaluation(); await runEvaluation()
  assert.deepEqual(history.map((event) => event.id), identities)
  assert.ok(history.every((event) => event.relevance === "active"))
})

function riskCash(amountCents: number, patch: Partial<NonNullable<typeof cash>> = {}): void {
  cash = { amountCents, currency: "aud", balanceAsOf: new Date(clock.toISOString().slice(0, 10)), revision: 1, ...patch }
}
function riskEvents(): CommitmentEvent[] {
  return history.filter((event) => ["COMMITMENT_SHORTFALL", "COMMITMENT_BUFFER_LOW"].includes(event.eventType))
}
async function nextEvaluation(): Promise<void> {
  readyEvaluation()
  assert.deepEqual(await (await runEvaluation()).json(), { status: "completed" })
}
function amountAudit(id: string, before: number, after: number, revision: number | null = 7): CommitmentEvent {
  return { id, userId, commitmentId: "obligation", eventType: "COMMITMENT_UPDATED",
    createdAt: clock, message: "Synthetic update", title: "Updated", severity: "info",
    actorId: null, detectionCandidateId: null, cycleKey: null, occurrenceDate: null, resolvedAt: null,
    metadata: { changedFields: { amountCents: { before, after } }, currency: "aud", previousCurrency: "aud" },
    inputRevision: revision, occurredAt: clock, relevance: "historical", dedupeKey: null } as CommitmentEvent
}

test("6.6 system job without page visits creates one risk episode and updates amounts without new alerts", async () => {
  evaluateWork(); riskCash(-10000)
  await nextEvaluation()
  assert.equal(riskEvents().length, 1)
  const original = riskEvents()[0]
  assert.equal(original.severity, "critical"); assert.equal(original.relevance, "active")
  assert.equal(evaluationState?.cashRiskStatus, "shortfall")
  assert.equal(evaluationState?.cashInputRevision, 1)
  riskCash(-20000, { revision: 2 }); settings.calculationRevision = 8
  work.calculationRevision = 8; work.dedupeKey = "evaluation:8"
  await nextEvaluation(); await nextEvaluation()
  assert.equal(riskEvents().length, 1); assert.equal(riskEvents()[0].id, original.id)
  assert.equal(riskEvents()[0].inputRevision, 8)
  assert.equal((riskEvents()[0].metadata as { freeCashCents: number }).freeCashCents, -20000)
  assert.equal(evaluationState?.cashInputRevision, 2)
  assert.equal(tenantTransactions, 3)
})

for (const unavailable of ["missing", "stale", "incompatible", "incomplete"] as const) {
  test(`6.6 ${unavailable} quality creates no WATCH and suspends prior risk without SAFE resolution`, async () => {
    evaluateWork()
    const invalidate = () => {
      if (unavailable === "missing") cash = null
      if (unavailable === "stale") riskCash(-1000, { balanceAsOf: new Date("2026-10-11") })
      if (unavailable === "incompatible") {
        riskCash(-1000); settings.safetyBufferFixedCents = 1000; settings.safetyBufferCurrency = "usd"
      }
      if (unavailable === "incomplete") {
        riskCash(-1000); settings.safetyBufferMode = "weeks_operating_expenses"; settings.safetyBufferWeeks = 4
      }
    }
    invalidate(); await nextEvaluation()
    assert.deepEqual(riskEvents(), []); assert.equal(evaluationState?.cashRiskStatus, null)
    settings.safetyBufferMode = "fixed_amount"; settings.safetyBufferFixedCents = 0
    riskCash(-1000); await nextEvaluation()
    const episode = evaluationState?.cashRiskEpisodeId
    invalidate(); await nextEvaluation()
    assert.equal(riskEvents().length, 1); assert.equal(riskEvents()[0].relevance, "suspended")
    assert.equal(riskEvents()[0].resolvedAt, null)
    assert.equal(evaluationState?.cashRiskStatus, "shortfall")
    assert.equal(evaluationState?.cashRiskRelevance, "suspended")
    assert.equal(evaluationState?.cashRiskResolvedAt, null)
    settings.safetyBufferMode = "fixed_amount"; settings.safetyBufferFixedCents = 0
    riskCash(-1000); await nextEvaluation()
    assert.equal(evaluationState?.cashRiskEpisodeId, episode); assert.equal(riskEvents().length, 1)
    assert.equal(riskEvents()[0].relevance, "active")
  })
}

test("6.6 SAFE resolves once and same-day recurrence creates exactly one deterministic new episode", async () => {
  evaluateWork(); riskCash(-1000); await nextEvaluation()
  const episode = evaluationState!.cashRiskEpisodeId
  riskCash(1000); await nextEvaluation()
  const resolvedAt = evaluationState!.cashRiskResolvedAt
  assert.equal(riskEvents()[0].relevance, "resolved")
  assert.equal(evaluationState!.cashRiskStatus, "safe")
  await nextEvaluation(); assert.deepEqual(evaluationState!.cashRiskResolvedAt, resolvedAt)
  cash = null; await nextEvaluation()
  assert.equal(evaluationState!.cashRiskRelevance, "resolved")
  assert.deepEqual(evaluationState!.cashRiskResolvedAt, resolvedAt)
  riskCash(-1000)
  readyEvaluation()
  await Promise.all([runEvaluation(), runEvaluation(), runEvaluation()])
  assert.notEqual(evaluationState!.cashRiskEpisodeId, episode)
  assert.equal(riskEvents().length, 2); assert.equal(riskEvents()[1].relevance, "active")
  await nextEvaluation(); assert.equal(riskEvents().length, 2)
})

test("6.6 watch/at-risk/shortfall crossings preserve one episode with distinct events, including repeated severity", async () => {
  evaluateWork(); settings.safetyBufferFixedCents = 10000; settings.safetyBufferCurrency = "aud"
  riskCash(15000); await nextEvaluation() // 5000 free => watch
  const episode = evaluationState!.cashRiskEpisodeId
  riskCash(12000); await nextEvaluation() // 2000 free => at risk
  riskCash(9000); await nextEvaluation() // negative => shortfall
  riskCash(15000); await nextEvaluation() // watch again, not prior event rewrite
  assert.deepEqual(riskEvents().map((event) => event.severity), ["watch", "warning", "critical", "watch"])
  assert.equal(new Set(riskEvents().map((event) => event.dedupeKey)).size, 4)
  assert.ok(riskEvents().every((event) => event.cycleKey === episode))
  assert.deepEqual(riskEvents().map((event) => event.relevance), ["superseded", "superseded", "superseded", "active"])
  await nextEvaluation(); assert.equal(riskEvents().length, 4)
})

test("6.6 current categories and advanced entitlement suppress future risk without erasing history", async () => {
  evaluateWork(); riskCash(-1000); await nextEvaluation()
  const id = riskEvents()[0].id
  settings.alertCommitmentShortfall = false; await nextEvaluation()
  assert.equal(riskEvents()[0].relevance, "suspended")
  riskCash(-2000); await nextEvaluation(); assert.equal(riskEvents().length, 1)
  settings.alertCommitmentShortfall = true
  snapshot.profile!.subscriptionTier = "business_control"; await nextEvaluation()
  assert.equal(riskEvents().length, 1); assert.equal(riskEvents()[0].relevance, "suspended")
  snapshot.profile!.subscriptionTier = "business_pro"; await nextEvaluation()
  assert.equal(riskEvents().length, 1); assert.equal(riskEvents()[0].id, id)
  assert.equal(riskEvents()[0].relevance, "active")
})

for (const invalidation of ["expiry", "revision", "revocation", "advanced-access", "owner", "fence"] as const) {
  test(`6.6 actual default pipeline atomically rolls back risk, amount events and state on ${invalidation}`, async () => {
    evaluateWork(); riskCash(-1000); history = [amountAudit("audit", 10000, 20000)]
    afterWrite = () => {
      if (invalidation === "expiry") clock = work.expires!
      if (invalidation === "revision") settings.calculationRevision = 8
      if (invalidation === "revocation") grant(clock)
      if (invalidation === "advanced-access") snapshot.profile!.subscriptionTier = "business_control"
      if (invalidation === "owner") work.leaseOwner = "replacement"
      if (invalidation === "fence") work.fence++
    }
    const original = structuredClone(history)
    assert.equal((await (await runEvaluation()).json()).status, "skipped")
    assert.deepEqual(history, original); assert.equal(evaluationState, null); assert.deepEqual(committed, [])
    assert.notEqual(work.state, "completed")
  })
}

test("6.6 amount revisions use changed-field audit identity, OR materiality and informational decreases", async () => {
  evaluateWork()
  history = [amountAudit("absolute", 100000, 105000), amountAudit("percentage", 10000, 11500),
    amountAudit("below", 10000, 11499), amountAudit("decrease", 20000, 10000),
    amountAudit("zero", 0, 1), amountAudit("unchanged", 0, 0),
    amountAudit("same-value-later", 100000, 105000), amountAudit("future", 10000, 20000, 8)]
  await nextEvaluation()
  const amounts = history.filter((event) => event.eventType === "COMMITMENT_AMOUNT_CHANGED")
  assert.equal(amounts.length, 5)
  assert.equal(amounts.find((event) => event.cycleKey === "amount:decrease")?.severity, "info")
  assert.equal(amounts.find((event) => event.cycleKey === "amount:absolute")?.severity, "watch")
  assert.equal(new Set(amounts.map((event) => event.dedupeKey)).size, 5)
  await nextEvaluation()
  assert.equal(history.filter((event) => event.eventType === "COMMITMENT_AMOUNT_CHANGED").length, 5)
  settings.calculationRevision = 8; work.calculationRevision = 8; work.dedupeKey = "evaluation:8"
  await nextEvaluation()
  assert.equal(history.filter((event) => event.eventType === "COMMITMENT_AMOUNT_CHANGED").length, 6)
})

test("6.6 legacy amount history and legacy changed-field audit do not duplicate previously emitted change", async () => {
  evaluateWork()
  history = [amountAudit("old-audit", 10000, 20000, null),
    { ...amountAudit("old-alert", 10000, 20000, null), eventType: "COMMITMENT_AMOUNT_CHANGED",
      metadata: { previousAmountCents: 10000, currentAmountCents: 20000 },
      dedupeKey: "commitguard:amount-changed:obligation:2026-10-19:20000" },
    amountAudit("new-legacy-audit", 20000, 30000, null)]
  await nextEvaluation(); await nextEvaluation()
  assert.equal(history.filter((event) => event.eventType === "COMMITMENT_AMOUNT_CHANGED").length, 2)
  assert.ok(history.some((event) => event.cycleKey === "amount:new-legacy-audit"))
})

for (const suppression of ["preference", "entitlement"] as const) {
  test(`6.6 ${suppression} suppresses amount alerts while retaining audit without future replay`, async () => {
    evaluateWork(); history = [amountAudit("suppressed", 10000, 20000)]
    if (suppression === "preference") settings.alertCommitmentAmountChanged = false
    else snapshot.profile!.subscriptionTier = "business_control"
    await nextEvaluation(); assert.equal(history.length, 1)
    settings.alertCommitmentAmountChanged = true; snapshot.profile!.subscriptionTier = "business_pro"
    await nextEvaluation(); assert.equal(history.length, 1)
  })
}

test("6.6 rolled-back episode/event identity is stable on retry, including final state fence failure", async () => {
  evaluateWork(); riskCash(-1000)
  afterWrite = () => { work.fence++ }
  const failed = await (await runEvaluation()).json()
  assert.equal(failed.status, "skipped"); assert.equal(evaluationState, null)
  const attemptedKey = pendingHistory.find((event) => event.eventType === "COMMITMENT_SHORTFALL")!.dedupeKey
  afterWrite = undefined; readyEvaluation()
  await nextEvaluation()
  assert.equal(riskEvents()[0].dedupeKey, attemptedKey)
  assert.equal(riskEvents().length, 1)
  assert.ok(trace.lastIndexOf("fence") > trace.lastIndexOf("state"))
})

test("6.6 currency-relabel audit does not fabricate a material monetary comparison", async () => {
  evaluateWork()
  history = [{ ...amountAudit("currency-edit", 10000, 20000), metadata: {
    changedFields: { amountCents: { before: 10000, after: 20000 } }, previousCurrency: "usd", currency: "aud",
  } }]
  await nextEvaluation()
  assert.equal(history.length, 1)
})

test("8.4 existing trusted evaluation refreshes canonical v2 snapshot inside its tenant/fence transaction", async () => {
  evaluateWork(); cashPlanEnabled = true; riskCash(100_000)
  const response = await route.POST(request({ ...body, kind: "evaluate" }))
  assert.equal((await response.json()).status, "completed")
  assert.equal(cashSnapshots.length, 1)
  assert.equal(cashSnapshots[0].inputVersion, 2)
  assert.equal(cashSnapshots[0].inputCurrency, "aud")
  assert.equal(cashSnapshots[0].cashInputRevision, cash!.revision)
  assert.equal(cashSnapshots[0].commitmentRevision, 7)
  assert.ok(trace.lastIndexOf("fence") > trace.lastIndexOf("financial:cashplan-snapshot"))
  assert.equal(tenantTransactions, 1)
})

for (const invalidation of ["lease", "revision", "access"] as const) {
  test(`8.4 final ${invalidation} change rolls back snapshot with all other evaluation effects`, async () => {
    evaluateWork(); cashPlanEnabled = true; riskCash(100_000)
    afterSnapshot = () => {
      if (invalidation === "lease") work.fence++
      if (invalidation === "revision") settings.calculationRevision = 8
      if (invalidation === "access") grant(clock)
    }
    const response = await route.POST(request({ ...body, kind: "evaluate" }))
    assert.equal((await response.json()).status, "skipped")
    assert.equal(pendingCashSnapshots.length, 1, "snapshot write was attempted before final fence")
    assert.deepEqual(cashSnapshots, [], "failed transaction must not publish snapshot")
    assert.deepEqual(committed, [])
  })
}