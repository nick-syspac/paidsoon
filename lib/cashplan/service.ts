import { z } from "zod"
import { requireSubscriptionAccess, SubscriptionAccessError } from "@/lib/billing/accessGuard"
import type { EffectiveAccess } from "@/lib/billing/effectiveAccess"
import { financialJobAccessSkip } from "@/lib/billing/financialJobAccess"
import { loadCashPlanFacts, loadCashPlanFactsInTransaction } from "@/lib/cashplan/factLoader"
import { cashPlanSnapshotFactsHash, cashPlanSnapshotFactsMetadata, type CashPlanFactAssembly } from "@/lib/cashplan/factAssembler"
import { buildCashPlanSummaryResponse, type CashPlanOverviewSummary, type CashPlanSummaryResponse } from "@/lib/cashplan/engine"
import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import type { Prisma } from "@/lib/generated/prisma/client"

export const CashPlanQuerySchema = z.strictObject({
  planId: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/).optional(),
})

export type CashPlanCanonicalOverview = Omit<CashPlanOverviewSummary,
  "lowestClosingCashCents" | "latestClosingCashCents" | "bufferGapCents"> & {
  lowestClosingCashCents: number | null
  latestClosingCashCents: number | null
  bufferGapCents: number | null
}
export interface CashPlanCanonicalSummary extends Omit<CashPlanSummaryResponse, "overview" | "workspace"> {
  version: 2
  planId: string | null
  currency: string | null
  anchorDate: string | null
  evaluatedAt: string
  startingBalance: CashPlanFactAssembly["inputs"]["startingBalance"]
  commitmentRevision: number
  quality: CashPlanFactAssembly["quality"]
  sourceCoverage: CashPlanFactAssembly["sourceCoverage"]
  overview: CashPlanCanonicalOverview
  workspace: { title: string; summary: CashPlanCanonicalOverview; weeks: CashPlanSummaryResponse["workspace"]["weeks"] }
}

/** Presentation of the same assembled facts for every active consumer. Never
 * expose the engine's zero-based fallback as an unavailable monetary value. */
export function presentCashPlan(assembly: CashPlanFactAssembly): CashPlanCanonicalSummary {
  const { inputs, forecast, quality } = assembly
  const title = inputs.plan?.name ?? "Base plan"
  const base = forecast ? buildCashPlanSummaryResponse({ forecast: { ...forecast, status: "preliminary" }, title }) : null
  const overview: CashPlanCanonicalOverview = {
    title, status: "preliminary", confidence: base?.overview.confidence ?? 0,
    lowestClosingCashCents: forecast?.lowestClosingCashCents ?? null,
    latestClosingCashCents: forecast?.weeks.at(-1)?.closingCashCents ?? null,
    bufferGapCents: forecast?.bufferGapCents ?? null,
    freshnessLabel: forecast ? `Dated owner cash estimate (${inputs.startingBalance.balanceAsOf}); partial source coverage`
      : "Cash projection unavailable; review saved cash and plan inputs",
    recommendedActions: forecast ? ["Review missing receivables and incomplete payable coverage before relying on this preliminary forecast."]
      : ["Save a fresh, compatible owner cash balance and review plan configuration."],
  }
  return {
    version: 2, planId: inputs.plan?.id ?? null, currency: inputs.configuration?.currency ?? null,
    anchorDate: inputs.anchor?.date ?? null, evaluatedAt: inputs.evaluatedAt,
    startingBalance: inputs.startingBalance, commitmentRevision: assembly.commitmentRevision,
    quality, sourceCoverage: assembly.sourceCoverage, title, overview,
    workspace: { title, summary: overview, weeks: base?.workspace.weeks ?? [] },
    recommendations: base?.recommendations ?? [], alerts: base?.alerts ?? [],
    digest: forecast ? { summary: "Preliminary cash projection with partial source coverage.", actions: overview.recommendedActions }
      : { summary: "Cash projection unavailable.", actions: overview.recommendedActions },
  }
}

export async function loadCashPlan(userId: string, options: { planId?: string; now?: Date } = {}): Promise<CashPlanFactAssembly> {
  // Preserve subscription-only CashPlan policy. This feature check controls ONLY
  // the optional CommitGuard contribution, not admission to CashPlan itself.
  const access = await requireSubscriptionAccess(userId)
  return loadCashPlanFacts(userId, { ...options,
    commitGuardEntitled: financialJobAccessSkip(access, "commitguard_core") === null })
}

export async function loadCashPlanSummary(userId: string, options: { planId?: string; now?: Date } = {}): Promise<CashPlanCanonicalSummary> {
  return presentCashPlan(await loadCashPlan(userId, options))
}

/** Only explicit POST or the existing trusted fenced evaluator calls this.
 * Append history; never update/delete old snapshots or merge historical weeks.
 * Unavailable inputs cannot satisfy the legacy non-null monetary columns, so
 * return unavailable without persisting fabricated zero-money snapshots. */
export async function refreshCashPlanInTransaction(
  tx: PrismaTx, userId: string, access: EffectiveAccess, options: { planId?: string; now: Date },
): Promise<{ snapshotId: string | null; summary: CashPlanCanonicalSummary }> {
  if (financialJobAccessSkip(access, null)) throw new SubscriptionAccessError()
  const assembly = await loadCashPlanFactsInTransaction(tx, userId, { ...options,
    commitGuardEntitled: financialJobAccessSkip(access, "commitguard_core") === null })
  const summary = presentCashPlan(assembly)
  const { inputs, forecast } = assembly
  if (!forecast || !inputs.plan || !inputs.anchor || !inputs.configuration) return { snapshotId: null, summary }
  // Storage remains Prisma Int; do not wrap/saturate forecast amounts.
  if (![forecast.lowestClosingCashCents, forecast.bufferGapCents].every((value) => Number.isSafeInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647)) {
    throw new RangeError("CashPlan snapshot exceeds supported monetary range")
  }
  const canonicalFacts = cashPlanSnapshotFactsMetadata(inputs, assembly.facts)
  const inputQuality = { ...assembly.quality,
    reasons: assembly.quality.reasons.filter((reason) => !["legacy_snapshot_review", "snapshot_lineage_review"].includes(reason)),
    issues: assembly.quality.issues.filter((issue) => !["legacy_snapshot_review", "snapshot_lineage_review"].includes(issue.reason))
      .map((issue) => ({ reason: issue.reason, sourceId: issue.sourceId })),
  }
  const metadata = { planId: inputs.plan.id, anchorDate: inputs.anchor.date, currency: inputs.configuration.currency,
    cashInputRevision: inputs.cashContext.revision, commitmentRevision: assembly.commitmentRevision,
    canonicalFacts, coverage: assembly.coverage, inputQuality }
  const saved = await tx.cashPlanSnapshot.create({ data: {
    planId: inputs.plan.id, scenarioId: null, inputVersion: 2,
    anchorDate: new Date(`${inputs.anchor.date}T00:00:00Z`), inputCurrency: inputs.configuration.currency,
    cashInputRevision: inputs.cashContext.revision, commitmentRevision: assembly.commitmentRevision,
    canonicalFacts, coverage: assembly.coverage, inputQuality,
    inputHash: cashPlanSnapshotFactsHash(metadata), engineVersion: forecast.engineVersion,
    confidence: forecast.confidence, status: "preliminary",
    lowestClosingCashCents: forecast.lowestClosingCashCents, bufferGapCents: forecast.bufferGapCents,
    weeks: forecast.weeks as unknown as Prisma.InputJsonValue,
  }, select: { id: true } })
  return { snapshotId: saved.id, summary }
}

export async function refreshCashPlan(userId: string, options: { planId?: string; now?: Date } = {}): Promise<{ snapshotId: string | null; summary: CashPlanCanonicalSummary }> {
  const access = await requireSubscriptionAccess(userId)
  return withUserContext(userId, (tx) => refreshCashPlanInTransaction(tx, userId, access,
    { ...options, now: options.now ?? new Date() }), { isolationLevel: "RepeatableRead" })
}