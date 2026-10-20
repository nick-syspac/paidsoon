import { z } from "zod"
import { CommitGuardCurrencySchema } from "@/lib/commitguard/cashContext"
import { projectCommitmentOccurrences, type CommitmentScheduleSnapshot } from "@/lib/commitguard/engine"
import { normalizeCommitmentConfidence, normalizeCommitmentFrequency, normalizeCommitmentStatus } from "@/lib/commitguard/types"

const cents = z.number().int().positive().max(2_147_483_647)
export const CoverageIdSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/)
export const CoverageInputSchema = z.strictObject({
  commitmentId: CoverageIdSchema,
  occurrenceDate: z.iso.date(),
  currency: CommitGuardCurrencySchema,
  coveredCents: cents,
  target: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("imported_bill"), id: CoverageIdSchema }),
    z.strictObject({ kind: z.literal("tax_reserve_category"), id: CoverageIdSchema }),
  ]),
})
export const CoverageUpdateSchema = CoverageInputSchema.extend({ id: CoverageIdSchema })
export type CoverageInput = z.infer<typeof CoverageInputSchema>
export interface CoverageRecord {
  id: string; userId: string; commitmentId: string; occurrenceDate: Date
  currency: string; coveredCents: number; targetKind: string
  importedBillId: string | null; taxReserveCategoryId: string | null
}
export interface CoverageCommitment extends Omit<CommitmentScheduleSnapshot, "frequency" | "status" | "confidence"> {
  userId: string; category: string; frequency: string; status: string; confidence: string
}
export interface CoverageBill {
  id: string; userId: string; currency: string; unpaidCents: number | null
  // Only an explicit, unambiguous source relationship may populate this identity.
  taxCategoryId: string | null
}
export interface CoverageTaxCategory {
  id: string; userId: string; enabled: boolean; currency: string | null
  requiredReserveCents: number | null
}
export interface CoverageSources {
  userId: string
  commitments: readonly CoverageCommitment[]
  bills: readonly CoverageBill[]
  taxCategories: readonly CoverageTaxCategory[]
  taxApplicable: boolean
}
export type CoverageReason = "coverage_target_stale" | "coverage_occurrence_stale" |
  "coverage_currency_invalid" | "coverage_amount_invalid" | "coverage_occurrence_cap" |
  "coverage_bill_cap" | "coverage_duplicate" | "coverage_tax_attribution_missing" |
  "tax_overlap_review_required" | "tax_protection_incomplete" | "commitment_projection_incomplete" |
  "protection_amount_overflow"
export interface CoverageReview { coverageId: string | null; commitmentId: string | null; reason: CoverageReason }
const validAmount = (value: number | null): value is number =>
  value !== null && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647
const currency = (value: string | null): string => value?.trim().toLowerCase() ?? ""
const dateKey = (value: Date): string => Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : "invalid"
const occurrenceKey = (row: { commitmentId: string; occurrenceDate: Date }): string => `${row.commitmentId}:${dateKey(row.occurrenceDate)}`

/** Exact current projected date, not a nearest-date/supplier/amount match. */
export function isLiveCoverageOccurrence(commitment: CoverageCommitment, occurrenceDate: Date): boolean {
  if (!Number.isFinite(occurrenceDate.getTime()) || occurrenceDate.toISOString() !== `${dateKey(occurrenceDate)}T00:00:00.000Z`) return false
  if (!["one_off", "weekly", "fortnightly", "monthly", "quarterly", "six_monthly", "annual"].includes(commitment.frequency) ||
    !["active", "upcoming", "ending", "review"].includes(commitment.status)) return false
  const end = new Date(occurrenceDate)
  end.setUTCDate(end.getUTCDate() + 1)
  try {
    return projectCommitmentOccurrences({
      commitment: { ...commitment, frequency: normalizeCommitmentFrequency(commitment.frequency),
        status: normalizeCommitmentStatus(commitment.status), confidence: normalizeCommitmentConfidence(commitment.confidence) },
      windowStart: occurrenceDate, windowEnd: end,
    }).some((row) => dateKey(row.dueDate) === dateKey(occurrenceDate))
  } catch { return false }
}

/** Provider balances already persisted in rawSourceData. Never use bill total as
 * unpaid amount: an 'open' bill may be partly paid. No provider calls or guessed
 * decimal strings/default currency. Unknown balances remain unsupported.
 */
export function explicitBillUnpaidCents(input: {
  status: string; paidDate: Date | null; amountCents: number; provider: string; rawSourceData: unknown
}): number | null {
  if (input.status !== "open" || input.paidDate !== null) return null
  const raw = input.rawSourceData
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const key = input.provider === "xero" ? "AmountDue" : input.provider === "myob" ? "BalanceDue" : null
  if (key === null || !(key in raw)) return null
  const amount = (raw as Record<string, unknown>)[key]
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null
  const rounded = Math.round(amount * 100)
  return Math.abs(amount * 100 - rounded) < 0.000001 && validAmount(rounded) &&
    validAmount(input.amountCents) && rounded <= input.amountCents ? rounded : null
}

/** Checks the whole tenant ledger, including out-of-window allocations for bill
 * caps. Invalid rows never produce deductions; callers choose a display window.
 */
export function inspectCoverage(sources: CoverageSources, rows: readonly CoverageRecord[]): {
  reviews: CoverageReview[]; valid: CoverageRecord[]; categoryByCoverage: Map<string, string>
} {
  const reviews: CoverageReview[] = []
  const categoryByCoverage = new Map<string, string>()
  const occurrenceTotals = new Map<string, number>()
  const billTotals = new Map<string, number>()
  const identities = new Map<string, number>()
  for (const row of rows) {
    if (row.userId !== sources.userId) continue
    const key = occurrenceKey(row)
    occurrenceTotals.set(key, (occurrenceTotals.get(key) ?? 0) + row.coveredCents)
    if (row.importedBillId) billTotals.set(row.importedBillId, (billTotals.get(row.importedBillId) ?? 0) + row.coveredCents)
    const identity = `${key}:${row.targetKind}:${row.importedBillId ?? row.taxReserveCategoryId}`
    identities.set(identity, (identities.get(identity) ?? 0) + 1)
  }
  for (const row of rows) {
    const add = (reason: CoverageReason): void => { reviews.push({ coverageId: row.id, commitmentId: row.commitmentId, reason }) }
    const commitment = sources.commitments.find((item) => item.id === row.commitmentId && item.userId === sources.userId)
    if (row.userId !== sources.userId || !commitment || !isLiveCoverageOccurrence(commitment, row.occurrenceDate)) {
      add("coverage_occurrence_stale"); continue
    }
    if (!validAmount(row.coveredCents) || row.coveredCents === 0 || !validAmount(commitment.amountCents)) add("coverage_amount_invalid")
    if (!CommitGuardCurrencySchema.safeParse(row.currency).success || currency(commitment.currency) !== row.currency) add("coverage_currency_invalid")
    if ((occurrenceTotals.get(occurrenceKey(row)) ?? 0) > commitment.amountCents) add("coverage_occurrence_cap")
    if ((identities.get(`${occurrenceKey(row)}:${row.targetKind}:${row.importedBillId ?? row.taxReserveCategoryId}`) ?? 0) > 1) add("coverage_duplicate")
    if (row.targetKind === "tax_reserve_category" && row.taxReserveCategoryId && !row.importedBillId) {
      const category = sources.taxCategories.find((item) => item.id === row.taxReserveCategoryId && item.userId === sources.userId)
      if (!sources.taxApplicable || !category?.enabled) add("coverage_target_stale")
      else if (category.currency !== row.currency || !validAmount(category.requiredReserveCents)) add("coverage_currency_invalid")
      else categoryByCoverage.set(row.id, category.id)
    } else if (row.targetKind === "imported_bill" && row.importedBillId && !row.taxReserveCategoryId) {
      const bill = sources.bills.find((item) => item.id === row.importedBillId && item.userId === sources.userId)
      if (!bill || !validAmount(bill.unpaidCents) || bill.unpaidCents === 0) add("coverage_target_stale")
      else {
        if (currency(bill.currency) !== row.currency) add("coverage_currency_invalid")
        if ((billTotals.get(bill.id) ?? 0) > bill.unpaidCents) add("coverage_bill_cap")
        if (sources.taxApplicable && (commitment.category === "tax" || bill.taxCategoryId !== null)) {
          const category = sources.taxCategories.find((item) => item.id === bill.taxCategoryId && item.userId === sources.userId)
          if (!category?.enabled || category.currency !== row.currency || !validAmount(category.requiredReserveCents)) add("coverage_tax_attribution_missing")
          else categoryByCoverage.set(row.id, category.id)
        }
      }
    } else add("coverage_target_stale")
  }
  const invalid = new Set(reviews.map((review) => review.coverageId))
  // No part of an overallocated occurrence/bill may be used by iteration order.
  return { reviews, valid: rows.filter((row) => !invalid.has(row.id)), categoryByCoverage }
}

export interface CoverageReconciliation {
  groups: Array<{ currency: string; committedCents: number; additionalTaxReserveCents: number;
    overlapAdjustmentCents: number; combinedProtectionCents: number;
    categories: Array<{ categoryId: string; requiredReserveCents: number; coveredCents: number; protectedCents: number }> }>
  quality: { state: "complete" | "incomplete"; reviews: CoverageReview[] }
}

/** Pure D4 integration point. Commitment total K is NEVER reduced. The category
 * ledger adds max(0, R - aggregate C), equivalently max(R,C) + uncovered K.
 * Bill links do not subtract cash movements here (CashPlan assembly is task 8).
 */
export function reconcileCommitGuardCoverage(input: CoverageSources & {
  coverages: readonly CoverageRecord[]; windowStart: Date; windowEnd: Date
}): CoverageReconciliation {
  const checked = inspectCoverage(input, input.coverages)
  const inWindow = (date: Date): boolean => date >= input.windowStart && date < input.windowEnd
  const selected = input.coverages.filter((row) => inWindow(row.occurrenceDate))
  const selectedIds = new Set(selected.map((row) => row.id))
  const reviews = checked.reviews.filter((review) => selectedIds.has(review.coverageId!))
  const groups: CoverageReconciliation["groups"] = []
  const group = (code: string): CoverageReconciliation["groups"][number] => {
    let found = groups.find((item) => item.currency === code)
    if (!found) { found = { currency: code, committedCents: 0, additionalTaxReserveCents: 0,
      overlapAdjustmentCents: 0, combinedProtectionCents: 0, categories: [] }; groups.push(found) }
    return found
  }
  const covered = new Map<string, number>()
  for (const row of checked.valid.filter((item) => selectedIds.has(item.id))) {
    const categoryId = checked.categoryByCoverage.get(row.id)
    if (categoryId) covered.set(categoryId, (covered.get(categoryId) ?? 0) + row.coveredCents)
  }
  for (const commitment of input.commitments.filter((row) => row.userId === input.userId)) {
    try {
      // Fail closed for unrecognised legacy recurrence/status rather than let
      // normalization fabricate a live one-off schedule.
      if (commitment.archivedAt || ["paused", "cancelled", "expired"].includes(commitment.status)) continue
      if (!["active", "upcoming", "ending", "review"].includes(commitment.status) ||
        !["one_off", "weekly", "fortnightly", "monthly", "quarterly", "six_monthly", "annual"].includes(commitment.frequency)) throw new Error("schedule")
      const occurrences = projectCommitmentOccurrences({ commitment: { ...commitment,
        frequency: normalizeCommitmentFrequency(commitment.frequency), status: normalizeCommitmentStatus(commitment.status),
        confidence: normalizeCommitmentConfidence(commitment.confidence) }, windowStart: input.windowStart, windowEnd: input.windowEnd })
      for (const occurrence of occurrences) {
        if (!validAmount(occurrence.amountCents)) throw new Error("amount")
        group(occurrence.currency).committedCents += occurrence.amountCents
        if (!CommitGuardCurrencySchema.safeParse(occurrence.currency).success) reviews.push({ coverageId: null, commitmentId: commitment.id, reason: "coverage_currency_invalid" })
        if (input.taxApplicable && commitment.category === "tax" && !checked.valid.some((row) =>
          row.commitmentId === commitment.id && dateKey(row.occurrenceDate) === dateKey(occurrence.dueDate) && checked.categoryByCoverage.has(row.id))) {
          reviews.push({ coverageId: null, commitmentId: commitment.id, reason: "tax_overlap_review_required" })
        }
      }
    } catch { reviews.push({ coverageId: null, commitmentId: commitment.id, reason: "commitment_projection_incomplete" }) }
  }
  if (input.taxApplicable) for (const category of input.taxCategories.filter((row) => row.userId === input.userId && row.enabled)) {
    if (!category.currency || !validAmount(category.requiredReserveCents) || !CommitGuardCurrencySchema.safeParse(category.currency).success) {
      reviews.push({ coverageId: null, commitmentId: null, reason: "tax_protection_incomplete" }); continue
    }
    const total = covered.get(category.id) ?? 0
    const ledger = group(category.currency)
    ledger.categories.push({ categoryId: category.id, requiredReserveCents: category.requiredReserveCents,
      coveredCents: total, protectedCents: Math.max(category.requiredReserveCents, total) })
    ledger.overlapAdjustmentCents += Math.min(category.requiredReserveCents, total)
    ledger.additionalTaxReserveCents += Math.max(0, category.requiredReserveCents - total)
  }
  for (const ledger of groups) {
    ledger.combinedProtectionCents = ledger.committedCents + ledger.additionalTaxReserveCents
    if (![ledger.committedCents, ledger.additionalTaxReserveCents, ledger.overlapAdjustmentCents, ledger.combinedProtectionCents].every(validAmount)) {
      reviews.push({ coverageId: null, commitmentId: null, reason: "protection_amount_overflow" })
    }
  }
  return { groups: groups.sort((a, b) => a.currency.localeCompare(b.currency)),
    quality: { state: reviews.length ? "incomplete" : "complete", reviews } }
}