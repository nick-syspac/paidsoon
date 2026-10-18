import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import { resolveEffectiveAccess, type EffectiveAccessSnapshot } from "@/lib/billing/effectiveAccess"

let snapshot: EffectiveAccessSnapshot
let dbCalls = 0
let services: {
  margin: typeof import("@/lib/marginguard/service")
  tax: typeof import("@/lib/taxBuffer/service")
  commit: typeof import("@/lib/commitguard/detection")
  marginEntitlements: typeof import("@/lib/marginguard/entitlements")
  runwayEntitlements: typeof import("@/lib/runwayGuard/entitlements")
  commitEntitlements: typeof import("@/lib/commitguard/entitlements")
  depositEntitlements: typeof import("@/lib/depositGuard/entitlements")
}

before(async () => {
  await mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: {
    getEffectiveAccess: async () => resolveEffectiveAccess(snapshot, new Date()),
  } })
  await mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async () => { dbCalls += 1; throw new Error("unexpected computation") },
  } })
  services = {
    margin: await import("@/lib/marginguard/service"),
    tax: await import("@/lib/taxBuffer/service"),
    commit: await import("@/lib/commitguard/detection"),
    marginEntitlements: await import("@/lib/marginguard/entitlements"),
    runwayEntitlements: await import("@/lib/runwayGuard/entitlements"),
    commitEntitlements: await import("@/lib/commitguard/entitlements"),
    depositEntitlements: await import("@/lib/depositGuard/entitlements"),
  }
})

beforeEach(() => {
  dbCalls = 0
  snapshot = {
    profile: { subscriptionStatus: "canceled", subscriptionTier: "essentials", stripeSubscriptionId: null, trialEndsAt: null, billingAccessVersion: 0 },
    grant: { plan: "small_business", startsAt: new Date(0), expiresAt: new Date("2099-01-01"), revokedAt: null },
    billingRisks: [],
  }
})

test("existing requireFeature consumers inherit the granted plan without readiness/catalog changes", async () => {
  assert.equal(await services.marginEntitlements.getMarginGuardEntitlements("tenant").then((x) => x.hasAlertsAccess), true)
  assert.equal(await services.runwayEntitlements.getRunwayGuardEntitlements("tenant").then((x) => x.hasCoreAccess), true)
  assert.equal(await services.commitEntitlements.getCommitGuardEntitlements("tenant").then((x) => x.hasCoreAccess), true)
  const deposit = await services.depositEntitlements.getDepositGuardEntitlements("tenant")
  assert.equal(deposit.tier, "small_business")
  assert.equal(dbCalls, 0)
})

for (const mode of ["expired", "revoked", "restricted"] as const) {
  test(`shared MarginGuard, TaxBuffer and CommitGuard stop before computation for ${mode} grants`, async () => {
    if (mode === "expired") snapshot.grant!.expiresAt = new Date(0)
    if (mode === "revoked") snapshot.grant!.revokedAt = new Date()
    if (mode === "restricted") snapshot.profile!.subscriptionStatus = "incomplete"
    await assert.rejects(services.margin.getMarginSummary("tenant"), /Upgrade required/)
    await assert.rejects(services.tax.loadTaxBufferSummary("tenant"), /Upgrade required/)
    await assert.rejects(services.commit.detectCommitmentCandidates("tenant"), /Upgrade required/)
    assert.equal(dbCalls, 0)
    assert.equal((await services.marginEntitlements.getMarginGuardEntitlements("tenant")).hasCoreAccess, false)
    assert.equal((await services.runwayEntitlements.getRunwayGuardEntitlements("tenant")).hasCoreAccess, false)
    assert.equal((await services.depositEntitlements.getDepositGuardEntitlements("tenant")).tier, null)
  })
}