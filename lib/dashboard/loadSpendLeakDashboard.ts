import { withUserContext } from "@/lib/db/withUserContext"
import type { SpendInsight } from "@/lib/generated/prisma/client"
import { buildSpendLeakModuleSummaries, isSpendLeakDataStale, type SpendLeakModuleSummary } from "@/lib/dashboard/spendleakPresentation"

export interface SpendLeakDashboardData {
  findings: SpendInsight[]
  modules: SpendLeakModuleSummary[]
  latestSyncAt: Date | null
  hasAccountingConnection: boolean
  isStale: boolean
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

    const latestSyncAt = latestDate([
      latestBill?.syncedAt ?? null,
      latestTxn?.syncedAt ?? null,
      latestSupplier?.syncedAt ?? null,
    ])

    return {
      findings,
      modules: buildSpendLeakModuleSummaries(findings),
      latestSyncAt,
      hasAccountingConnection: connectionCount > 0,
      isStale: isSpendLeakDataStale(latestSyncAt),
    }
  })
}
