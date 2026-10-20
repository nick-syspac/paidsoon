import { randomUUID } from "node:crypto"
import { z } from "zod"
import { prismaAdmin } from "@/lib/db/admin"
import { getFinancialJobAccessSkip } from "@/lib/billing/financialJobAccess"
import { lockCommitGuardTenant } from "@/lib/commitguard/tenantLock"
import { COMMIT_GUARD_SCAN_LIMIT, recoverCommitGuardWork } from "@/lib/commitguard/workLifecycle"
import type { CommitGuardJobRequest } from "@/lib/commitguard/jobClaim"
import { CommitGuardRepairStateSchema, repairCommitGuardSources, type CommitGuardRepairState } from "@/lib/commitguard/sourceRepair"

export const CommitGuardScanSchema = z.object({
  dailyCursor: z.string().max(200).nullable().optional(),
  repairState: CommitGuardRepairStateSchema.nullable().optional(),
}).strict()

export function commitGuardDailyDedupeKey(date: string): string {
  return `daily:${date}`
}

/** Internal-only D7 metadata discovery exception. Bounded independent scans:
 * daily tenant pagination, daily source repair, expired leases, then durable due
 * pending work. No scheduled_task_claims/Redis success state is involved. */
export async function scanCommitGuardWork(input: z.input<typeof CommitGuardScanSchema>): Promise<{
  jobs: CommitGuardJobRequest[]; dailyCursor: string | null; recovered: number
  repairState: CommitGuardRepairState; repaired: number; repairFailed: number
}> {
  const { dailyCursor, repairState } = CommitGuardScanSchema.parse(input)
  const tenants = await prismaAdmin.commitGuardSetting.findMany({
    where: { enabled: true, ...(dailyCursor ? { userId: { gt: dailyCursor } } : {}) },
    orderBy: { userId: "asc" }, take: COMMIT_GUARD_SCAN_LIMIT,
    select: { userId: true },
  })
  for (const { userId } of tenants) {
    if (await getFinancialJobAccessSkip(userId, "commitguard_core")) continue
    await prismaAdmin.$transaction(async (tx) => {
      await lockCommitGuardTenant(tx, userId)
      const settings = await tx.commitGuardSetting.findUnique({ where: { userId },
        select: { enabled: true, calculationRevision: true } })
      if (!settings?.enabled) return
      const [clock] = await tx.$queryRaw<Array<{ date: string }>>`
        SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date`
      // One identity per UTC day, even across revisions/retries. Failed daily
      // generations are NOT recreated; newer mutation work stays independent.
      await tx.$executeRaw`
        INSERT INTO public.commit_guard_work_items
          (id, user_id, kind, dedupe_key, source_kind, source_id, calculation_revision, updated_at)
        VALUES (${randomUUID()}, ${userId}, 'evaluate', ${commitGuardDailyDedupeKey(clock.date)},
          'daily', ${clock.date}, ${settings.calculationRevision}, (clock_timestamp() AT TIME ZONE 'UTC'))
        ON CONFLICT (user_id, kind, dedupe_key) DO NOTHING
      `
    })
  }
  const repair = await repairCommitGuardSources(repairState)
  const expired = await prismaAdmin.$queryRaw<CommitGuardJobRequest[]>`
    SELECT id AS "workItemId", user_id AS "userId", kind
    FROM public.commit_guard_work_items
    WHERE (state = 'processing' AND lease_expires_at <= (clock_timestamp() AT TIME ZONE 'UTC'))
      OR (state = 'pending' AND attempts >= 6)
    ORDER BY updated_at, id LIMIT ${COMMIT_GUARD_SCAN_LIMIT}
  `
  for (const work of expired) await recoverCommitGuardWork(work)
  const jobs = await prismaAdmin.$queryRaw<CommitGuardJobRequest[]>`
    SELECT id AS "workItemId", user_id AS "userId", kind
    FROM public.commit_guard_work_items
    WHERE state = 'pending' AND attempts < 6 AND next_attempt_at <= (clock_timestamp() AT TIME ZONE 'UTC')
    ORDER BY next_attempt_at, id LIMIT ${COMMIT_GUARD_SCAN_LIMIT}
  `
  // Explicit map is the ONLY queue DTO; never send raw rows, leases or history.
  return { jobs: jobs.map(({ userId, workItemId, kind }) => ({ userId, workItemId, kind })),
    dailyCursor: tenants.length === COMMIT_GUARD_SCAN_LIMIT ? tenants.at(-1)!.userId : null,
    recovered: expired.length, ...repair }
}