import { loadCashPlanInputsInTransaction } from "@/lib/cashplan/inputLoader"
import { assembleCashPlanFacts, type CashPlanFactAssembly } from "@/lib/cashplan/factAssembler"
import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"

interface CashPlanFactLoadOptions { planId?: string; now?: Date; commitGuardEntitled: boolean }

/** Internal read-only boundary. Caller authenticates and checks CashPlan access;
 * CommitGuard entitlement is resolved by that caller, never from queued/client
 * financial inputs. No Tax Buffer dependency or reserve-as-movement adapter. */
export async function loadCashPlanFacts(userId: string, options: CashPlanFactLoadOptions): Promise<CashPlanFactAssembly> {
  return withUserContext(userId, (tx) => loadCashPlanFactsInTransaction(tx, userId, options),
    { isolationLevel: "RepeatableRead" })
}

export async function loadCashPlanFactsInTransaction(
  tx: PrismaTx, userId: string, options: CashPlanFactLoadOptions,
): Promise<CashPlanFactAssembly> {
  const now = options.now ?? new Date()
  const inputs = await loadCashPlanInputsInTransaction(tx, userId, { ...options, now })
  if (!inputs.plan) return assembleCashPlanFacts({ userId, inputs, enabled: false, commitmentRevision: 0,
    commitments: [], coverages: [], bills: [] })
  const setting = await tx.commitGuardSetting.findUnique({ where: { userId },
    select: { enabled: true, calculationRevision: true } })
  const enabled = options.commitGuardEntitled && setting?.enabled === true
  const [commitments, coverages, snapshot, overrides] = await Promise.all([
    enabled ? tx.commitment.findMany({ where: { userId, archivedAt: null }, orderBy: { id: "asc" },
      select: { id: true, userId: true, name: true, category: true, amountCents: true, currency: true,
        frequency: true, confidence: true, status: true, archivedAt: true, nextDueDate: true,
        startDate: true, endDate: true, updatedAt: true } }) : [],
    enabled ? tx.commitmentCoverage.findMany({ where: { userId }, orderBy: [{ occurrenceDate: "asc" }, { id: "asc" }],
      select: { id: true, userId: true, commitmentId: true, occurrenceDate: true, currency: true,
        coveredCents: true, targetKind: true, importedBillId: true, taxReserveCategoryId: true } }) : [],
    tx.cashPlanSnapshot.findFirst({ where: { planId: inputs.plan.id, plan: { userId }, scenarioId: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: {
        id: true, planId: true, scenarioId: true, inputVersion: true, anchorDate: true, inputCurrency: true,
        cashInputRevision: true, commitmentRevision: true, canonicalFacts: true, coverage: true,
        inputQuality: true, inputHash: true,
      } }),
    tx.cashPlanOverride.findMany({ where: { planId: inputs.plan.id, plan: { userId } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }], select: {
        id: true, planId: true, entityType: true, entityId: true, amountCents: true, plannedDate: true,
        effectiveFrom: true, expiresAt: true, sourceType: true, sourceId: true, updatedAt: true,
      } }),
  ])
  const billIds = [...new Set(coverages.filter((row) => row.targetKind === "imported_bill" && row.taxReserveCategoryId === null)
    .flatMap((row) => row.importedBillId ? [row.importedBillId] : []))]
  const bills = billIds.length ? await tx.importedBill.findMany({ where: { userId, id: { in: billIds } },
    orderBy: { id: "asc" }, select: { id: true, userId: true, accountingConnectionId: true, sourceId: true,
      currency: true, amountCents: true, dueDate: true, paidDate: true, status: true, rawSourceData: true,
      sourceUpdatedAt: true, syncedAt: true, accountingConnection: { select: { userId: true, provider: true } } } }) : []
  return assembleCashPlanFacts({ userId, inputs, enabled, commitmentRevision: setting?.calculationRevision ?? 0,
    commitments, coverages, bills, snapshot, overrides })
}