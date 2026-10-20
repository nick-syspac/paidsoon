import assert from "node:assert/strict"
import { test } from "node:test"
import { z } from "zod"
import { inferCommitmentCandidate, type CandidateSignal } from "@/lib/commitguard/detectionEngine"
import { CommitGuardSettingsSchema } from "@/lib/commitguard/settingsSchema"

function signals(count: number): CandidateSignal[] {
  return Array.from({ length: count }, (_, index) => ({
    connectionId: "connection-a", provider: "xero", sourceKind: "bill", sourceId: `bill-${index}`,
    observationId: `connection-a:bill:${index}`, signedAmountCents: 1000,
    direction: "outflow", status: "paid", reference: null,
    economicReferences: [{ kind: "provider_source_id", value: `bill-${index}` }],
    source: "accounting_integration", supplierKey: "synthetic:aud", supplierName: "Synthetic",
    supplierId: null, category: "other", currency: "aud", amountCents: 1000,
    date: new Date(Date.UTC(2026, 0, 1 + index * 7)),
  }))
}
const policy = { amountVariancePercent: 12, intervalToleranceDays: 3, confidenceThreshold: "low" as const }

for (let minimum = 2; minimum <= 10; minimum += 1) {
  test(`5.1 pure engine honors exactly ${minimum} configured occurrences`, () => {
    assert.equal(CommitGuardSettingsSchema.safeParse({ detectionMinOccurrences: minimum }).success, true)
    assert.equal(inferCommitmentCandidate({ ...policy, minOccurrences: minimum, signals: signals(minimum - 1) }), null)
    const result = inferCommitmentCandidate({ ...policy, minOccurrences: minimum, signals: signals(minimum) })
    assert.equal(result?.evidence.sampleCount, minimum)
    assert.equal(result?.frequency, "weekly")
    assert.equal(result?.medianAmount, 1000)
    assert.ok(result && ["low", "medium", "high"].includes(result.confidence))
  })
}

test("5.1 pure engine defaults to three without mutating observations", () => {
  const observations = signals(3).reverse()
  const before = structuredClone(observations)
  assert.equal(inferCommitmentCandidate({ ...policy, signals: signals(2) }), null)
  assert.ok(inferCommitmentCandidate({ ...policy, signals: observations }))
  assert.deepEqual(observations, before)
})

for (const minimum of [1, 11, 2.5, NaN, Infinity, -Infinity, null, "2"]) {
  test(`5.1 pure engine and settings boundary reject invalid minimum ${String(minimum)}`, () => {
    assert.equal(CommitGuardSettingsSchema.safeParse({ detectionMinOccurrences: minimum }).success, false)
    assert.throws(() => inferCommitmentCandidate({ ...policy,
      minOccurrences: minimum as number, signals: [],
    }), z.ZodError)
  })
}

test("5.1 extraction preserves amount, interval and confidence filters", () => {
  const varied = signals(3)
  varied[1].amountCents = 2000
  assert.equal(inferCommitmentCandidate({ ...policy, signals: varied }), null)
  const sameDate = signals(3).map((row) => ({ ...row, date: new Date("2026-01-01") }))
  assert.equal(inferCommitmentCandidate({ ...policy, signals: sameDate }), null)
  assert.equal(inferCommitmentCandidate({ ...policy, signals: signals(3), confidenceThreshold: "confirmed" }), null)
  assert.equal(inferCommitmentCandidate({ ...policy, signals: signals(3) })?.score, 0.85)
})