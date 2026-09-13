import assert from "node:assert/strict"
import test from "node:test"

import { calculateRequiredDeposit } from "@/lib/depositGuard/calculations"

test("calculates percentage deposit from tax-inclusive total", () => {
  const result = calculateRequiredDeposit({
    depositType: "percentage",
    depositPercentage: 30,
    sourceAmountCents: 150_000,
    sourceTaxMode: "inclusive",
    amountPaidCents: 20_000,
  })

  assert.equal(result.totalAmountCents, 150_000)
  assert.equal(result.requiredDepositAmountCents, 45_000)
  assert.equal(result.outstandingAmountCents, 130_000)
  assert.equal(result.commencementBlocked, true)
})

test("clamps outstanding balances at zero when payments exceed total", () => {
  const result = calculateRequiredDeposit({
    depositType: "none",
    sourceAmountCents: 50_000,
    sourceTaxMode: "inclusive",
    amountPaidCents: 60_000,
  })

  assert.equal(result.outstandingAmountCents, 0)
  assert.equal(result.commencementBlocked, false)
})

test("calculates percentage deposit from tax-exclusive amount and tax", () => {
  const result = calculateRequiredDeposit({
    depositType: "percentage",
    depositPercentage: 20,
    sourceAmountCents: 100_000,
    taxAmountCents: 10_000,
    sourceTaxMode: "exclusive",
    amountPaidCents: 22_000,
  })

  assert.equal(result.totalAmountCents, 110_000)
  assert.equal(result.requiredDepositAmountCents, 22_000)
  assert.equal(result.commencementBlocked, false)
})

test("rounds percentage deposits according to mode", () => {
  const down = calculateRequiredDeposit({
    depositType: "percentage",
    depositPercentage: 33.333,
    sourceAmountCents: 100,
    sourceTaxMode: "inclusive",
    roundingMode: "down",
  })
  const nearest = calculateRequiredDeposit({
    depositType: "percentage",
    depositPercentage: 33.333,
    sourceAmountCents: 100,
    sourceTaxMode: "inclusive",
    roundingMode: "nearest",
  })
  const up = calculateRequiredDeposit({
    depositType: "percentage",
    depositPercentage: 33.333,
    sourceAmountCents: 100,
    sourceTaxMode: "inclusive",
    roundingMode: "up",
  })

  assert.equal(down.requiredDepositAmountCents, 33)
  assert.equal(nearest.requiredDepositAmountCents, 33)
  assert.equal(up.requiredDepositAmountCents, 34)
})

test("supports fixed deposit and no-deposit modes", () => {
  const fixed = calculateRequiredDeposit({
    depositType: "fixed",
    depositFixedAmountCents: 50_000,
    sourceAmountCents: 200_000,
    sourceTaxMode: "inclusive",
    amountPaidCents: 50_000,
  })
  const none = calculateRequiredDeposit({
    depositType: "none",
    sourceAmountCents: 200_000,
    sourceTaxMode: "inclusive",
  })

  assert.equal(fixed.requiredDepositAmountCents, 50_000)
  assert.equal(fixed.commencementBlocked, false)
  assert.equal(none.requiredDepositAmountCents, 0)
  assert.equal(none.commencementBlocked, false)
})

test("throws when required deposit exceeds total amount", () => {
  assert.throws(
    () =>
      calculateRequiredDeposit({
        depositType: "fixed",
        depositFixedAmountCents: 120_000,
        sourceAmountCents: 100_000,
        sourceTaxMode: "inclusive",
      }),
    /cannot exceed total amount/i,
  )
})

test("throws on non-integer cents", () => {
  assert.throws(
    () =>
      calculateRequiredDeposit({
        depositType: "percentage",
        depositPercentage: 10,
        sourceAmountCents: 1000.5,
        sourceTaxMode: "inclusive",
      }),
    /must be an integer/i,
  )
})
