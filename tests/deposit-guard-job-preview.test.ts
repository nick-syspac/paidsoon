import assert from "node:assert/strict"
import test from "node:test"

import { buildDepositGuardJobPreview } from "@/lib/depositGuard/jobForms"

test("deposit guard job preview calculates server totals for percentage deposits", () => {
  const preview = buildDepositGuardJobPreview({
    customerId: null,
    externalQuoteId: null,
    externalQuoteNumber: null,
    accountingProvider: null,
    name: "Website redesign",
    description: null,
    reference: null,
    currency: "aud",
    quotedAmountCents: 300_000,
    sourceAmountCents: 300_000,
    taxAmountCents: 30_000,
    sourceTaxMode: "exclusive",
    depositType: "percentage",
    depositPercentage: 25,
    depositFixedAmountCents: null,
    roundingMode: "nearest",
    expectedStartDate: null,
    expectedCompletionDate: null,
  })

  assert.equal(preview.totalAmountCents, 330_000)
  assert.equal(preview.requiredDepositAmountCents, 82_500)
  assert.equal(preview.outstandingAmountCents, 330_000)
  assert.equal(preview.commencementBlocked, true)
})

test("deposit guard job preview handles fixed deposits without blocking the helper", () => {
  const preview = buildDepositGuardJobPreview({
    customerId: null,
    externalQuoteId: null,
    externalQuoteNumber: null,
    accountingProvider: null,
    name: "Retainer",
    description: null,
    reference: null,
    currency: "aud",
    quotedAmountCents: 120_000,
    sourceAmountCents: 120_000,
    taxAmountCents: null,
    sourceTaxMode: "inclusive",
    depositType: "fixed",
    depositPercentage: null,
    depositFixedAmountCents: 25_000,
    roundingMode: "nearest",
    expectedStartDate: null,
    expectedCompletionDate: null,
  })

  assert.equal(preview.totalAmountCents, 120_000)
  assert.equal(preview.requiredDepositAmountCents, 25_000)
  assert.equal(preview.commencementBlocked, true)
})