import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { CreateArrangementSchema } from "@/lib/arrangements"

describe("Arrangement input validation", () => {
  test("accepts valid full-payment arrangement payload", () => {
    const parsed = CreateArrangementSchema.safeParse({
      invoiceIds: ["inv-1"],
      arrangementType: "full_payment",
      promisedPayBy: new Date(Date.now() + 86_400_000).toISOString(),
    })
    assert.equal(parsed.success, true)
  })

  test("rejects partial-payment arrangement without amount", () => {
    const parsed = CreateArrangementSchema.safeParse({
      invoiceIds: ["inv-1"],
      arrangementType: "partial_payment",
      promisedPayBy: new Date(Date.now() + 86_400_000).toISOString(),
    })
    assert.equal(parsed.success, false)
  })

  test("rejects instalment-plan arrangement without plan schedule", () => {
    const parsed = CreateArrangementSchema.safeParse({
      invoiceIds: ["inv-1", "inv-2"],
      arrangementType: "instalment_plan",
    })
    assert.equal(parsed.success, false)
  })

  test("rejects unknown fields to prevent arrangement-like overposting", () => {
    const parsed = CreateArrangementSchema.safeParse({
      invoiceIds: ["inv-1"],
      arrangementType: "full_payment",
      promisedPayBy: new Date(Date.now() + 86_400_000).toISOString(),
      invoiceScope: "multi",
    })
    assert.equal(parsed.success, false)
  })
})
