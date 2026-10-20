import { randomUUID } from "node:crypto"
import type { PrismaTx } from "@/lib/db/withUserContext"

export type CommitGuardDetectionSource = {
  sourceKind: "accounting_sync_run" | "spend_import_batch"
  sourceId: string
}

/** Shared by completion/replay and daily source repair; never reset a generation. */
export function commitGuardDetectionDedupeKey(source: CommitGuardDetectionSource): string {
  return `detection:${source.sourceKind}:${source.sourceId}`
}

/**
 * Use the caller's source-completion transaction (tenant RLS for spreadsheet imports,
 * existing system sync transaction for accounting). Independently validate ownership
 * and successful completion, including when invoked later to recover a committed source.
 * No settings defaults, permission snapshot, detector execution or Redis dependency.
 */
export async function requestCommitGuardDetection(
  tx: PrismaTx,
  userId: string,
  source: CommitGuardDetectionSource,
): Promise<boolean> {
  const completed = source.sourceKind === "accounting_sync_run"
    ? await tx.accountingSyncRun.findFirst({
        where: { id: source.sourceId, userId, status: "success", completedAt: { not: null }, invoicesSkipped: 0 },
        select: { id: true },
      })
    : await tx.spendImportBatch.findFirst({
        where: { id: source.sourceId, userId, status: "completed", completedAt: { not: null }, rowsFailed: 0, rowsSkipped: 0 },
        select: { id: true },
      })
  if (!completed) return false

  // Prisma create() inserts ungranted default columns. Keep the pending state,
  // scheduling, counters, fence and generation database-owned. Revision 0 is an
  // ingestion identity, NOT an evaluation/settings snapshot: execution must use
  // current settings and effective access. Targetless DO NOTHING preserves even
  // exhausted work without requiring SELECT on private user_id/dedupe_key columns.
  // The other unique key is the freshly generated UUID primary key.
  const inserted = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO public.commit_guard_work_items
      (id, user_id, kind, dedupe_key, source_kind, source_id, calculation_revision, updated_at)
    VALUES (${randomUUID()}, ${userId}, 'detect', ${commitGuardDetectionDedupeKey(source)},
      ${source.sourceKind}, ${source.sourceId}, 0, CURRENT_TIMESTAMP)
    ON CONFLICT DO NOTHING
    RETURNING id
  `
  return inserted.length > 0
}

/** A SQL error must not poison/roll back a successful source transaction. */
export async function handoffCompletedSpendDetection(
  tx: PrismaTx,
  userId: string,
  source: CommitGuardDetectionSource,
): Promise<void> {
  await tx.$executeRaw`SAVEPOINT commitguard_detection_handoff`
  try {
    await requestCommitGuardDetection(tx, userId, source)
  } catch {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT commitguard_detection_handoff`
    // No source payload or financial/tenant identifiers in diagnostics. The
    // completed source is the durable recovery record if no work was committed.
    console.error("[commitguard] detection handoff deferred to source repair")
  }
  await tx.$executeRaw`RELEASE SAVEPOINT commitguard_detection_handoff`
}