import { describe, test } from "node:test"
import assert from "node:assert/strict"

import { computeOutstanding } from "@/lib/invoices/payments"

describe("computeOutstanding", () => {
  test("with zero payments, outstanding equals amountDue", () => {
    assert.strictEqual(computeOutstanding({ amountDue: 10_000 }, []), 10_000)
  })

  test("a single full payment brings outstanding to zero", () => {
    assert.strictEqual(computeOutstanding({ amountDue: 10_000 }, [{ amount: 10_000 }]), 0)
  })

  test("multiple partial payments reduce the outstanding balance", () => {
    assert.strictEqual(
      computeOutstanding({ amountDue: 10_000 }, [{ amount: 3_000 }, { amount: 4_000 }]),
      3_000,
    )
  })

  test("overpayment floors outstanding at zero rather than going negative", () => {
    assert.strictEqual(computeOutstanding({ amountDue: 10_000 }, [{ amount: 12_000 }]), 0)
  })
})
