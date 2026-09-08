import { prismaAdmin } from "@/lib/db/admin"
import { getMarginSummary, type MarginPeriodPreset } from "@/lib/marginguard/service"

interface MarginSummaryForSnapshot {
  period: {
    preset: string
    from: string
    to: string
  }
  revenueCents: number
  directCostCents: number
  variableCostCents: number
  grossProfitCents: number
  grossMarginPercent: number | null
  contributionMarginCents: number | null
  contributionMarginPercent: number | null
  completenessPercent: number
  confidence: string
  status: string
  assumptions: {
    grossMarginReason?: string
    contributionReason?: string
    missingItems?: string[]
  }
}

export function resolveSnapshotGranularity(period: MarginPeriodPreset): "daily" | "monthly" {
  return period === "30d" ? "daily" : "monthly"
}

export function buildSnapshotRecord(
  userId: string,
  summary: MarginSummaryForSnapshot,
  calculatedAt: Date,
) {
  const granularity = resolveSnapshotGranularity(summary.period.preset as MarginPeriodPreset)
  const periodStart = new Date(summary.period.from)
  const periodEnd = new Date(summary.period.to)

  return {
    userId,
    periodGranularity: granularity,
    periodStart,
    periodEnd,
    currency: "AUD",
    revenueCents: Math.round(summary.revenueCents),
    directCostCents: Math.round(summary.directCostCents),
    variableCostCents: Math.round(summary.variableCostCents),
    grossProfitCents: Math.round(summary.grossProfitCents),
    grossMarginPercent: summary.grossMarginPercent,
    contributionMarginCents: summary.contributionMarginCents,
    contributionMarginPercent: summary.contributionMarginPercent,
    completenessPercent: summary.completenessPercent,
    confidence: summary.confidence,
    status: summary.status,
    assumptions: {
      grossMarginReason: summary.assumptions.grossMarginReason ?? null,
      contributionReason: summary.assumptions.contributionReason ?? null,
      missingItems: summary.assumptions.missingItems ?? [],
      periodPreset: summary.period.preset,
    },
    calculatedAt,
  }
}

export async function runMarginSnapshotSweep(options?: { limitUsers?: number }) {
  const startedAt = new Date()
  const enabledSettings = await prismaAdmin.marginGuardSetting.findMany({
    where: { enabled: true },
    select: {
      userId: true,
      defaultPeriod: true,
    },
    take: options?.limitUsers,
  })

  let upserted = 0
  let failed = 0

  for (const setting of enabledSettings) {
    try {
      const summary = await getMarginSummary(setting.userId, setting.defaultPeriod)
      const snapshot = buildSnapshotRecord(setting.userId, summary, startedAt)

      await prismaAdmin.marginSnapshot.upsert({
        where: {
          userId_periodGranularity_periodStart_periodEnd: {
            userId: setting.userId,
            periodGranularity: snapshot.periodGranularity,
            periodStart: snapshot.periodStart,
            periodEnd: snapshot.periodEnd,
          },
        },
        update: {
          currency: snapshot.currency,
          revenueCents: snapshot.revenueCents,
          directCostCents: snapshot.directCostCents,
          variableCostCents: snapshot.variableCostCents,
          grossProfitCents: snapshot.grossProfitCents,
          grossMarginPercent: snapshot.grossMarginPercent,
          contributionMarginCents: snapshot.contributionMarginCents,
          contributionMarginPercent: snapshot.contributionMarginPercent,
          completenessPercent: snapshot.completenessPercent,
          confidence: snapshot.confidence,
          status: snapshot.status,
          assumptions: snapshot.assumptions,
          calculatedAt: snapshot.calculatedAt,
        },
        create: snapshot,
      })

      upserted += 1
    } catch (error) {
      failed += 1
      console.error("[MarginGuard Snapshot Sweep] Failed for user", setting.userId, error)
    }
  }

  return {
    startedAt: startedAt.toISOString(),
    processedUsers: enabledSettings.length,
    upserted,
    failed,
  }
}
