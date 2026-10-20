import { z } from "zod"
import { prismaAdmin } from "@/lib/db/admin"
import { withUserContext } from "@/lib/db/withUserContext"
import { lockCommitGuardTenant } from "@/lib/commitguard/tenantLock"
import { requestCommitGuardDetection, type CommitGuardDetectionSource } from "@/lib/commitguard/detectionRequest"
import { COMMIT_GUARD_SCAN_LIMIT } from "@/lib/commitguard/workLifecycle"

export const CommitGuardRepairStateSchema = z.object({
  date: z.iso.date(),
  accountingCursor: z.string().min(1).max(200).nullable(),
  accountingDone: z.boolean(),
  importCursor: z.string().min(1).max(200).nullable(),
  importDone: z.boolean(),
}).strict()
export type CommitGuardRepairState = z.infer<typeof CommitGuardRepairStateSchema>
type SourceIdentity = { id: string; userId: string }

/** Internal scheduler-only system exception: cross-tenant discovery reads ONLY
 * source completion metadata and canonical work identity, never spend evidence.
 * Inserts revalidate source ownership/5.4 eligibility under tenant RLS using the
 * original minimal-default helper. No access snapshot, detector, lifecycle reset,
 * new generation or Redis is involved; execution still rechecks current access.
 * Each stream has its own keyset/budget, including past failed repairs. Cursor
 * hints are not authority; restarts safely replay, and the next UTC day restarts
 * the pass so late completions/previous failures behind a cursor are revisited.
 */
export async function repairCommitGuardSources(previous?: CommitGuardRepairState | null): Promise<{
  repairState: CommitGuardRepairState; repaired: number; repairFailed: number
}> {
  const [clock] = await prismaAdmin.$queryRaw<Array<{ date: string }>>`
    SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date`
  const repairState: CommitGuardRepairState = previous?.date === clock.date ? { ...previous } : {
    date: clock.date, accountingCursor: null, accountingDone: false, importCursor: null, importDone: false,
  }
  // Match the ACTUAL completion helper, not status alone. NOT EXISTS checks the
  // independently derived tenant/kind/dedupe key, regardless of state/generation
  // or forged source columns. In particular failed/exhausted work is not a gap.
  const accounting = repairState.accountingDone ? [] : await prismaAdmin.$queryRaw<SourceIdentity[]>`
    SELECT s.id, s."userId" AS "userId" FROM public.accounting_sync_runs s
    WHERE s.status = 'success' AND s.completed_at IS NOT NULL AND s.invoices_skipped = 0
      AND s.id > ${repairState.accountingCursor ?? ""}
      AND NOT EXISTS (SELECT 1 FROM public.commit_guard_work_items w
        WHERE w.user_id = s."userId" AND w.kind = 'detect'
          AND w.dedupe_key = 'detection:accounting_sync_run:' || s.id)
    ORDER BY s.id LIMIT ${COMMIT_GUARD_SCAN_LIMIT}`
  const imports = repairState.importDone ? [] : await prismaAdmin.$queryRaw<SourceIdentity[]>`
    SELECT s.id, s.user_id AS "userId" FROM public.spend_import_batches s
    WHERE s.status = 'completed' AND s.completed_at IS NOT NULL AND s.rows_failed = 0 AND s.rows_skipped = 0
      AND s.id > ${repairState.importCursor ?? ""}
      AND NOT EXISTS (SELECT 1 FROM public.commit_guard_work_items w
        WHERE w.user_id = s.user_id AND w.kind = 'detect'
          AND w.dedupe_key = 'detection:spend_import_batch:' || s.id)
    ORDER BY s.id LIMIT ${COMMIT_GUARD_SCAN_LIMIT}`
  let repaired = 0
  let repairFailed = 0
  const repair = async (sources: SourceIdentity[], sourceKind: CommitGuardDetectionSource["sourceKind"]): Promise<void> => {
    for (const { id, userId } of sources) {
      try {
        const inserted = await withUserContext(userId, async (tx) => {
          await lockCommitGuardTenant(tx, userId)
          return requestCommitGuardDetection(tx, userId, { sourceKind, sourceId: id })
        })
        if (inserted) repaired++
      } catch {
        // Advance past an unrepairable source; revisit next day, not every five
        // minutes. No payloads, IDs or raw DB errors in diagnostics.
        repairFailed++
        console.error("[commitguard] source_repair_failed")
      }
    }
  }
  await repair(accounting, "accounting_sync_run")
  await repair(imports, "spend_import_batch")
  if (!repairState.accountingDone) {
    repairState.accountingCursor = accounting.at(-1)?.id ?? repairState.accountingCursor
    repairState.accountingDone = accounting.length < COMMIT_GUARD_SCAN_LIMIT
  }
  if (!repairState.importDone) {
    repairState.importCursor = imports.at(-1)?.id ?? repairState.importCursor
    repairState.importDone = imports.length < COMMIT_GUARD_SCAN_LIMIT
  }
  return { repairState, repaired, repairFailed }
}