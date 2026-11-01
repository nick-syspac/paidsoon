import assert from "node:assert/strict"
import { test } from "node:test"

import {
  jobMatchesAccountCutoff,
  milestoneMatchesAccountCutoff,
  paymentMatchesAccountCutoff,
} from "@/lib/depositGuard/accountCutoff"

test("job and child date mapping respects the account display cutoff", () => {
  const cutoff = new Date("2026-10-10T00:00:00.000Z")

  assert.equal(jobMatchesAccountCutoff({ expectedStartDate: new Date("2026-10-09T00:00:00.000Z") }, cutoff), false)
  assert.equal(jobMatchesAccountCutoff({ expectedStartDate: new Date("2026-10-10T00:00:00.000Z") }, cutoff), true)
  assert.equal(jobMatchesAccountCutoff({ expectedCompletionDate: new Date("2026-10-12T00:00:00.000Z") }, cutoff), true)
  assert.equal(jobMatchesAccountCutoff({ expectedStartDate: null, expectedCompletionDate: null }, cutoff), false)

  assert.equal(milestoneMatchesAccountCutoff({ targetDate: new Date("2026-10-09T00:00:00.000Z") }, cutoff), false)
  assert.equal(milestoneMatchesAccountCutoff({ targetDate: new Date("2026-10-10T00:00:00.000Z") }, cutoff), true)
  assert.equal(milestoneMatchesAccountCutoff({ targetDate: null }, cutoff), false)

  assert.equal(paymentMatchesAccountCutoff({ paidAt: new Date("2026-10-09T00:00:00.000Z") }, cutoff), false)
  assert.equal(paymentMatchesAccountCutoff({ createdAt: new Date("2026-10-10T00:00:00.000Z") }, cutoff), true)
  assert.equal(paymentMatchesAccountCutoff({ paidAt: null, createdAt: null }, cutoff), false)
})
