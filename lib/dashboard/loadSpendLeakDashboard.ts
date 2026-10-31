import { withUserContext } from "@/lib/db/withUserContext"
import type { SpendInsight } from "@/lib/generated/prisma/client"
import {
  buildSpendLeakCategorySpendSummaries,
  buildSpendLeakDashboardStatus,
  buildSpendLeakModuleSummaries,
  isSpendLeakDataStale,
  type SpendLeakCategorySpendSummaries,
  type SpendLeakImportedSpendRecord,
  type SpendLeakDashboardStatus,
  type SpendLeakModuleSummary,
} from "@/lib/dashboard/spendleakPresentation"
import { filterCurrentSpendFindings } from "@/lib/spendleak/persist"
import { getSpendLeakSourceSettings, type SpendLeakSourceType } from "@/lib/spendleak/sourceSettings"

export interface SpendLeakSourceCoverage {
  sourceType: SpendLeakSourceType
  synced: boolean
  recordCount: number
  latestSyncedAt: Date | null
}

export interface SpendLeakDashboardData {
  findings: SpendInsight[]
  linkedCommitmentCountsByFindingId: Record<string, number>
  modules: SpendLeakModuleSummary[]
  categorySpendSummaries: SpendLeakCategorySpendSummaries
  latestSyncAt: Date | null
  hasAccountingConnection: boolean
  isStale: boolean
  sourceSyncCount: number
  enabledSourceTypes: SpendLeakSourceType[]
  expectedSourceCount: number
  syncedExpectedSourceCount: number
  selectedSourceCoverage: SpendLeakSourceCoverage[]
  selectedSourcesWithDataCount: number
  selectedSourcesWithoutDataCount: number
  status: SpendLeakDashboardStatus
}

function latestDate(dates: Array<Date | null>): Date | null {
  const present = dates.filter((value): value is Date => value instanceof Date)
  if (present.length === 0) return null
  return present.reduce((max, value) => (value > max ? value : max), present[0])
}

export async function loadSpendLeakDashboard(userId: string): Promise<SpendLeakDashboardData> {
  return withUserContext(userId, async (tx) => {
    const profile = await tx.userProfile.findUnique({
      where: { userId },
      select: {
        accountDisplayFromDate: true,
        accountDisplayRevision: true,
        accountDisplayTimeZone: true,
      },
    })
    const cutoffDate = profile?.accountDisplayFromDate ?? null
    const billWhere = cutoffDate ? { userId, dueDate: { gte: cutoffDate } } : { userId }
    const bankTransactionWhere = cutoffDate ? { userId, transactionDate: { gte: cutoffDate } } : { userId }
    const currentPolicy = {
      accountDisplayRevision: profile?.accountDisplayRevision ?? 0,
      accountDisplayFromDate: cutoffDate,
      accountDisplayTimeZone: profile?.accountDisplayTimeZone ?? "Australia/Melbourne",
    }

    const [
      findings,
      connectionCount,
      latestBill,
      latestTxn,
      latestSupplier,
      billRecordCount,
      bankTransactionRecordCount,
      supplierRecordCount,
      sourceSettings,
      importedBills,
      importedBankTransactions,
      classifications,
    ] = await Promise.all([
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
      tx.importedBill.count({ where: billWhere }),
      tx.importedBankTransaction.count({ where: bankTransactionWhere }),
      tx.supplierProfile.count({ where: { userId } }),
      getSpendLeakSourceSettings(userId, tx),
      tx.importedBill.findMany({
        where: billWhere,
        select: { id: true, amountCents: true, currency: true, status: true, dueDate: true },
      }),
      tx.importedBankTransaction.findMany({
        where: bankTransactionWhere,
        select: { id: true, amountCents: true, currency: true, direction: true, transactionDate: true },
      }),
      tx.spendClassification.findMany({
        where: { userId },
        select: {
          sourceType: true,
          sourceRecordId: true,
          status: true,
          category: { select: { id: true, name: true, status: true } },
          refundFor: {
            select: {
              sourceType: true,
              sourceRecordId: true,
              status: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ])

    const activeFindings = filterCurrentSpendFindings(findings as Array<{ accountDisplayRevision?: number | null; accountDisplayFromDate?: Date | null; accountDisplayTimeZone?: string | null }>, currentPolicy)
    const classificationBySource = new Map(
      classifications.map((classification) => [
        JSON.stringify([classification.sourceType, classification.sourceRecordId]),
        classification,
      ]),
    )
    const spendRecords: SpendLeakImportedSpendRecord[] = [
      ...importedBills.map((bill) => {
        const classification = classificationBySource.get(JSON.stringify(["imported_bill", bill.id]))
        return {
          sourceType: "bills" as const,
          sourceRecordId: bill.id,
          amountCents: bill.amountCents,
          currency: bill.currency,
          direction: "outflow" as const,
          sourceStatus: bill.status,
          classificationStatus: classification?.status ?? null,
          category: classification?.category ?? null,
          refundFor: classification?.refundFor ? {
            ...classification.refundFor,
            sourceType: classification.refundFor.sourceType === "imported_bill" ? "bills" as const : "bank_transactions" as const,
            classificationStatus: classification.refundFor.status,
          } : null,
        }
      }),
      ...importedBankTransactions.map((transaction) => {
        const classification = classificationBySource.get(JSON.stringify(["imported_bank_transaction", transaction.id]))
        return {
          sourceType: "bank_transactions" as const,
          sourceRecordId: transaction.id,
          amountCents: transaction.amountCents,
          currency: transaction.currency,
          direction: transaction.direction,
          sourceStatus: null,
          classificationStatus: classification?.status ?? null,
          category: classification?.category ?? null,
          refundFor: classification?.refundFor ? {
            ...classification.refundFor,
            sourceType: classification.refundFor.sourceType === "imported_bill" ? "bills" as const : "bank_transactions" as const,
            classificationStatus: classification.refundFor.status,
          } : null,
        }
      }),
    ]
    const categorySpendSummaries = buildSpendLeakCategorySpendSummaries(spendRecords)

    const findingIds = activeFindings.map((finding) => finding.id)
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

    const sourceSyncedAtByType: Record<SpendLeakSourceType, Date | null> = {
      bills: latestBill?.syncedAt ?? null,
      bank_transactions: latestTxn?.syncedAt ?? null,
      suppliers: latestSupplier?.syncedAt ?? null,
    }
    const sourceRecordCountByType: Record<SpendLeakSourceType, number> = {
      bills: billRecordCount,
      bank_transactions: bankTransactionRecordCount,
      suppliers: supplierRecordCount,
    }
    const selectedSourceCoverage: SpendLeakSourceCoverage[] = sourceSettings.enabledSourceTypes.map((sourceType) => {
      const latestSyncedAt = sourceSyncedAtByType[sourceType]
      return {
        sourceType,
        synced: latestSyncedAt instanceof Date,
        recordCount: sourceRecordCountByType[sourceType],
        latestSyncedAt,
      }
    })

    const expectedSourceDates = sourceSettings.enabledSourceTypes.map((sourceType) => sourceSyncedAtByType[sourceType])
    const latestSyncAt = latestDate(expectedSourceDates)
    const syncedExpectedSourceCount = expectedSourceDates.filter(
      (value): value is Date => value instanceof Date,
    ).length
    const sourceSyncCount = [latestBill?.syncedAt, latestTxn?.syncedAt, latestSupplier?.syncedAt].filter(
      (value): value is Date => value instanceof Date,
    ).length
    const expectedSourceCount = sourceSettings.enabledSourceTypes.length

    return {
      findings: activeFindings as SpendInsight[],
      linkedCommitmentCountsByFindingId,
      modules: buildSpendLeakModuleSummaries(activeFindings as SpendInsight[]),
      categorySpendSummaries,
      latestSyncAt,
      hasAccountingConnection: connectionCount > 0,
      isStale: isSpendLeakDataStale(latestSyncAt),
      sourceSyncCount,
      enabledSourceTypes: sourceSettings.enabledSourceTypes,
      expectedSourceCount,
      syncedExpectedSourceCount,
      selectedSourceCoverage,
      selectedSourcesWithDataCount: selectedSourceCoverage.filter((source) => source.recordCount > 0).length,
      selectedSourcesWithoutDataCount: selectedSourceCoverage.filter((source) => source.recordCount === 0).length,
      status: buildSpendLeakDashboardStatus({
        findingsCount: activeFindings.length,
        hasAccountingConnection: connectionCount > 0,
        latestSyncAt,
        sourceSyncCount,
        expectedSourceCount,
        syncedExpectedSourceCount,
      }),
    }
  })
}
