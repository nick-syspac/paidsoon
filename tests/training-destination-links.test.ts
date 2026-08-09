import test from "node:test"
import assert from "node:assert/strict"
import {
  TRAINING_DESTINATION_REGISTRY,
  getTopLevelHelpTopic,
  resolveTrainingDestination,
} from "@/lib/help/destinations"

test("registry includes expected baseline destination keys", () => {
  assert.ok(TRAINING_DESTINATION_REGISTRY["help.top"])
  assert.ok(TRAINING_DESTINATION_REGISTRY["dashboard.overview"])
  assert.ok(TRAINING_DESTINATION_REGISTRY["settings.connections"])
})

test("resolveTrainingDestination returns canonical route for known public destination", () => {
  const result = resolveTrainingDestination("help.top", { isAuthenticated: false })

  assert.equal(result.href, "/help")
  assert.equal(result.usedFallback, false)
  assert.equal(result.fallbackReason, null)
})

test("resolveTrainingDestination falls back for unknown destination key", () => {
  const result = resolveTrainingDestination("does.not.exist", { isAuthenticated: true })

  assert.equal(result.href, getTopLevelHelpTopic())
  assert.equal(result.usedFallback, true)
  assert.equal(result.fallbackReason, "unknown_destination")
})

test("resolveTrainingDestination falls back for signed-in destination when unauthenticated", () => {
  const result = resolveTrainingDestination("dashboard.invoices", { isAuthenticated: false })

  assert.equal(result.href, getTopLevelHelpTopic())
  assert.equal(result.usedFallback, true)
  assert.equal(result.fallbackReason, "requires_sign_in")
})

test("resolveTrainingDestination resolves signed-in destination for authenticated users", () => {
  const result = resolveTrainingDestination("dashboard.invoices", { isAuthenticated: true })

  assert.equal(result.href, "/dashboard/invoices")
  assert.equal(result.usedFallback, false)
  assert.equal(result.fallbackReason, null)
})
