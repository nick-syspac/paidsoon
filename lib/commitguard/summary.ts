import { z } from "zod"
import { CommitGuardCurrencySchema, type CommitGuardCashContextDto } from "@/lib/commitguard/cashContext"
import { buildCommitmentProtection, buildRenewalAssessments, CommitmentProjectionError,
  projectCommitmentOccurrences, type CommitmentHorizonTotals, type CommitmentProtectionProjection } from "@/lib/commitguard/engine"
import { composeCommitGuardProtection, getCommitGuardProtectionQuality,
  type CommitGuardProtectionReason } from "@/lib/commitguard/protectionComposition"
import { reconcileCommitGuardCoverage, type CoverageRecord, type CoverageSources } from "@/lib/commitguard/coverage"
import type { CommitGuardProtectionFacts } from "@/lib/commitguard/protectionFacts"
import type { CommitmentSnapshot, CommitGuardSettingsSnapshot } from "@/lib/commitguard/types"

export const COMMIT_GUARD_QUERY_MIGRATION_MESSAGE =
  "Query overrides are no longer supported. Save owner inputs with PUT /api/commitguard/cash-context."
// Validate the entries, not an object assembled from a known-key allowlist:
// unknown, duplicate, empty and currency/date override keys must all fail closed.
export const CommitGuardSummaryQuerySchema = z.array(z.tuple([z.string(), z.string()])).max(0)

export interface CommitGuardSummaryInput {
  settings: CommitGuardSettingsSnapshot
  calculationRevision: number
  cashContext: CommitGuardCashContextDto
  commitments: CommitmentSnapshot[]
  tax: CommitGuardProtectionFacts
  coverage: { sources: CoverageSources; rows: CoverageRecord[] }
  now: Date
}

function projectionWithQuality(input: CommitGuardSummaryInput): {
  projection: CommitmentProtectionProjection; reasons: CommitGuardProtectionReason[]
} {
  const reasons: CommitGuardProtectionReason[] = []
  const valid: CommitmentSnapshot[] = []
  const failedCurrencies = new Set<string>()
  // An invalid currency group's partial sum is never published as a total.
  // Independent complete groups remain visible, without FX or guessed currency.
  const currencies = [...new Set(input.commitments.map((row) => row.currency.trim().toLowerCase()))].sort()
  for (const currency of currencies) {
    const rows = input.commitments.filter((row) => row.currency.trim().toLowerCase() === currency)
    try {
      buildCommitmentProtection({ commitments: rows, cashCurrency: input.cashContext.currency,
        selectedHorizonDays: input.settings.defaultHorizonDays, now: input.now })
      valid.push(...rows)
    } catch (error) {
      if (!(error instanceof CommitmentProjectionError)) throw error
      reasons.push(error.code)
      failedCurrencies.add(currency)
    }
  }
  const projection = buildCommitmentProtection({ commitments: valid,
    cashCurrency: input.cashContext.currency, selectedHorizonDays: input.settings.defaultHorizonDays, now: input.now })
  if (failedCurrencies.has(input.cashContext.currency ?? "")) {
    projection.selectedCurrencyTotals = null
    projection.monthlyCommitmentsCents = null
  }
  return { projection, reasons }
}

/** D1-D4 composition only. No storage, events, defaults or external services. */
export function buildCommitGuardSummary(input: CommitGuardSummaryInput) {
  const { settings, cashContext, tax, now } = input
  const { projection, reasons } = projectionWithQuality(input)
  const windowStart = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
  const windowEnd = new Date(windowStart)
  windowEnd.setUTCDate(windowEnd.getUTCDate() + projection.selectedHorizonDays)
  const overlap = reconcileCommitGuardCoverage({ ...input.coverage.sources,
    coverages: input.coverage.rows, windowStart, windowEnd })
  reasons.push(...tax.quality.reasons.filter((reason) => reason !== "not_applicable"),
    ...overlap.quality.reviews.map((review) => review.reason))
  // Full required reserve is exposed as a component; only its uncovered
  // remainder enters the additive composition. Never subtract the gap/reserved.
  const adjustment = overlap.groups.reduce((sum, group) => sum + group.overlapAdjustmentCents, 0)
  const taxAdditional = tax.amountCents === null ? null : Math.max(0, tax.amountCents - adjustment)
  const composition = composeCommitGuardProtection({ settings, cashContext,
    commitmentProtection: projection, taxProtection: { amountCents: taxAdditional, currency: tax.currency }, reasons, now })
  const quality = { ...composition.quality, actions: qualityActions(composition.quality.reasons) }
  const totalsComplete = reasons.length === 0 ||
    // Cash/tax/coverage quality does not invalidate independently calculated horizons.
    !reasons.some((reason) => ["unsupported_recurrence", "missing_next_due_date", "invalid_date",
      "invalid_boundaries", "invalid_amount", "amount_overflow", "occurrence_limit_exceeded"].includes(reason))
  const onlyGroup = projection.horizonsByCurrency.length === 1 ? projection.horizonsByCurrency[0] : null
  const horizons: CommitmentHorizonTotals[] | null = totalsComplete && onlyGroup?.supportedForFreeCash
    ? onlyGroup.horizons.map(({ days, totalCents, confirmedCents, probableCents, potentialCents }) =>
      ({ days, totalCents, confirmedCents, probableCents, potentialCents })) : null
  return {
    version: 2 as const, asOf: now.toISOString(), inputRevision: cashContext.revision,
    calculationRevision: input.calculationRevision, enabled: settings.enabled,
    selectedHorizonDays: projection.selectedHorizonDays, cashContext, settings,
    currency: cashContext.currency, horizonsByCurrency: projection.horizonsByCurrency,
    horizons, commitmentProtection: projection,
    protection: {
      commitments: projection, tax, coverage: overlap,
      safetyBuffer: { mode: settings.safetyBufferMode, amountCents: composition.safetyBufferCents,
        currency: settings.safetyBufferMode === "fixed_amount" ? settings.safetyBufferCurrency ?? null : cashContext.currency,
        weeklyExpensesAsOf: cashContext.weeklyExpensesAsOf },
      additionalTaxReserveCents: taxAdditional,
    },
    sourceDates: {
      balanceAsOf: cashContext.balanceAsOf, weeklyExpensesAsOf: cashContext.weeklyExpensesAsOf,
      commitments: input.commitments.map((row) => ({ commitmentId: row.id, updatedAt: row.updatedAt.toISOString() })),
      taxCategories: tax.categories.map((row) => ({ categoryId: row.categoryId,
        categoryUpdatedAt: row.categoryUpdatedAt, overrideCreatedAt: row.overrideCreatedAt, sources: row.sources })),
    },
    quality,
    renewals: buildRenewalAssessments({ commitments: input.commitments, now, warningDays: settings.renewalWarningDays }),
    freeCash: {
      cashAvailableCents: cashContext.amountCents,
      committedCashCents: settings.enabled ? composition.committedCashCents : null,
      taxProtectedCashCents: settings.enabled && (tax.amountCents === 0 || tax.currency === cashContext.currency)
        ? tax.amountCents : null,
      safetyBufferCents: settings.enabled ? composition.safetyBufferCents : null,
      protectedCashCents: composition.protectedCashCents,
      freeCashCents: composition.freeCashCents, status: composition.status, currency: composition.currency,
    },
  }
}

export type CommitGuardSummary = ReturnType<typeof buildCommitGuardSummary>

function qualityActions(reasons: readonly CommitGuardProtectionReason[]): string[] {
  return [...new Set(reasons.map((reason) => reason === "module_disabled" ? "enable_commitguard"
    : reason.startsWith("cash_") ? "update_cash_context"
    : reason.startsWith("weekly_") ? "update_weekly_expenses"
    : reason.startsWith("tax_") ? "review_tax_protection"
    : reason.startsWith("coverage_") ? "review_coverage"
    : reason.includes("buffer") ? "review_buffer_policy" : "review_commitments"))]
}

/** External fact DTO only, not the CashPlan assembler (task 8). No bill
 * deduction or reserve movement; preserve gross opening cash and coverage IDs. */
export function buildCommitGuardCashPlanAdapter(input: CommitGuardSummaryInput, summary: CommitGuardSummary) {
  const start = new Date(`${input.now.toISOString().slice(0, 10)}T00:00:00Z`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 91)
  const reasons: CommitGuardProtectionReason[] = []
  const occurrences = input.settings.enabled ? input.commitments.flatMap((commitment) => {
    try {
      return projectCommitmentOccurrences({ commitment, windowStart: start, windowEnd: end }).map((row) => {
        if (!Number.isInteger(row.amountCents) || row.amountCents < 0) throw new CommitmentProjectionError("invalid_amount")
        if (row.amountCents > 2_147_483_647) throw new CommitmentProjectionError("amount_overflow")
        if (!CommitGuardCurrencySchema.safeParse(row.currency).success) reasons.push("unsupported_currency")
        if (row.currency !== summary.currency) reasons.push("currency_mismatch")
        const dueDate = row.dueDate.toISOString().slice(0, 10)
        return { id: `commitguard:${row.commitmentId}:${dueDate}`, commitmentId: row.commitmentId,
          dueDate, amountCents: row.amountCents, currency: row.currency, confidence: row.confidence,
          sourceRevision: commitment.updatedAt.toISOString(),
          coverage: input.coverage.rows.filter((coverage) => coverage.commitmentId === row.commitmentId &&
            coverage.occurrenceDate.toISOString().slice(0, 10) === dueDate).map((coverage) => ({
            id: coverage.id, currency: coverage.currency, coveredCents: coverage.coveredCents,
            targetKind: coverage.targetKind, targetId: coverage.importedBillId ?? coverage.taxReserveCategoryId,
          })),
        }
      })
    } catch (error) {
      if (!(error instanceof CommitmentProjectionError)) throw error
      reasons.push(error.code)
      return []
    }
  }) : []
  const month = summary.enabled ? summary.horizons?.find((row) => row.days === 30) : null
  return { version: 2 as const, asOf: summary.asOf, inputRevision: summary.inputRevision,
    calculationRevision: summary.calculationRevision, enabled: summary.enabled,
    selectedHorizonDays: summary.selectedHorizonDays, cashContext: summary.cashContext,
    window: { start: start.toISOString().slice(0, 10), endExclusive: end.toISOString().slice(0, 10) },
    quality: { ...getCommitGuardProtectionQuality([...summary.quality.reasons, ...reasons]),
      actions: qualityActions([...summary.quality.reasons, ...reasons]) },
    // Historical diagnostic totals remain in the workspace, not active external
    // contribution fields. Disable never deletes source records or cash inputs.
    horizonsByCurrency: summary.enabled ? summary.horizonsByCurrency : [],
    protection: summary.enabled ? summary.protection : null,
    sourceDates: summary.sourceDates, occurrences,
    committedOutflow: {
      currency: summary.enabled && summary.horizonsByCurrency.length === 1 ? summary.horizonsByCurrency[0].currency : null,
      next30DaysCents: month?.totalCents ?? null, confirmedNext30DaysCents: month?.confirmedCents ?? null,
      probableNext30DaysCents: month?.probableCents ?? null, potentialNext30DaysCents: month?.potentialCents ?? null,
    },
    freeCash: summary.freeCash,
  }
}