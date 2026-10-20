import { randomUUID } from "node:crypto"
import { requireFeature } from "@/lib/billing"
import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import { CoverageInputSchema, CoverageIdSchema, explicitBillUnpaidCents, inspectCoverage,
  reconcileCommitGuardCoverage, type CoverageInput, type CoverageRecord, type CoverageSources,
  type CoverageReconciliation, type CoverageReview } from "@/lib/commitguard/coverage"
import { loadCommitGuardProtectionFactsInTransaction } from "@/lib/commitguard/protectionFactsLoader"
import { requestCommitGuardEvaluation } from "@/lib/commitguard/evaluationRequest"
import { lockCommitGuardTenant } from "@/lib/commitguard/tenantLock"
import type { CommitGuardProtectionFacts } from "@/lib/commitguard/protectionFacts"

export class CommitGuardCoverageError extends Error {
  constructor(public readonly status: 400 | 404 | 409, public readonly reason: string) {
    super(reason)
  }
}
const SELECT = { id: true, userId: true, commitmentId: true, occurrenceDate: true,
  currency: true, coveredCents: true, targetKind: true, importedBillId: true, taxReserveCategoryId: true } as const
export type CoverageDto = {
  id: string; commitmentId: string; occurrenceDate: string; currency: string; coveredCents: number
  target: { kind: string; id: string }; reviewReasons: CoverageReview["reason"][]
}
function dto(row: CoverageRecord, reviews: CoverageReview[] = []): CoverageDto {
  return { id: row.id, commitmentId: row.commitmentId, occurrenceDate: row.occurrenceDate.toISOString().slice(0, 10),
    currency: row.currency, coveredCents: row.coveredCents,
    target: { kind: row.targetKind, id: row.importedBillId ?? row.taxReserveCategoryId! },
    reviewReasons: reviews.filter((review) => review.coverageId === row.id).map((review) => review.reason) }
}

async function loadSources(tx: PrismaTx, userId: string, rows: CoverageRecord[], taxEntitled: boolean, now: Date,
  shared?: { commitments: CoverageSources["commitments"]; facts: CommitGuardProtectionFacts },
): Promise<CoverageSources & { taxIncomplete: boolean }> {
  const billIds = [...new Set(rows.flatMap((row) => row.importedBillId ? [row.importedBillId] : []))]
  const [commitments, bills, categories, facts, attributions] = await Promise.all([
    shared?.commitments ?? tx.commitment.findMany({ where: { userId }, select: { id: true, userId: true, name: true, category: true,
      amountCents: true, currency: true, frequency: true, confidence: true, status: true, archivedAt: true,
      nextDueDate: true, startDate: true, endDate: true } }),
    tx.importedBill.findMany({ where: { userId, id: { in: billIds } }, select: { id: true, userId: true, currency: true,
      amountCents: true, status: true, paidDate: true, rawSourceData: true, accountingConnection: { select: { provider: true, userId: true } } } }),
    tx.taxReserveCategory.findMany({ where: { userId }, select: { id: true, userId: true, enabled: true } }),
    shared?.facts ?? loadCommitGuardProtectionFactsInTransaction(tx, userId, taxEntitled, now),
    tx.taxBufferObligation.findMany({ where: { userId, importedBillId: { in: billIds } },
      select: { importedBillId: true, reserveCategoryId: true, status: true } }),
  ])
  return { userId, commitments, taxApplicable: facts.applicable, taxIncomplete: facts.quality.state === "incomplete",
    taxCategories: categories.map((category) => {
      const fact = facts.categories.find((item) => item.categoryId === category.id)
      return { ...category, currency: fact?.currency ?? null, requiredReserveCents: fact?.requiredReserveCents ?? null }
    }),
    bills: bills.map((bill) => {
      // Existing explicit bill/category relationships only. Conflicting or settled
      // attribution is not guessed from supplier, category name or tax amount.
      const links = attributions.filter((item) => item.importedBillId === bill.id)
      const identities = new Set(links.map((item) => item.reserveCategoryId))
      return { id: bill.id, userId: bill.userId, currency: bill.currency,
        unpaidCents: bill.accountingConnection.userId === userId
          ? explicitBillUnpaidCents({ ...bill, provider: bill.accountingConnection.provider }) : null,
        taxCategoryId: identities.size === 1 && links.every((item) => item.status !== "settled") ? [...identities][0] : null }
    }),
  }
}

async function readRows(tx: PrismaTx, userId: string): Promise<CoverageRecord[]> {
  return tx.commitmentCoverage.findMany({ where: { userId }, select: SELECT, orderBy: [{ occurrenceDate: "asc" }, { id: "asc" }] })
}

/** Shared read-only ledger input; never opens a second transaction or reloads
 * the summary's commitment/tax facts. No locks, defaults, or durable writes. */
export async function loadCommitGuardCoverageInputsInTransaction(
  tx: PrismaTx, userId: string, now: Date,
  shared: { commitments: CoverageSources["commitments"]; facts: CommitGuardProtectionFacts },
): Promise<{ sources: CoverageSources; rows: CoverageRecord[] }> {
  const rows = await readRows(tx, userId)
  const sources = await loadSources(tx, userId, rows, shared.facts.applicable, now, shared)
  return { sources, rows }
}

/** Read-only safe CRUD view, including disabled/stale links for explicit removal. */
export async function listCommitGuardCoverage(userId: string, now: Date = new Date()): Promise<CoverageDto[]> {
  const entitled = await requireFeature(userId, "tax_buffer_basic", { now })
  return withUserContext(userId, async (tx) => {
    const rows = await readRows(tx, userId)
    const checked = inspectCoverage(await loadSources(tx, userId, rows, entitled, now), rows)
    return rows.map((row) => dto(row, checked.reviews))
  })
}

/** D4 integration point only, NOT task 3.7's versioned free-cash summary. Reads
 * one tenant transaction, no defaults, snapshots, events or durable evaluation.
 */
export async function loadCommitGuardCoverageReconciliation(userId: string, windowStart: Date, windowEnd: Date,
  now: Date = new Date()): Promise<CoverageReconciliation> {
  if (![windowStart, windowEnd].every((date) => Number.isFinite(date.getTime()) && date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) || windowEnd < windowStart) {
    throw new CommitGuardCoverageError(400, "Invalid UTC coverage window")
  }
  const entitled = await requireFeature(userId, "tax_buffer_basic", { now })
  return withUserContext(userId, async (tx) => {
    const rows = await readRows(tx, userId)
    const sources = await loadSources(tx, userId, rows, entitled, now)
    const result = reconcileCommitGuardCoverage({ ...sources, coverages: rows, windowStart, windowEnd })
    // Configuration-level issues must not disappear just because there is no
    // usable category fact. The D2 facts distinguish incomplete from zero.
    if (sources.taxIncomplete) {
      result.quality.state = "incomplete"
      result.quality.reviews.push({ coverageId: null, commitmentId: null, reason: "tax_protection_incomplete" })
    }
    return result
  })
}

type Mutation = { kind: "create"; input: CoverageInput } | { kind: "update"; id: string; input: CoverageInput } | { kind: "delete"; id: string }

/** Called only with an authenticated identity. Shares the cash/settings/D5/D7
 * tenant lock; validation, cross-row caps, mutation, revision, work and audit
 * share the SAME transaction. Financial row locks also fence provider updates.
 */
export async function mutateCommitGuardCoverage(userId: string, operation: Mutation, now: Date = new Date()): Promise<CoverageDto | null> {
  const input = operation.kind === "delete" ? null : CoverageInputSchema.parse(operation.input)
  if (operation.kind !== "create") CoverageIdSchema.parse(operation.id)
  const entitled = await requireFeature(userId, "tax_buffer_basic", { now })
  return withUserContext(userId, async (tx) => {
    await lockCommitGuardTenant(tx, userId)
    // Fixed ordering. Keep occurrence amounts and unpaid balances stable through
    // caps even when ingestion does not use the advisory lock. Categories have
    // SELECT/INSERT only, so do not widen their grants just to take a row lock;
    // every read revalidates current enablement/currency, including stale links.
    await tx.$queryRaw`SELECT id FROM public.commitments WHERE user_id = ${userId} ORDER BY id FOR SHARE`
    await tx.$queryRaw`SELECT id FROM public.imported_bills WHERE user_id = ${userId} ORDER BY id FOR SHARE`
    const rows = await readRows(tx, userId)
    const existing = operation.kind === "create" ? null : rows.find((row) => row.id === operation.id)
    if (operation.kind !== "create" && !existing) throw new CommitGuardCoverageError(404, "Not found")
    let next: CoverageRecord | null = null
    if (input) {
      next = { id: existing?.id ?? randomUUID(), userId, commitmentId: input.commitmentId,
        occurrenceDate: new Date(input.occurrenceDate), currency: input.currency, coveredCents: input.coveredCents,
        targetKind: input.target.kind, importedBillId: input.target.kind === "imported_bill" ? input.target.id : null,
        taxReserveCategoryId: input.target.kind === "tax_reserve_category" ? input.target.id : null }
      const proposed = [...rows.filter((row) => row.id !== next!.id), next]
      const sources = await loadSources(tx, userId, proposed, entitled, now)
      // Missing and foreign target/commitment identities are indistinguishable.
      if (!sources.commitments.some((row) => row.id === next!.commitmentId) ||
        (next.importedBillId ? !sources.bills.some((row) => row.id === next!.importedBillId) :
          !sources.taxCategories.some((row) => row.id === next!.taxReserveCategoryId))) throw new CommitGuardCoverageError(404, "Not found")
      const checked = inspectCoverage(sources, proposed)
      const review = checked.reviews.find((item) => item.coverageId === next!.id)
      if (review) throw new CommitGuardCoverageError(409, review.reason)
      if (existing && JSON.stringify(dto(existing)) === JSON.stringify(dto(next))) return dto(existing)
    }
    if (operation.kind === "delete") {
      await tx.commitmentCoverage.delete({ where: { id: existing!.id, userId } })
    } else if (existing && next) {
      await tx.commitmentCoverage.update({ where: { id: existing.id, userId }, data: {
        commitmentId: next.commitmentId, occurrenceDate: next.occurrenceDate, currency: next.currency,
        coveredCents: next.coveredCents, targetKind: next.targetKind,
        importedBillId: next.importedBillId, taxReserveCategoryId: next.taxReserveCategoryId,
      }, select: { id: true } })
    } else if (next) {
      // Restricted INSERT excludes created_at, which Prisma create supplies.
      await tx.$queryRaw`INSERT INTO public.commitment_coverages
        (id, user_id, commitment_id, occurrence_date, currency, covered_cents, target_kind,
         imported_bill_id, tax_reserve_category_id, updated_at)
        VALUES (${next.id}, ${userId}, ${next.commitmentId}, ${next.occurrenceDate}::date,
          ${next.currency}, ${next.coveredCents}, ${next.targetKind}, ${next.importedBillId}, ${next.taxReserveCategoryId}, ${now})
        RETURNING id`
    }
    await requestCommitGuardEvaluation(tx, userId)
    await tx.commitmentEvent.create({ data: { userId, actorId: userId,
      commitmentId: next?.commitmentId ?? existing!.commitmentId, eventType: "COMMITMENT_COVERAGE_UPDATED",
      title: "Commitment coverage updated", message: "Reviewed coverage changed",
      metadata: { action: operation.kind, before: existing ? dto(existing) : null, after: next ? dto(next) : null },
    }, select: { id: true } })
    return next ? dto(next) : null
  })
}