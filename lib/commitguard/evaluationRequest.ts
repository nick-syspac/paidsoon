import { randomUUID } from "node:crypto"
import type { PrismaTx } from "@/lib/db/withUserContext"

/** Caller holds the tenant lock. This is durable pending work, not worker dispatch. */
export async function requestCommitGuardEvaluation(
  tx: PrismaTx,
  userId: string,
): Promise<number> {
  const { calculationRevision } = await tx.commitGuardSetting.upsert({
    where: { userId },
    create: { userId, calculationRevision: 1 },
    update: { calculationRevision: { increment: 1 } },
    select: { calculationRevision: true },
  })

  // Prisma create() materializes @default fields in INSERT, including state,
  // attempts/fence and dates that authenticated deliberately cannot insert.
  // Keep DB defaults authoritative and RETURNING within the SELECT grant.
  // No ON CONFLICT suppression: an unexpected collision must roll back the mutation.
  await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO public.commit_guard_work_items
      (id, user_id, kind, dedupe_key, source_kind, calculation_revision, updated_at)
    VALUES (${randomUUID()}, ${userId}, 'evaluate',
      ${`evaluation:${calculationRevision}`}, 'mutation', ${calculationRevision}, CURRENT_TIMESTAMP)
    RETURNING id
  `
  return calculationRevision
}