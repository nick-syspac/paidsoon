import test from "node:test"
import assert from "node:assert/strict"
import {
  getBrokenPromiseCountForDebtor,
  isPromiseDebtorHighPriority,
} from "@/lib/dashboard/promisePriority"

test("getBrokenPromiseCountForDebtor resolves case-insensitive debtor email count", () => {
  const counts = {
    "alpha@example.com": 3,
    "beta@example.com": 1,
  }

  assert.equal(getBrokenPromiseCountForDebtor(counts, "ALPHA@example.com"), 3)
  assert.equal(getBrokenPromiseCountForDebtor(counts, "beta@example.com"), 1)
  assert.equal(getBrokenPromiseCountForDebtor(counts, "missing@example.com"), 0)
})

test("isPromiseDebtorHighPriority applies threshold with minimum one", () => {
  assert.equal(isPromiseDebtorHighPriority(0, 2), false)
  assert.equal(isPromiseDebtorHighPriority(2, 2), true)
  assert.equal(isPromiseDebtorHighPriority(1, 0), true)
})
