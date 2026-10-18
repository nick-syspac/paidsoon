import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import { resolveEffectiveAccess, type EffectiveAccessSnapshot } from "@/lib/billing/effectiveAccess"
import { financialJobAccessSkip } from "@/lib/billing/financialJobAccess"

const now = new Date("2026-10-17T12:00:00Z")
const setting = {
  userId: "tenant", enabled: true, defaultPeriod: "30d",
  targetGrossMarginPercent: 50, warningGrossMarginPercent: 35, criticalGrossMarginPercent: 20,
  minCompletenessPercent: 80, alertBelowWarning: true, alertBelowCritical: true,
  alertDeterioration: true, alertNegativeMargin: true, alertCustomerMarginWarning: true,
  alertCostIncrease: true, alertDataQualityWarning: true,
}
const summary = {
  period: { preset: "30d", from: "2026-09-17T12:00:00Z", to: now.toISOString() },
  revenueCents: 100_000, directCostCents: 90_000, variableCostCents: 0,
  grossProfitCents: 10_000, grossMarginPercent: 10, contributionMarginCents: 10_000,
  contributionMarginPercent: 10, completenessPercent: 90, confidence: "high", status: "critical", assumptions: {},
}
let facts: EffectiveAccessSnapshot
let expireAfterSelection = false
let users = [setting]
let computed = 0
let reads = 0
let writes = 0
let batchReads = 0
let singleReads = 0
let jobs: Array<{ name: string; run: () => Promise<{ skipped: number; failed: number }> }>

function grantFacts(): EffectiveAccessSnapshot {
  return {
    profile: { subscriptionStatus: "canceled", subscriptionTier: "essentials", stripeSubscriptionId: null, trialEndsAt: null, billingAccessVersion: 0 },
    grant: { plan: "small_business", startsAt: new Date("2020-01-01"), expiresAt: new Date("2099-01-01"), revokedAt: null },
    billingRisks: [],
  }
}

before(async () => {
  await mock.module("server-only", { namedExports: {} })
  const snapshotRead = () => { reads += 1; return { id: "snap", userId: "tenant", periodGranularity: "daily", periodStart: now, periodEnd: now, ...summary } }
  const write = async () => { writes += 1; return { id: "written" } }
  const db = {
    userProfile: {
      findMany: async () => { batchReads += 1; return users.map(({ userId }) => ({ userId, ...facts.profile })) },
      findUnique: async () => { singleReads += 1; return facts.profile },
    },
    tenantTrialGrant: {
      findMany: async () => { batchReads += 1; return facts.grant ? users.map(({ userId }) => ({ userId, ...facts.grant })) : [] },
      findUnique: async () => expireAfterSelection ? { ...facts.grant, expiresAt: new Date(0) } : facts.grant,
    },
    tenantBillingRisk: {
      findMany: async ({ where }: { where: { userId: unknown } }) => {
        if (typeof where.userId !== "string") { batchReads += 1; return facts.billingRisks.map((risk) => ({ userId: "tenant", ...risk })) }
        return facts.billingRisks
      },
    },
    marginGuardSetting: { findMany: async () => users },
    runwayGuardSetting: { findMany: async () => users },
    marginSnapshot: { findFirst: async () => snapshotRead(), upsert: write },
    runwayGuardSnapshot: { upsert: write },
    marginAlert: { findMany: async () => [], count: async () => 4, create: write, update: write },
    marginAlertEvent: { create: write },
    marginOpportunity: { findMany: async () => [], create: write, update: write },
    marginCostClassification: { count: async () => 1 },
    spendInsight: { aggregate: async () => ({ _count: { id: 1 }, _sum: { estimatedMonthlyCents: 500 } }) },
    costGuardForecast: { findFirst: async () => ({ varianceAmountCents: 300 }) },
    commitment: { aggregate: async () => ({ _sum: { amountCents: 100 } }) },
    cashPlanSnapshot: { findFirst: async () => ({ bufferGapCents: 100 }) },
  }
  await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) } } })
  await mock.module("@/lib/marginguard/service", { namedExports: {
    getMarginSummary: async () => { computed += 1; return summary },
  } })
  const { runMarginSnapshotSweep } = await import("@/lib/marginguard/snapshotJob")
  const { runMarginAlertSweep } = await import("@/lib/marginguard/alertJob")
  const { runMarginOpportunitySweep } = await import("@/lib/marginguard/opportunityJob")
  const { runRunwaySnapshotSweep } = await import("@/lib/runwayGuard/snapshotJob")
  jobs = [
    { name: "MarginGuard snapshots", run: () => runMarginSnapshotSweep() },
    { name: "MarginGuard alerts", run: () => runMarginAlertSweep() },
    { name: "MarginGuard opportunities", run: () => runMarginOpportunitySweep() },
    { name: "RunwayGuard snapshots", run: () => runRunwaySnapshotSweep({ buildSummary: async () => {
      computed += 1
      return { usableCashCents: 100_000, runwayDays: 20, projectedExhaustionDay: 20, status: "critical", source: "estimate", confidence: 0.8, reasons: [], explainability: [] }
    } }) },
  ]
})

beforeEach(() => {
  facts = grantFacts()
  users = [setting]
  expireAfterSelection = false
  computed = reads = writes = batchReads = singleReads = 0
})

for (let index = 0; index < 4; index += 1) {
  test(`financial workflow ${index}: granted Small Business triggers known snapshot/alert/opportunity output despite inactive raw Essentials`, async () => {
    const result = await jobs[index].run()
    assert.equal(result.failed, 0, jobs[index].name)
    assert.equal(result.skipped, 0)
    assert.ok(writes > 0, jobs[index].name)
    assert.equal(batchReads, 3)
    assert.equal(singleReads, 1)
  })
  for (const mode of ["expired", "revoked", "unpaid", "risk", "unknown", "feature", "queued_expiry"] as const) {
    test(`financial workflow ${index}: ${mode} skips without computation, snapshot/alert writes or false resolution`, async () => {
      if (mode === "expired") facts.grant!.expiresAt = new Date(0)
      if (mode === "revoked") facts.grant!.revokedAt = now
      if (mode === "unpaid") facts.profile!.subscriptionStatus = "unpaid"
      if (mode === "risk") facts.billingRisks = [{ kind: "subscription_dispute", stripeStatus: "lost", blocking: true }]
      if (mode === "unknown") facts.profile = null
      if (mode === "feature") facts.grant!.plan = "essentials"
      if (mode === "queued_expiry") expireAfterSelection = true
      const result = await jobs[index].run()
      assert.equal(result.skipped, 1)
      assert.equal(result.failed, 0)
      assert.equal(computed + reads + writes, 0)
      assert.equal(batchReads, 3)
      assert.equal(singleReads, mode === "queued_expiry" ? 1 : 0)
    })
  }
  test(`financial workflow ${index}: denied cohort uses three batched entitlement reads, not N+1`, async () => {
    users = Array.from({ length: 50 }, (_, n) => ({ ...setting, userId: `tenant-${n}` }))
    facts.grant!.expiresAt = new Date(0)
    const result = await jobs[index].run()
    assert.equal(result.skipped, 50)
    assert.equal(batchReads, 3)
    assert.equal(singleReads, 0)
    assert.equal(reads + computed + writes, 0)
  })
}

test("financial gate retains exact exclusive expiry, paid/grace precedence and existing SpendLeak tier matrix", () => {
  const snapshot = grantFacts()
  snapshot.grant!.expiresAt = now
  assert.deepEqual(financialJobAccessSkip(resolveEffectiveAccess(snapshot, now), null), { status: "skipped", reason: "no_access" })
  snapshot.grant!.expiresAt = new Date("2099-01-01")
  assert.equal(financialJobAccessSkip(resolveEffectiveAccess(snapshot, now), "spendleak"), null)
  snapshot.grant!.plan = "business_pro"
  assert.equal(financialJobAccessSkip(resolveEffectiveAccess(snapshot, now), "spendleak")?.reason, "feature_not_available")
  snapshot.profile!.stripeSubscriptionId = "sub"
  snapshot.profile!.subscriptionStatus = "active"
  assert.equal(financialJobAccessSkip(resolveEffectiveAccess(snapshot, now), "marginguard_core")?.reason, "feature_not_available")
  snapshot.profile!.subscriptionStatus = "past_due"
  assert.equal(financialJobAccessSkip(resolveEffectiveAccess(snapshot, now), "marginguard_core")?.reason, "feature_not_available")
})