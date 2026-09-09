import test, { mock } from "node:test"
import assert from "node:assert/strict"

import { hasPlanFeature } from "@/lib/subscriptionPlans"

test("runway guard tier map exposes core access on the right plans", () => {
  assert.equal(hasPlanFeature("solo", "runwayguard_core"), true)
  assert.equal(hasPlanFeature("starter", "runwayguard_core"), false)
  assert.equal(hasPlanFeature("small_business", "runwayguard_scenarios"), true)
  assert.equal(hasPlanFeature("solo", "runwayguard_scenarios"), false)
})

test("runway guard access helpers reject access for blocked feature gates", async () => {
  await mock.module("@/lib/billing", {
    namedExports: {
      getSubscriptionTier: async () => "starter",
      requireFeature: async (_userId: string, feature: string) => {
        if (feature === "runwayguard_core") return false
        if (feature === "runwayguard_scenarios") return false
        return false
      },
    },
  })

  const { requireRunwayGuardCoreAccess, requireRunwayGuardScenarioAccess } = await import("@/lib/runwayGuard/entitlements")

  await assert.rejects(() => requireRunwayGuardCoreAccess("user-without-runwayguard"), /Upgrade required/)
  await assert.rejects(() => requireRunwayGuardScenarioAccess("user-without-runwayguard"), /Upgrade required/)
})
