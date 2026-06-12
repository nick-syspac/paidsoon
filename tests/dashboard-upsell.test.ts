import test from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_NEAR_LIMIT_THRESHOLD,
  LOCKED_DASHBOARD_SAMPLE_ROWS,
  buildDashboardUpsellModel,
  getNextTierRecommendation,
  hasFeatureIntentSignal,
  isNearLimit,
} from "@/lib/dashboardUpsell"

test("next-tier recommendation follows plan ladder", () => {
  assert.equal(getNextTierRecommendation("starter"), "solo")
  assert.equal(getNextTierRecommendation("solo"), "small_business")
  assert.equal(getNextTierRecommendation("small_business"), null)
})

test("near-limit helper returns true at threshold or above", () => {
  assert.equal(isNearLimit(8, 10, DEFAULT_NEAR_LIMIT_THRESHOLD), true)
  assert.equal(isNearLimit(7, 10, DEFAULT_NEAR_LIMIT_THRESHOLD), false)
})

test("feature intent detection supports upsell signals", () => {
  assert.equal(hasFeatureIntentSignal("templates"), true)
  assert.equal(hasFeatureIntentSignal("ai_rewrite"), true)
  assert.equal(hasFeatureIntentSignal("unknown"), false)
})

test("locked dashboard model contains sample label and rows", () => {
  const model = buildDashboardUpsellModel({
    tier: "starter",
    usageCount: 1,
    usageLimit: 10,
    showResolved: false,
  })

  assert.equal(model.badgeLabel, "Sample preview")
  assert.equal(model.recommendedTier, "solo")
  assert.equal(model.sampleRows.length, LOCKED_DASHBOARD_SAMPLE_ROWS.length)
})

test("near-limit or intent upgrades copy context in model", () => {
  const nearLimitModel = buildDashboardUpsellModel({
    tier: "starter",
    usageCount: 9,
    usageLimit: 10,
    showResolved: false,
  })
  assert.equal(nearLimitModel.nearLimit, true)

  const intentModel = buildDashboardUpsellModel({
    tier: "solo",
    usageCount: 1,
    usageLimit: 30,
    showResolved: true,
    featureIntent: "templates",
  })
  assert.equal(intentModel.nearLimit, true)
  assert.equal(intentModel.recommendedTier, "small_business")
})
