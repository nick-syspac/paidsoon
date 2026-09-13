import assert from "node:assert/strict"
import test from "node:test"

import { calculateDepositGuardMilestoneAmountCents } from "@/lib/depositGuard/milestonesCore"
import {
  deriveCommencementState,
  deriveDepositRequestStatusForPayment,
} from "@/lib/depositGuard/status"

test("request payment sync moves requested to partially_paid and paid", () => {
  const partial = deriveDepositRequestStatusForPayment({
    previousStatus: "requested",
    totalAmountCents: 50_000,
    confirmedPaidCents: 20_000,
  })
  const paid = deriveDepositRequestStatusForPayment({
    previousStatus: "partially_paid",
    totalAmountCents: 50_000,
    confirmedPaidCents: 50_000,
  })

  assert.equal(partial, "partially_paid")
  assert.equal(paid, "paid")
})

test("request payment sync keeps terminal statuses", () => {
  const cancelled = deriveDepositRequestStatusForPayment({
    previousStatus: "cancelled",
    totalAmountCents: 50_000,
    confirmedPaidCents: 50_000,
  })
  const failed = deriveDepositRequestStatusForPayment({
    previousStatus: "failed",
    totalAmountCents: 50_000,
    confirmedPaidCents: 50_000,
  })

  assert.equal(cancelled, "cancelled")
  assert.equal(failed, "failed")
})

test("commencement stays blocked until required deposit is paid", () => {
  const blocked = deriveCommencementState({
    previousWorkStatus: "draft",
    requiredDepositAmountCents: 30_000,
    amountPaidCents: 0,
  })
  const unblocked = deriveCommencementState({
    previousWorkStatus: "awaiting_deposit",
    requiredDepositAmountCents: 30_000,
    amountPaidCents: 30_000,
  })

  assert.equal(blocked.commencementBlocked, true)
  assert.equal(blocked.workStatus, "awaiting_deposit")
  assert.equal(unblocked.commencementBlocked, false)
  assert.equal(unblocked.workStatus, "ready_to_start")
  assert.equal(unblocked.changedToUnblocked, true)
})

test("terminal work states remain unchanged", () => {
  const completed = deriveCommencementState({
    previousWorkStatus: "completed",
    requiredDepositAmountCents: 10_000,
    amountPaidCents: 0,
  })

  assert.equal(completed.workStatus, "completed")
  assert.equal(completed.commencementBlocked, false)
  assert.equal(completed.changedToUnblocked, false)
})

test("milestone totals calculate from percentage and fixed amounts", () => {
  const percentage = calculateDepositGuardMilestoneAmountCents({
    totalAmountCents: 200_000,
    amountType: "percentage",
    percentage: 12.5,
  })
  const fixed = calculateDepositGuardMilestoneAmountCents({
    totalAmountCents: 200_000,
    amountType: "fixed",
    fixedAmountCents: 50_000,
  })

  assert.equal(percentage, 25_000)
  assert.equal(fixed, 50_000)
})
