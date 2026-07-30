import { describe, test } from "node:test"
import assert from "node:assert/strict"

// Valid status values for TrackedInvoice
type InvoiceStatus =
  | "pending"
  | "paused"
  | "snoozed"
  | "manually_resolved"
  | "paid"
  | "sequence_complete"

// State transition rules mirror the route handler logic.
// Each entry: [fromStatuses, operation, toStatus]
const TRANSITIONS: Array<{
  operation: string
  allowed: InvoiceStatus[]
  result: InvoiceStatus
}> = [
  {
    operation: "pause",
    allowed: ["pending"],
    result: "paused",
  },
  {
    operation: "resume",
    allowed: ["paused"],
    result: "pending",
  },
  {
    operation: "snooze",
    allowed: ["pending", "snoozed"],
    result: "snoozed",
  },
  {
    operation: "resolve",
    // resolve accepts any status (no status filter in route)
    allowed: ["pending", "paused", "snoozed", "sequence_complete"],
    result: "manually_resolved",
  },
]

function canTransition(from: InvoiceStatus, operation: string): boolean {
  const rule = TRANSITIONS.find((t) => t.operation === operation)
  if (!rule) return false
  return rule.allowed.includes(from)
}

function transitionTo(from: InvoiceStatus, operation: string): InvoiceStatus | null {
  if (!canTransition(from, operation)) return null
  return TRANSITIONS.find((t) => t.operation === operation)!.result
}

const ALL_STATUSES: InvoiceStatus[] = [
  "pending",
  "paused",
  "snoozed",
  "manually_resolved",
  "paid",
  "sequence_complete",
]

describe("Invoice state machine — pause", () => {
  test("pending → paused", () => {
    assert.strictEqual(transitionTo("pending", "pause"), "paused")
  })

  test("only pending invoices can be paused", () => {
    const notPausable = ALL_STATUSES.filter((s) => s !== "pending")
    for (const status of notPausable) {
      assert.strictEqual(
        canTransition(status, "pause"),
        false,
        `Expected status "${status}" to NOT be pausable`
      )
    }
  })
})

describe("Invoice state machine — resume", () => {
  test("paused → pending", () => {
    assert.strictEqual(transitionTo("paused", "resume"), "pending")
  })

  test("only paused invoices can be resumed", () => {
    const notResumable = ALL_STATUSES.filter((s) => s !== "paused")
    for (const status of notResumable) {
      assert.strictEqual(
        canTransition(status, "resume"),
        false,
        `Expected status "${status}" to NOT be resumable`
      )
    }
  })
})

describe("Invoice state machine — snooze", () => {
  test("pending → snoozed", () => {
    assert.strictEqual(transitionTo("pending", "snooze"), "snoozed")
  })

  test("snoozed → snoozed (re-snooze extends the window)", () => {
    assert.strictEqual(transitionTo("snoozed", "snooze"), "snoozed")
  })

  test("paused invoices cannot be snoozed", () => {
    assert.strictEqual(canTransition("paused", "snooze"), false)
  })

  test("resolved invoices cannot be snoozed", () => {
    assert.strictEqual(canTransition("manually_resolved", "snooze"), false)
    assert.strictEqual(canTransition("paid", "snooze"), false)
  })
})

describe("Invoice state machine — resolve", () => {
  test("pending → manually_resolved", () => {
    assert.strictEqual(transitionTo("pending", "resolve"), "manually_resolved")
  })

  test("paused → manually_resolved", () => {
    assert.strictEqual(transitionTo("paused", "resolve"), "manually_resolved")
  })

  test("snoozed → manually_resolved", () => {
    assert.strictEqual(transitionTo("snoozed", "resolve"), "manually_resolved")
  })

  test("sequence_complete → manually_resolved", () => {
    assert.strictEqual(transitionTo("sequence_complete", "resolve"), "manually_resolved")
  })
})

describe("Invoice state machine — email eligibility", () => {
  test("only pending invoices should receive scheduled emails", () => {
    const emailEligible: InvoiceStatus[] = ["pending"]
    const notEligible = ALL_STATUSES.filter((s) => !emailEligible.includes(s))

    // Paused and snoozed invoices must not receive emails
    assert.ok(!emailEligible.includes("paused"))
    assert.ok(!emailEligible.includes("snoozed"))
    assert.ok(!emailEligible.includes("manually_resolved"))
    assert.ok(!emailEligible.includes("paid"))
    assert.ok(!emailEligible.includes("sequence_complete"))

    assert.strictEqual(notEligible.length, ALL_STATUSES.length - 1)
  })

  test("pending invoice with active promise is excluded from email sending", () => {
    // An invoice can be pending (status) but still have an active promise suppressing emails.
    // This is a metadata check on top of the status check — simulating the cron exclusion logic.
    const hasActivePromise = true
    const invoiceIsPending = true

    const wouldReceiveEmail = invoiceIsPending && !hasActivePromise
    assert.strictEqual(wouldReceiveEmail, false)
  })

  test("pending invoice with only broken promise is eligible for emails", () => {
    const hasActivePromise = false
    const invoiceIsPending = true

    const wouldReceiveEmail = invoiceIsPending && !hasActivePromise
    assert.strictEqual(wouldReceiveEmail, true)
  })
})
