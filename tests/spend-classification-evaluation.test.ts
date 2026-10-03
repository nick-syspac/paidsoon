import assert from "node:assert/strict"
import { test } from "node:test"

import {
  evaluateSyntheticSpendClassification,
  exportSyntheticSpendFixtureCsv,
  SPEND_EVALUATION_CATEGORIES,
  SYNTHETIC_SPEND_EVALUATION_FIXTURE,
} from "@/lib/spendClassification/evaluation"

test("synthetic fixture contains 300–500 candidate records across the approved categories and special cases", () => {
  assert.ok(SYNTHETIC_SPEND_EVALUATION_FIXTURE.length >= 300)
  assert.ok(SYNTHETIC_SPEND_EVALUATION_FIXTURE.length <= 500)
  assert.equal(new Set(SYNTHETIC_SPEND_EVALUATION_FIXTURE.map(({ id }) => id)).size, 320)
  assert.deepEqual(
    new Set(SYNTHETIC_SPEND_EVALUATION_FIXTURE.map(({ expectedCategoryId }) => expectedCategoryId).filter(Boolean)),
    new Set(SPEND_EVALUATION_CATEGORIES.map(({ id }) => id)),
  )
  assert.deepEqual(
    new Set(SYNTHETIC_SPEND_EVALUATION_FIXTURE.map(({ scenario }) => scenario)),
    new Set(["ordinary", "ambiguous", "unlinked_refund", "unknown_direction", "internal_transfer", "unsupported_split"]),
  )
  assert.deepEqual(
    new Set(SYNTHETIC_SPEND_EVALUATION_FIXTURE.map(({ providerSource }) => providerSource)),
    new Set(["xero", "myob", "csv"]),
  )
  assert.deepEqual(
    new Set(SYNTHETIC_SPEND_EVALUATION_FIXTURE.map(({ merchantFrequency }) => merchantFrequency)),
    new Set(["common", "rare"]),
  )
  assert.equal(SYNTHETIC_SPEND_EVALUATION_FIXTURE.filter(({ merchantFrequency }) => merchantFrequency === "common").length, 240)
  assert.equal(SYNTHETIC_SPEND_EVALUATION_FIXTURE.filter(({ merchantFrequency }) => merchantFrequency === "rare").length, 80)
  assert.ok(SYNTHETIC_SPEND_EVALUATION_FIXTURE.every(({ reviewStatus }) => reviewStatus === "human_reviewed"))
  assert.ok(SYNTHETIC_SPEND_EVALUATION_FIXTURE.filter(({ expectedDecision }) => expectedDecision === "classify")
    .every(({ description, expectedCategoryId }) => {
      const category = SPEND_EVALUATION_CATEGORIES.find(({ id }) => id === expectedCategoryId)
      return category !== undefined && description.toLowerCase().includes(category.signal)
    }))
  assert.ok(SYNTHETIC_SPEND_EVALUATION_FIXTURE.filter(({ scenario }) => scenario === "ambiguous")
    .every(({ expectedDecision, expectedCategoryId }) => expectedDecision === "review" && expectedCategoryId === null))
})

test("merchant and time holdouts have no train/holdout leakage", () => {
  const merchantTraining = new Set(
    SYNTHETIC_SPEND_EVALUATION_FIXTURE.filter(({ merchantHoldout }) => merchantHoldout === "train")
      .map(({ merchant }) => merchant),
  )
  const merchantHoldout = new Set(
    SYNTHETIC_SPEND_EVALUATION_FIXTURE.filter(({ merchantHoldout }) => merchantHoldout === "holdout")
      .map(({ merchant }) => merchant),
  )
  assert.equal([...merchantTraining].some((merchant) => merchantHoldout.has(merchant)), false)
  for (const split of ["train", "holdout"] as const) {
    assert.deepEqual(
      new Set(SYNTHETIC_SPEND_EVALUATION_FIXTURE.filter((record) => record.merchantHoldout === split)
        .map(({ merchantFrequency }) => merchantFrequency)),
      new Set(["common", "rare"]),
    )
  }

  const trainingDates = SYNTHETIC_SPEND_EVALUATION_FIXTURE
    .filter(({ timeHoldout }) => timeHoldout === "train")
    .map(({ transactionDate }) => transactionDate)
  const holdoutDates = SYNTHETIC_SPEND_EVALUATION_FIXTURE
    .filter(({ timeHoldout }) => timeHoldout === "holdout")
    .map(({ transactionDate }) => transactionDate)
  assert.ok(Math.max(...trainingDates.map(Date.parse)) < Math.min(...holdoutDates.map(Date.parse)))
})

test("candidate CSV export includes expected labels and pending review provenance for every synthetic row", () => {
  const csv = exportSyntheticSpendFixtureCsv()
  const rows = csv.trimEnd().split("\n")
  assert.equal(rows.length, SYNTHETIC_SPEND_EVALUATION_FIXTURE.length + 1)
  assert.match(rows[0], /expectedCategoryName.*expectedDecision.*scenario.*fixtureStatus.*reviewer.*reviewedAt/)
  assert.match(rows[1], /"synthetic-spend-0001".*"human_reviewed".*"human_reviewed".*"User".*"2026-10-03"/)
  assert.ok(rows.slice(1).every((row) => row.includes("human_reviewed") && row.includes("User") && row.includes("2026-10-03")))
})

test("offline benchmark compares rules with supplied Jev observations and reports unavailable live metrics as null", () => {
  const observations = Object.fromEntries(
    SYNTHETIC_SPEND_EVALUATION_FIXTURE
      .filter(({ direction, description }) => direction === "outflow" && !description.toLowerCase().includes("internal transfer") && !description.toLowerCase().includes("split"))
      .map((record) => [record.id, {
        categoryId: record.expectedCategoryId ?? "software_cloud",
        confidence: record.expectedDecision === "review" ? 0.4 : 0.9,
        probabilities: Object.fromEntries(SPEND_EVALUATION_CATEGORIES.map(({ id }) => [
          id,
          id === (record.expectedCategoryId ?? "software_cloud")
            ? (record.expectedDecision === "review" ? 0.4 : 0.9)
            : (record.expectedDecision === "review" ? 0.6 / (SPEND_EVALUATION_CATEGORIES.length - 1) : 0.1 / (SPEND_EVALUATION_CATEGORIES.length - 1)),
        ])),
        latencyMs: 125,
        inputTokens: 100,
        outputTokens: 10,
        model: "jev-1.13.0",
      }]),
  )

  const report = evaluateSyntheticSpendClassification(SYNTHETIC_SPEND_EVALUATION_FIXTURE, observations, 0.042, 0.015)
  assert.equal(report.fixtureStatus, "human_reviewed")
  assert.equal(report.fixtureRecords, 320)
  assert.deepEqual(report.strata.providerSource, { xero: 107, myob: 107, csv: 106 })
  assert.deepEqual(report.strata.merchantFrequency, { common: 240, rare: 80 })
  assert.equal(report.holdouts.merchant.rulesPlusJev.latencyP50Ms, 125)
  assert.equal(report.holdouts.merchant.rulesPlusJev.inputTokens !== null, true)
  assert.equal(report.holdouts.merchant.rulesPlusJev.estimatedCostUsd !== null, true)
  assert.equal(report.holdouts.merchant.rulesPlusJev.estimatedCostPerJevRequestUsd !== null, true)
  assert.equal(report.holdouts.merchant.rulesPlusJev.macroPrecision! < 1, true)
  assert.ok(
    report.holdouts.merchant.rulesPlusJev.macroF1! > report.holdouts.merchant.rulesOnly.macroF1!,
  )
  const expectedCost = report.holdouts.merchant.rulesPlusJev.jevObservationCount * (100 * 0.042 + 10 * 0.015) / 1_000_000
  assert.ok(Math.abs(report.holdouts.merchant.rulesPlusJev.estimatedCostUsd! - expectedCost) < 1e-12)
  assert.equal(report.holdouts.time.rulesPlusJev.latencyP95Ms, 125)
  assert.ok(report.holdouts.time.rulesPlusJev.jevObservationCount > 0)
  assert.equal(report.holdouts.merchant.rulesOnly.latencyP50Ms, null)
  assert.equal(report.holdouts.merchant.rulesOnly.inputTokens, null)
  assert.equal(report.notes.some((note) => note.includes("human reviewer")), false)
})
