import { describe, test } from "node:test"
import assert from "node:assert/strict"

import { parseConnectionsFlash } from "@/lib/settings/connectionFlash"

describe("parseConnectionsFlash", () => {
  test("maps stripe source/code success to stripe success message", () => {
    const result = parseConnectionsFlash({ source: "stripe", code: "connected" })
    assert.equal(result.stripeSuccessMessage, "Stripe account connected successfully!")
    assert.equal(result.stripeErrorCode, null)
    assert.equal(result.accountingSuccessCode, null)
    assert.equal(result.accountingErrorCode, null)
  })

  test("maps xero source/code success for accounting section", () => {
    const result = parseConnectionsFlash({ source: "xero", code: "connected" })
    assert.equal(result.accountingSuccessCode, "xero_connected")
    assert.equal(result.accountingErrorCode, null)
    assert.equal(result.stripeSuccessMessage, null)
  })

  test("maps myob source/code error for accounting section", () => {
    const result = parseConnectionsFlash({ source: "myob", code: "missing_company_file" })
    assert.equal(result.accountingErrorCode, "missing_company_file")
    assert.equal(result.accountingSuccessCode, null)
    assert.equal(result.stripeErrorCode, null)
  })

  test("supports legacy stripe success/error values", () => {
    const result = parseConnectionsFlash({ success: "connected", error: "connection_limit_reached" })
    assert.equal(result.stripeSuccessMessage, "Stripe account connected successfully!")
    assert.equal(result.stripeErrorCode, "connection_limit_reached")
    assert.equal(result.accountingSuccessCode, null)
    assert.equal(result.accountingErrorCode, null)
  })

  test("supports legacy accounting success/error values", () => {
    const result = parseConnectionsFlash({ success: "myob_connected", error: "upgrade_required" })
    assert.equal(result.accountingSuccessCode, "myob_connected")
    assert.equal(result.accountingErrorCode, "upgrade_required")
    assert.equal(result.stripeSuccessMessage, null)
    assert.equal(result.stripeErrorCode, null)
  })
})
