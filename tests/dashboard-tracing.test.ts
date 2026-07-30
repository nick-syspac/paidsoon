import { describe, test } from "node:test"
import assert from "node:assert/strict"
import {
  buildDashboardRenderTraceSummary,
  getDashboardRenderState,
} from "@/lib/diagnostics/dashboard"
import { redactForTrace } from "@/lib/diagnostics/shared"

describe("dashboard diagnostic trace summaries", () => {
  test("derives dashboard render states", () => {
    assert.equal(getDashboardRenderState(false, 10), "locked_preview")
    assert.equal(getDashboardRenderState(true, 0), "empty_state")
    assert.equal(getDashboardRenderState(true, 2), "invoice_table")
  })

  test("summarises dashboard render without raw invoice or customer data", () => {
    const summary = buildDashboardRenderTraceSummary({
      canShowDashboardModule: true,
      invoiceCount: 2,
      showResolved: false,
      hasConnection: true,
      atLimit: false,
    })

    assert.deepEqual(summary, {
      renderState: "invoice_table",
      showResolved: false,
      invoiceCount: 2,
      hasConnection: true,
      atLimit: false,
    })

    const output = JSON.stringify(redactForTrace({ outputs: summary }))
    assert.ok(!output.includes("clientEmail"))
    assert.ok(!output.includes("clientName"))
    assert.ok(!output.includes("paymentUrl"))
  })
})
