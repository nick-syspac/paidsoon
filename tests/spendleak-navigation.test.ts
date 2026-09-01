import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { buildSpendLeakOverviewHref } from "@/lib/dashboard/spendleakNavigation"

describe("SpendLeak overview navigation", () => {
  test("preserves the strongest module filter when available", () => {
    assert.equal(buildSpendLeakOverviewHref(false, "duplicate_spend"), "/dashboard/spendleak?module=duplicate_spend")
  })

  test("falls back to the unfiltered route when there is no module context", () => {
    assert.equal(buildSpendLeakOverviewHref(false, null), "/dashboard/spendleak")
  })

  test("still routes to upgrade intent when SpendLeak is locked", () => {
    assert.equal(buildSpendLeakOverviewHref(true, "cash_pressure"), "/dashboard/settings/subscription?intent=spendleak")
  })
})
