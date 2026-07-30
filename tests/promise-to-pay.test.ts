import { describe, test } from "node:test"
import assert from "node:assert/strict"

// ---------------------------------------------------------------------------
// Pure-logic tests for promise-to-pay rules.
// No real DB, Resend, or Stripe calls.
// ---------------------------------------------------------------------------

// Simulate promise status lifecycle types
type PromiseStatus = "active" | "kept" | "broken" | "superseded"
type InvoiceStatus =
  | "pending"
  | "paused"
  | "snoozed"
  | "manually_resolved"
  | "paid"
  | "sequence_complete"

// ---------------------------------------------------------------------------
// Supersede logic — when a new promise is submitted, the previous active
// promise must be set to 'superseded'.
// ---------------------------------------------------------------------------

function supersede(promises: { status: PromiseStatus }[]): { status: PromiseStatus }[] {
  return promises.map((p) => (p.status === "active" ? { ...p, status: "superseded" } : p))
}

describe("Promise supersede logic", () => {
  test("supersedes the existing active promise when a new one is submitted", () => {
    const before = [{ status: "active" as PromiseStatus }]
    const after = supersede(before)
    assert.equal(after[0].status, "superseded")
  })

  test("does not affect already-superseded or broken promises", () => {
    const before = [
      { status: "superseded" as PromiseStatus },
      { status: "broken" as PromiseStatus },
    ]
    const after = supersede(before)
    assert.equal(after[0].status, "superseded")
    assert.equal(after[1].status, "broken")
  })

  test("second promise supersedes first, third supersedes second", () => {
    let promises: { status: PromiseStatus }[] = [{ status: "active" }]
    // Submit second promise
    promises = [...supersede(promises), { status: "active" }]
    assert.equal(promises[0].status, "superseded")
    assert.equal(promises[1].status, "active")
    // Submit third promise
    promises = [...supersede(promises), { status: "active" }]
    assert.equal(promises[0].status, "superseded")
    assert.equal(promises[1].status, "superseded")
    assert.equal(promises[2].status, "active")
  })
})

// ---------------------------------------------------------------------------
// Past-date rejection — clients must not commit to a date in the past.
// ---------------------------------------------------------------------------

function isValidFutureDate(isoDate: string): boolean {
  return new Date(isoDate) > new Date()
}

describe("Promise date validation", () => {
  test("rejects a date in the past", () => {
    assert.equal(isValidFutureDate("2020-01-01T00:00:00Z"), false)
  })

  test("rejects today (not strictly future)", () => {
    const today = new Date()
    today.setSeconds(today.getSeconds() - 1)
    assert.equal(isValidFutureDate(today.toISOString()), false)
  })

  test("accepts a clearly future date", () => {
    const future = new Date()
    future.setFullYear(future.getFullYear() + 1)
    assert.equal(isValidFutureDate(future.toISOString()), true)
  })
})

// ---------------------------------------------------------------------------
// Breach detection eligibility — only active promises on non-settled invoices
// whose promisedPayBy is in the past should be flagged as broken.
// ---------------------------------------------------------------------------

type MockPromise = {
  status: PromiseStatus
  promisedPayBy: Date
  invoiceStatus: InvoiceStatus
}

function isBreachEligible(p: MockPromise): boolean {
  if (p.status !== "active") return false
  if (p.promisedPayBy >= new Date()) return false
  if (p.invoiceStatus === "paid" || p.invoiceStatus === "manually_resolved") return false
  return true
}

const pastDate = new Date(Date.now() - 86_400_000) // yesterday
const futureDate = new Date(Date.now() + 86_400_000) // tomorrow

describe("Promise breach detection eligibility", () => {
  test("eligible: active promise, past date, pending invoice", () => {
    assert.equal(
      isBreachEligible({ status: "active", promisedPayBy: pastDate, invoiceStatus: "pending" }),
      true
    )
  })

  test("ineligible: already broken", () => {
    assert.equal(
      isBreachEligible({ status: "broken", promisedPayBy: pastDate, invoiceStatus: "pending" }),
      false
    )
  })

  test("ineligible: promise date not yet passed", () => {
    assert.equal(
      isBreachEligible({ status: "active", promisedPayBy: futureDate, invoiceStatus: "pending" }),
      false
    )
  })

  test("ineligible: invoice already paid", () => {
    assert.equal(
      isBreachEligible({ status: "active", promisedPayBy: pastDate, invoiceStatus: "paid" }),
      false
    )
  })

  test("ineligible: invoice manually resolved", () => {
    assert.equal(
      isBreachEligible({
        status: "active",
        promisedPayBy: pastDate,
        invoiceStatus: "manually_resolved",
      }),
      false
    )
  })
})

// ---------------------------------------------------------------------------
// Email suppression — invoices with an active promise must not receive
// scheduled follow-up emails.
// ---------------------------------------------------------------------------

type MockInvoice = {
  id: string
  status: InvoiceStatus
  promises: { status: PromiseStatus }[]
}

function isEmailEligible(invoice: MockInvoice): boolean {
  if (invoice.status !== "pending") return false
  if (invoice.promises.some((p) => p.status === "active")) return false
  return true
}

describe("Email suppression with active promise", () => {
  test("eligible: pending invoice, no active promise", () => {
    assert.equal(
      isEmailEligible({ id: "1", status: "pending", promises: [] }),
      true
    )
  })

  test("suppressed: pending invoice with active promise", () => {
    assert.equal(
      isEmailEligible({ id: "2", status: "pending", promises: [{ status: "active" }] }),
      false
    )
  })

  test("not suppressed: pending invoice with only broken promise", () => {
    assert.equal(
      isEmailEligible({ id: "3", status: "pending", promises: [{ status: "broken" }] }),
      true
    )
  })

  test("not suppressed: pending invoice with superseded promise only", () => {
    assert.equal(
      isEmailEligible({
        id: "4",
        status: "pending",
        promises: [{ status: "superseded" }],
      }),
      true
    )
  })

  test("not eligible: paused invoice regardless of promise", () => {
    assert.equal(
      isEmailEligible({ id: "5", status: "paused", promises: [] }),
      false
    )
  })
})

// ---------------------------------------------------------------------------
// Kept transition — when invoice is paid, active promise becomes 'kept'.
// ---------------------------------------------------------------------------

function applyPayment(promises: { status: PromiseStatus }[]): { status: PromiseStatus }[] {
  return promises.map((p) => (p.status === "active" ? { ...p, status: "kept" } : p))
}

describe("Promise kept on payment", () => {
  test("active promise becomes kept when invoice is paid", () => {
    const after = applyPayment([{ status: "active" }])
    assert.equal(after[0].status, "kept")
  })

  test("broken promise is not affected by payment", () => {
    const after = applyPayment([{ status: "broken" }])
    assert.equal(after[0].status, "broken")
  })

  test("superseded promise is not affected by payment", () => {
    const after = applyPayment([{ status: "superseded" }])
    assert.equal(after[0].status, "superseded")
  })
})
