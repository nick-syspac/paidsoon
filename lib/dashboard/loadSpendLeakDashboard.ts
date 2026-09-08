import { withUserContext } from "@/lib/db/withUserContext"
import type { SpendInsight } from "@/lib/generated/prisma/client"
import {
  buildSpendLeakDashboardStatus,
  buildSpendLeakModuleSummaries,
  isSpendLeakDataStale,
  type SpendLeakDashboardStatus,
  type SpendLeakModuleSummary,
} from "@/lib/dashboard/spendleakPresentation"

export interface SpendLeakDashboardData {
  findings: SpendInsight[]
  linkedCommitmentCountsByFindingId: Record<string, number>
  modules: SpendLeakModuleSummary[]
  latestSyncAt: Date | null
  hasAccountingConnection: boolean
  isStale: boolean
  sourceSyncCount: number
  status: SpendLeakDashboardStatus
}

function latestDate(dates: Array<Date | null>): Date | null {
  const present = dates.filter((value): value is Date => value instanceof Date)
  if (present.length === 0) return null
  return present.reduce((max, value) => (value > max ? value : max), present[0])
}

export async function loadSpendLeakDashboard(userId: string): Promise<SpendLeakDashboardData> {
  return withUserContext(userId, async (tx) => {
    const [findings, connectionCount, latestBill, latestTxn, latestSupplier] = await Promise.all([
      tx.spendInsight.findMany({
        where: { userId },
        orderBy: { detectedAt: "desc" },
      }),
      tx.accountingConnection.count({
        where: { userId, status: { notIn: ["disconnected", "revoked"] } },
      }),
      tx.importedBill.findFirst({
        where: { userId },
        orderBy: { syncedAt: "desc" },
        select: { syncedAt: true },
      }),
      tx.importedBankTransaction.findFirst({
        where: { userId },
        orderBy: { syncedAt: "desc" },
        select: { syncedAt: true },
      }),
      tx.supplierProfile.findFirst({
        where: { userId },
        orderBy: { syncedAt: "desc" },
        select: { syncedAt: true },
      }),
    ])

    const findingIds = findings.map((finding) => finding.id)
    const linkedCommitments = findingIds.length
      ? await tx.commitment.findMany({
          where: {
            userId,
            linkedSpendInsightId: { in: findingIds },
            status: { in: ["active", "upcoming", "ending", "review"] },
          },
          select: { linkedSpendInsightId: true },
        })
      : []

    const linkedCommitmentCountsByFindingId = linkedCommitments.reduce<Record<string, number>>(
      (summary, commitment) => {
        if (!commitment.linkedSpendInsightId) return summary
        summary[commitment.linkedSpendInsightId] =
          (summary[commitment.linkedSpendInsightId] ?? 0) + 1
        return summary
      },
      {},
    )

    const latestSyncAt = latestDate([
      latestBill?.syncedAt ?? null,
      latestTxn?.syncedAt ?? null,
      latestSupplier?.syncedAt ?? null,
    ])
    const sourceSyncCount = [latestBill?.syncedAt, latestTxn?.syncedAt, latestSupplier?.syncedAt].filter(
      (value): value is Date => value instanceof Date,
    ).length

    return {
      findings,
      linkedCommitmentCountsByFindingId,
      modules: buildSpendLeakModuleSummaries(findings),
      latestSyncAt,
      hasAccountingConnection: connectionCount > 0,
      isStale: isSpendLeakDataStale(latestSyncAt),
      sourceSyncCount,
      status: buildSpendLeakDashboardStatus({
        findingsCount: findings.length,
        hasAccountingConnection: connectionCount > 0,
        latestSyncAt,
        sourceSyncCount,
      }),
    }
  })
}
