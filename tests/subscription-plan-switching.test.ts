import assert from "node:assert/strict"
import test from "node:test"

import { getPlanChangeImpact } from "@/lib/subscriptionPlans"

test("getPlanChangeImpact lists lost features and limit reductions for downgrades", () => {
  const impact = getPlanChangeImpact("small_business", "essentials")

  assert.ok(impact.lostFeatures.includes("Custom reminder templates"))
  assert.ok(impact.lostFeatures.includes("Verified from domain"))
  assert.ok(impact.limitChanges.some((change) => change.includes("→ 10")))
  assert.ok(impact.limitChanges.some((change) => change.includes("→ 1")))
})
