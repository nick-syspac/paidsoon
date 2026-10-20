import assert from "node:assert/strict"
import { before, mock, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CandidatePatchSchema, formatCandidateMoney, safeCandidateDate, safeCandidateEvidence } from "@/lib/commitguard/candidatePresentation"

let Review: typeof import("@/components/dashboard/commitguard/CommitGuardCandidateReview").CommitGuardCandidateReview
let Settings: typeof import("@/components/settings/CommitGuardSettingsClient").CommitGuardSettingsClient
before(async () => {
  await mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh: () => {} }) } })
  Review = (await import("@/components/dashboard/commitguard/CommitGuardCandidateReview")).CommitGuardCandidateReview
  Settings = (await import("@/components/settings/CommitGuardSettingsClient")).CommitGuardSettingsClient
})
const policy = { enabled: true, detectRecurringCommitments: true, detectionConfidenceThreshold: "medium" }
const candidate = { id: "synthetic", name: "Synthetic USD expense", category: "software", frequency: "monthly",
  typicalAmountCents: 12345, currency: "usd", confidence: "medium", source: "import", status: "pending",
  suggestedDueDate: "2026-10-31", latestObservedAt: "2026-09-30", recurrenceAnchor: "2026-01-31",
  supplierName: "Synthetic supplier", evidenceReviewRequired: true, evidence: { sampleCount: 3,
    sourceKind: "bill", observations: [{ sourceId: "synthetic-bill", date: "2026-09-30", currency: "usd", amountCents: 12345 }] } }

test("5.5 real React renderer shows pending count, evidence, UTC dates, changed corrections and source cents", () => {
  const html = renderToStaticMarkup(createElement(Review, { candidates: [candidate, { ...candidate, id: "ignored", status: "ignored" }], settings: policy }))
  for (const text of ["1 pending review", "Detect now", "Edit candidate", "Confirm", "Ignore", "Not a commitment",
    "123.45", "USD", "2026-10-31", "2026-09-30", "2026-01-31", "synthetic-bill", "Evidence changed since your correction", "Partial sources"]) assert.ok(html.includes(text), text)
  assert.equal(html.includes("A$123"), false)
})

for (const settings of [null, { ...policy, enabled: false }, { ...policy, detectRecurringCommitments: false }, { ...policy, detectionConfidenceThreshold: "confirmed" }]) {
  test(`5.5 real React renderer disables Detect with explanatory current policy ${JSON.stringify(settings)}`, () => {
    const html = renderToStaticMarkup(createElement(Review, { candidates: [], settings }))
    assert.match(html, /<button[^>]*disabled=""[^>]*>Detect now/)
    assert.match(html, /No candidates in this review view/)
    assert.match(html, /Reload detection settings|CommitGuard is disabled|Recurring detection is disabled|Legacy confirmed threshold requires review/)
  })
}

test("5.5 settings renderer does not silently present confirmed as high and offers only generated thresholds", () => {
  const settings = { ...policy, defaultHorizonDays: 30, safetyBufferMode: "fixed_amount" as const,
    safetyBufferFixedCents: 0, safetyBufferPercent: null, safetyBufferWeeks: null, detectionMinOccurrences: 3,
    detectionAmountVariancePercent: 12, detectionIntervalToleranceDays: 3, detectionConfidenceThreshold: "confirmed" as const,
    alertCommitmentDueSoon: true, alertRenewalApproaching: true, alertNoticePeriodApproaching: true,
    alertCommitmentAmountChanged: true, alertCommitmentBufferLow: true, alertCommitmentShortfall: true, renewalWarningDays: [7, 30] }
  const html = renderToStaticMarkup(createElement(Settings, { settings }))
  assert.match(html, /Legacy confirmed threshold requires review/)
  assert.equal(html.includes('<option value="confirmed"'), false)
  for (const value of ["low", "medium", "high"]) assert.ok(html.includes(`<option value="${value}"`))
  assert.match(html, /<option value="" disabled="" selected="">Choose a detection threshold/)
})

test("5.5 candidate boundary handles invalid dates, escaped evidence and rejects invented fields", () => {
  assert.equal(safeCandidateDate("not-a-date"), null)
  assert.equal(safeCandidateDate(new Date(NaN)), null)
  assert.equal(safeCandidateDate(null), null)
  assert.equal(formatCandidateMoney(12345, "usd"), "USD 123.45")
  assert.equal(formatCandidateMoney(12345, undefined), "Amount/currency needs review")
  const evidence = safeCandidateEvidence({ userId: "hidden", connectionId: "hidden", observations: [{
    userId: "hidden", sourceId: "<script>synthetic</script>", date: "bad", amountCents: 1, currency: "aud", rawSourceData: "hidden" }] })
  assert.equal(JSON.stringify(evidence).includes("hidden"), false)
  assert.equal(evidence.observations[0].date, null)
  assert.equal(CandidatePatchSchema.safeParse({ typicalAmountCents: 2_147_483_648 }).success, false)
  for (const key of ["currency", "notes", "supplierName", "userId"]) assert.equal(CandidatePatchSchema.safeParse({ [key]: "forged" }).success, false)
})