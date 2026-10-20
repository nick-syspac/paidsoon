import { createHash } from "node:crypto"
import { z } from "zod"
import type { CashPlanAssemblyInputs } from "@/lib/cashplan/assembler"
import { getCashPlanWeekIndex } from "@/lib/cashplan/calendar"
import { applyCashPlanOverrides, type CashPlanStoredOverride, type CashPlanPlannedReview } from "@/lib/cashplan/overrides"
import { buildCashPlanCanonicalFactBundle, buildCashPlanForecast,
  type CashPlanCanonicalFactBundle, type CashPlanForecast } from "@/lib/cashplan/engine"
import { CoverageIdSchema, explicitBillUnpaidCents, inspectCoverage, type CoverageCommitment,
  type CoverageRecord } from "@/lib/commitguard/coverage"
import { projectCommitmentOccurrences } from "@/lib/commitguard/engine"
import { normalizeCommitmentConfidence, normalizeCommitmentFrequency,
  normalizeCommitmentStatus } from "@/lib/commitguard/types"

const cents = z.number().int().min(0).max(2_147_483_647)
const identity = z.string().min(1).max(256).refine((value) => value.trim().length > 0)
const factSchema = z.strictObject({
  id: identity, kind: z.enum(["inflow", "outflow"]), amountCents: cents, currency: identity,
  dueDate: z.iso.date(), weekIndex: z.number().int().min(0).max(12).nullable(),
  included: z.boolean().optional(), appliedOverrideId: identity.optional(),
  sourceSystem: z.enum(["commitguard", "imported_bill", "manual"]), sourceId: identity,
  sourceUpdatedAt: z.iso.datetime(), sourceRevision: identity, sourceHash: identity,
  coverageIds: z.array(identity).max(1000),
})
export type CashPlanCanonicalFact = z.infer<typeof factSchema>

/** Only reconstructable references are reusable. This is not an ingestion
 * registry: unknown source kinds must wait for a documented validating adapter. */
export const CashPlanSnapshotFactsSchema = z.strictObject({
  timezone: identity, horizonWeeks: z.literal(13), settingsRevision: identity,
  facts: z.array(factSchema).max(10_000),
})
export interface CashPlanFactSnapshot {
  id: string; planId: string; scenarioId: string | null; inputVersion: number
  anchorDate: Date | null; inputCurrency: string | null; cashInputRevision: number | null
  commitmentRevision: number | null; canonicalFacts: unknown; coverage: unknown
  inputQuality: unknown; inputHash: string
}
export interface CashPlanBillInput {
  id: string; userId: string; accountingConnectionId: string; sourceId: string
  currency: string; amountCents: number; dueDate: Date | null; paidDate: Date | null
  status: string; rawSourceData: unknown; sourceUpdatedAt: Date | null; syncedAt: Date
  accountingConnection: { userId: string; provider: string }
}
export type CashPlanCommitmentInput = CoverageCommitment & { updatedAt: Date }
export interface CashPlanFactIssue {
  reason: "coverage_review" | "currency_excluded" | "projection_incomplete" |
    "source_invalid" | "snapshot_lineage_review" | "legacy_snapshot_review" | "override_review" | "timing_review"
  sourceId: string
}
export interface CashPlanFactAssembly {
  inputs: CashPlanAssemblyInputs
  facts: CashPlanCanonicalFact[]
  bundle: CashPlanCanonicalFactBundle
  forecast: CashPlanForecast | null
  commitmentRevision: number
  coverage: Array<{ coverageId: string; occurrenceId: string; billFactId: string; amountCents: number; currency: string }>
  reusedSnapshotId: string | null
  plannedItems: CashPlanPlannedReview[]
  quality: { state: "preliminary" | "unavailable"; reasons: string[]; issues: CashPlanFactIssue[] }
  sourceCoverage: { boundary: "commitments_and_explicitly_covered_bills"; receivables: "missing"; payables: "partial" }
}
// PostgreSQL JSONB may reorder object keys. Integrity must not depend on JS
// insertion order, while array order remains an explicit part of the contract.
function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stableValue)
  if (value !== null && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]))
  return value
}
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex")
const day = (value: Date): string => value.toISOString().slice(0, 10)
const validDate = (value: Date | null): value is Date => value instanceof Date && Number.isFinite(value.getTime())
const snapshotQualitySchema = z.strictObject({
  state: z.enum(["preliminary", "unavailable"]), reasons: z.array(identity).max(1000),
  issues: z.array(z.strictObject({ reason: z.enum(["coverage_review", "currency_excluded", "projection_incomplete",
    "source_invalid", "snapshot_lineage_review", "legacy_snapshot_review", "override_review", "timing_review"]), sourceId: identity })).max(10_000),
})
const settingsRevision = (inputs: CashPlanAssemblyInputs): string => hash({
  planId: inputs.plan?.id, planUpdatedAt: inputs.plan?.updatedAt.toISOString(),
  settingsId: inputs.settings?.id ?? null, settingsUpdatedAt: inputs.settings?.updatedAt.toISOString() ?? null,
  configuration: inputs.configuration,
})

/** Integrity contract for reconstructable v2 inputs, never for opaque weeks.
 * Snapshot production/POST refresh is intentionally not part of this reader. */
export function cashPlanSnapshotFactsHash(input: {
  planId: string; anchorDate: string; currency: string; cashInputRevision: number
  commitmentRevision: number; canonicalFacts: z.infer<typeof CashPlanSnapshotFactsSchema>
  coverage: CashPlanFactAssembly["coverage"]; inputQuality: unknown
}): string { return hash(input) }

export function cashPlanSnapshotFactsMetadata(
  inputs: CashPlanAssemblyInputs, facts: CashPlanCanonicalFact[],
): z.infer<typeof CashPlanSnapshotFactsSchema> {
  return { timezone: inputs.configuration!.timezone, horizonWeeks: 13,
    settingsRevision: settingsRevision(inputs), facts }
}

/** Pure D9/8.2-8.3: no persistence or consumer routing (8.4).
 * Tax reserve protection is deliberately not accepted as a cash movement. */
export function assembleCashPlanFacts(input: {
  userId: string; inputs: CashPlanAssemblyInputs; enabled: boolean; commitmentRevision: number
  commitments: readonly CashPlanCommitmentInput[]; coverages: readonly CoverageRecord[]
  bills: readonly CashPlanBillInput[]; snapshot?: CashPlanFactSnapshot | null
  overrides?: readonly CashPlanStoredOverride[]
}): CashPlanFactAssembly {
  const { inputs } = input
  const issues: CashPlanFactIssue[] = []
  const facts: CashPlanCanonicalFact[] = []
  const coverage: CashPlanFactAssembly["coverage"] = []
  let plannedItems: CashPlanPlannedReview[] = []
  const issue = (reason: CashPlanFactIssue["reason"], sourceId: string): void => {
    if (!issues.some((row) => row.reason === reason && row.sourceId === sourceId)) issues.push({ reason, sourceId })
  }
  const anchor = inputs.anchor
  const code = inputs.configuration?.currency
  const projected: CashPlanCanonicalFact[] = []
  const billFacts: CashPlanCanonicalFact[] = []
  const linkedBills = new Set(input.coverages.filter((row) => row.userId === input.userId &&
    row.targetKind === "imported_bill" && row.taxReserveCategoryId === null).map((row) => row.importedBillId))
  const billBalances = new Map<string, number | null>()
  if (input.enabled && anchor && inputs.configuration?.horizonWeeks === 13) {
    // Widen calendar projection by a day at each end, then use the same local
    // week-index contract for every source (including negative-offset zones).
    const start = new Date(`${anchor.date}T00:00:00Z`)
    start.setUTCDate(start.getUTCDate() - 1)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 94)
    for (const row of input.commitments) {
      if (row.userId !== input.userId || row.archivedAt || ["paused", "cancelled", "expired"].includes(row.status)) continue
      if (row.currency.trim().toLowerCase() !== code) { issue("currency_excluded", row.id); continue }
      if (!CoverageIdSchema.safeParse(row.id).success || !cents.safeParse(row.amountCents).success || !validDate(row.updatedAt) ||
        !["active", "upcoming", "ending", "review"].includes(row.status) ||
        !["one_off", "weekly", "fortnightly", "monthly", "quarterly", "six_monthly", "annual"].includes(row.frequency)) {
        issue("projection_incomplete", row.id); continue
      }
      try {
        for (const occurrence of projectCommitmentOccurrences({ commitment: { ...row,
          frequency: normalizeCommitmentFrequency(row.frequency), status: normalizeCommitmentStatus(row.status),
          confidence: normalizeCommitmentConfidence(row.confidence) }, windowStart: start, windowEnd: end })) {
          const dueDate = day(occurrence.dueDate)
          const weekIndex = getCashPlanWeekIndex(dueDate, anchor)
          if (weekIndex === null) continue
          const id = `commitguard:${row.id}:${dueDate}`
          projected.push({ id, kind: "outflow", amountCents: row.amountCents, currency: code!, dueDate, weekIndex,
            sourceSystem: "commitguard", sourceId: row.id, sourceUpdatedAt: row.updatedAt.toISOString(),
            sourceRevision: `${input.commitmentRevision}:${row.updatedAt.toISOString()}`,
            sourceHash: hash({ id, amountCents: row.amountCents, currency: code, updatedAt: row.updatedAt }), coverageIds: [] })
        }
      } catch { issue("projection_incomplete", row.id) }
    }
    for (const bill of input.bills) {
      if (!linkedBills.has(bill.id) || bill.userId !== input.userId) continue
      const unpaid = bill.accountingConnection.userId === input.userId
        ? explicitBillUnpaidCents({ ...bill, provider: bill.accountingConnection.provider }) : null
      billBalances.set(bill.id, unpaid)
      if (bill.currency.trim().toLowerCase() !== code) { issue("currency_excluded", bill.id); continue }
      if (unpaid === null || !CoverageIdSchema.safeParse(bill.id).success || !validDate(bill.dueDate) || !validDate(bill.sourceUpdatedAt ?? bill.syncedAt) ||
        !identity.safeParse(bill.sourceId).success || !identity.safeParse(bill.accountingConnectionId).success) {
        issue("source_invalid", bill.id); continue
      }
      const dueDate = day(bill.dueDate)
      const weekIndex = getCashPlanWeekIndex(dueDate, anchor)
      if (weekIndex === null) continue
      const sourceUpdatedAt = (bill.sourceUpdatedAt ?? bill.syncedAt).toISOString()
      billFacts.push({ id: `imported_bill:${bill.id}`, kind: "outflow", amountCents: unpaid,
        currency: code!, dueDate, weekIndex, sourceSystem: "imported_bill",
        // Preserve connection/provider/source identity, not supplier/amount matching.
        sourceId: `${bill.accountingConnectionId}:${bill.accountingConnection.provider}:${bill.sourceId}`,
        sourceUpdatedAt, sourceRevision: sourceUpdatedAt,
        sourceHash: hash({ id: bill.id, connection: bill.accountingConnectionId, provider: bill.accountingConnection.provider,
          sourceId: bill.sourceId, unpaid, dueDate, currency: code, sourceUpdatedAt }), coverageIds: [] })
    }
    const checked = inspectCoverage({ userId: input.userId, commitments: input.commitments,
      bills: input.bills.map((bill) => ({ id: bill.id, userId: bill.userId, currency: bill.currency,
        unpaidCents: billBalances.get(bill.id) ?? null, taxCategoryId: null })),
      taxApplicable: false, taxCategories: [] }, input.coverages)
    const validIds = new Set(checked.valid.map((row) => row.id))
    for (const row of input.coverages.filter((row) => row.userId === input.userId && row.targetKind === "imported_bill")) {
      const occurrence = validDate(row.occurrenceDate)
        ? projected.find((fact) => fact.id === `commitguard:${row.commitmentId}:${day(row.occurrenceDate)}`) : undefined
      if (!occurrence) {
        if (!validIds.has(row.id)) issue("coverage_review", row.id)
        continue
      }
      const bill = billFacts.find((fact) => fact.id === `imported_bill:${row.importedBillId}`)
      if (!validIds.has(row.id) || !bill || bill.currency !== occurrence.currency) { issue("coverage_review", row.id); continue }
      coverage.push({ coverageId: row.id, occurrenceId: occurrence.id, billFactId: bill.id,
        amountCents: row.coveredCents, currency: occurrence.currency })
      occurrence.coverageIds.push(row.id)
      bill.coverageIds.push(row.id)
    }
    // Only bills participating in at least one valid in-window allocation enter
    // the canonical set. An invalid/excluded target cannot erase a residual.
    facts.push(...billFacts.filter((fact) => fact.coverageIds.length > 0), ...projected)
  }
  if (anchor && inputs.plan && inputs.configuration?.horizonWeeks === 13) {
    const applied = applyCashPlanOverrides({ planId: inputs.plan.id, now: new Date(inputs.evaluatedAt),
      anchor, targets: facts, overrides: input.overrides ?? [] })
    facts.splice(0, facts.length, ...applied.targets, ...applied.manual.map((fact) => ({ ...fact,
      currency: code!, sourceSystem: "manual" as const, sourceRevision: fact.sourceUpdatedAt,
      sourceHash: hash(fact), coverageIds: [] })))
    plannedItems = applied.plannedItems
    for (const row of applied.issues) issue(row.reason, row.sourceId)
  }
  // Reconcile only after overrides: moving/excluding/reducing a covered bill
  // must restore the occurrence's gross residual. Preserve source references
  // on excluded facts, but publish only actually applied coverage allocations.
  const allocations = [...coverage]
  coverage.length = 0
  for (const row of allocations) {
    const occurrence = facts.find((fact) => fact.id === row.occurrenceId)
    const bill = facts.find((fact) => fact.id === row.billFactId)
    const occurrenceTotal = allocations.filter((item) => item.occurrenceId === row.occurrenceId)
      .reduce((sum, item) => sum + item.amountCents, 0)
    const billTotal = allocations.filter((item) => item.billFactId === row.billFactId)
      .reduce((sum, item) => sum + item.amountCents, 0)
    if (!occurrence || !bill || occurrence.included === false || bill.included === false ||
      occurrence.weekIndex === null || bill.weekIndex === null ||
      occurrenceTotal > occurrence.amountCents || billTotal > bill.amountCents) {
      issue("coverage_review", row.coverageId); continue
    }
    coverage.push(row)
  }
  for (const fact of facts) {
    if (fact.sourceSystem === "commitguard") fact.amountCents -= coverage
      .filter((row) => row.occurrenceId === fact.id).reduce((sum, row) => sum + row.amountCents, 0)
  }
  // Never hand an oversized partial source set to the normalising engine.
  // Live sources and persisted inputs have the same bounded canonical limit.
  const sourceLimitExceeded = facts.length > 10_000
  if (sourceLimitExceeded) {
    facts.length = 0
    coverage.length = 0
    issue("projection_incomplete", "canonical_fact_limit")
  }
  facts.sort((a, b) => a.id.localeCompare(b.id))
  coverage.sort((a, b) => a.coverageId.localeCompare(b.coverageId))
  for (const fact of facts) fact.coverageIds.sort()
  let reusedSnapshotId: string | null = null
  const snapshot = input.snapshot
  if (snapshot) {
    if (snapshot.inputVersion !== 2) issue("legacy_snapshot_review", snapshot.id)
    else {
      const parsed = CashPlanSnapshotFactsSchema.safeParse(snapshot.canonicalFacts)
      const parsedQuality = snapshotQualitySchema.safeParse(snapshot.inputQuality)
      // Reconstruct and compare every reference, amount, date and coverage. A
      // valid digest alone cannot authorize a stale/missing/unknown source.
      const expected = anchor && inputs.plan ? cashPlanSnapshotFactsMetadata(inputs, facts) : null
      const valid = expected && parsed.success && parsedQuality.success && snapshot.planId === inputs.plan!.id && snapshot.scenarioId === null &&
        validDate(snapshot.anchorDate) && snapshot.anchorDate.toISOString() === `${anchor!.date}T00:00:00.000Z` &&
        snapshot.inputCurrency === code && snapshot.cashInputRevision === inputs.cashContext.revision &&
        snapshot.commitmentRevision === input.commitmentRevision &&
        hash(parsed.data) === hash(expected) && hash(snapshot.coverage) === hash(coverage) &&
        snapshot.inputHash === cashPlanSnapshotFactsHash({ planId: inputs.plan!.id, anchorDate: anchor!.date,
          currency: code!, cashInputRevision: inputs.cashContext.revision, commitmentRevision: input.commitmentRevision,
          canonicalFacts: parsed.data, coverage, inputQuality: snapshot.inputQuality })
      if (valid) reusedSnapshotId = snapshot.id
      else issue("snapshot_lineage_review", snapshot.id)
    }
  }
  const included = facts.filter((fact) => fact.included !== false && fact.weekIndex !== null)
    .map((fact) => ({ ...fact, weekIndex: fact.weekIndex!, sourceUpdatedAt: new Date(fact.sourceUpdatedAt) }))
  const bundle = buildCashPlanCanonicalFactBundle({ inflows: included.filter((fact) => fact.kind === "inflow"),
    outflows: included.filter((fact) => fact.kind === "outflow") })
  const forecast = inputs.startingBalance.amountCents === null || sourceLimitExceeded ? null : buildCashPlanForecast({
    openingCashCents: inputs.startingBalance.amountCents, inflows: bundle.inflows, outflows: bundle.outflows,
    bufferTargetCents: inputs.configuration?.bufferTargetCents, now: new Date(inputs.evaluatedAt),
  })
  if (forecast && issues.some((row) => row.reason === "timing_review")) {
    forecast.dataQualityIssues.push({ type: "timing_review", severity: "high",
      message: "Manual planned items need an explicit planned UTC date." })
    if (forecast.status === "healthy") forecast.status = "preliminary"
  }
  return { inputs, facts, bundle, forecast, commitmentRevision: input.commitmentRevision, coverage, reusedSnapshotId, plannedItems,
    quality: { state: forecast ? "preliminary" : "unavailable",
      reasons: [...new Set([...inputs.quality.reasons, "partial_source_coverage",
        ...(facts.every((fact) => fact.sourceSystem === "commitguard") ? ["commitments_only"] : []),
        ...(!input.enabled ? ["commitguard_disabled"] : []), ...issues.map((row) => row.reason)])], issues },
    sourceCoverage: { boundary: "commitments_and_explicitly_covered_bills", receivables: "missing", payables: "partial" } }
}