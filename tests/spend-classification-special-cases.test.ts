import assert from "node:assert/strict"
import { test } from "node:test"

import { hasUnnormalizedSplitLineDetails } from "@/lib/spendClassification/specialCases"

test("detects provider split rows without fabricating line allocations", () => {
  assert.equal(hasUnnormalizedSplitLineDetails({ LineItems: [{}, {}] }), true)
  assert.equal(hasUnnormalizedSplitLineDetails({ Lines: [{}, {}] }), true)
  assert.equal(hasUnnormalizedSplitLineDetails({ LineItems: [{}] }), false)
  assert.equal(hasUnnormalizedSplitLineDetails({ LineItems: "two lines" }), false)
  assert.equal(hasUnnormalizedSplitLineDetails(null), false)
})
