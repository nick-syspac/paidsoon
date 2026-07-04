import { describe, test } from "node:test"
import assert from "node:assert/strict"

type ArrangementStatus = "active" | "broken" | "fulfilled" | "expired"
type InvoiceStatus = "pending" | "paid" | "manually_resolved"

function isSuppressedByArrangement(input: {
  arrangementStatus: ArrangementStatus
  invoiceStatus: InvoiceStatus
}): boolean {
  if (input.invoiceStatus !== "pending") return false
  return input.arrangementStatus === "active"
}

function shouldResumeAfterArrangementLifecycle(status: ArrangementStatus): boolean {
  return status === "broken" || status === "expired" || status === "fulfilled"
}

describe("Arrangement reminder suppression", () => {
  test("suppresses reminders while arrangement is active", () => {
    assert.equal(
      isSuppressedByArrangement({ arrangementStatus: "active", invoiceStatus: "pending" }),
      true,
    )
  })

  test("does not suppress reminders for broken arrangement", () => {
    assert.equal(
      isSuppressedByArrangement({ arrangementStatus: "broken", invoiceStatus: "pending" }),
      false,
    )
  })

  test("does not suppress reminders for paid invoice", () => {
    assert.equal(
      isSuppressedByArrangement({ arrangementStatus: "active", invoiceStatus: "paid" }),
      false,
    )
  })
})

describe("Arrangement lifecycle auto-resume", () => {
  test("resumes reminders after arrangement is broken", () => {
    assert.equal(shouldResumeAfterArrangementLifecycle("broken"), true)
  })

  test("resumes reminders after arrangement expires", () => {
    assert.equal(shouldResumeAfterArrangementLifecycle("expired"), true)
  })

  test("does not require resume while arrangement remains active", () => {
    assert.equal(shouldResumeAfterArrangementLifecycle("active"), false)
  })
})
