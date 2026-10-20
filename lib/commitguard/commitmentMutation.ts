import { isDeepStrictEqual } from "node:util"
import type { PrismaTx } from "@/lib/db/withUserContext"
import type { Commitment, Prisma } from "@/lib/generated/prisma/client"
import { requireCommitGuardCoreAccess } from "@/lib/commitguard/entitlements"
import { lockCommitGuardTenant } from "@/lib/commitguard/tenantLock"

export class CommitmentMutationConflict extends Error {
  constructor(public readonly reason: "invalid_commitment_transition" | "commitment_archived") {
    super("Commitment cannot be changed in its current state")
    this.name = "CommitmentMutationConflict"
  }
}

/** Shared lock order for PATCH and actions. Re-read only AFTER both locks;
 * predicates and RLS deliberately make foreign and absent IDs indistinguishable. */
export async function lockCommitmentForMutation(tx: PrismaTx, userId: string, id: string): Promise<Commitment | null> {
  await lockCommitGuardTenant(tx, userId)
  await requireCommitGuardCoreAccess(userId)
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM commitments WHERE user_id = ${userId} AND id = ${id} FOR UPDATE`
  if (locked.length === 0) return null
  const row = await tx.commitment.findFirst({ where: { id, userId } })
  if (row?.archivedAt) throw new CommitmentMutationConflict("commitment_archived")
  return row
}

export function planCommitmentTransition(
  row: { status: string; confidence: string },
  action: "pause" | "resume" | "cancel" | "confirm",
  now: Date,
): Prisma.CommitmentUpdateInput | null {
  const eligible = ["active", "upcoming", "ending", "review"].includes(row.status)
  if (action === "pause") {
    if (row.status === "paused") return null
    if (eligible) return { status: "paused", pausedAt: now }
  } else if (action === "resume") {
    if (row.status === "paused") return { status: "active", pausedAt: null }
  } else if (action === "cancel") {
    if (row.status === "cancelled") return null
    if (eligible || row.status === "paused") return { status: "cancelled", cancelledAt: now }
  } else if (action === "confirm" && eligible) {
    return row.confidence === "confirmed" ? null : { confidence: "confirmed" }
  }
  throw new CommitmentMutationConflict("invalid_commitment_transition")
}

type AuditValue = Prisma.InputJsonValue | null
export function commitmentChangedFields(
  before: object, after: object, fields: readonly string[],
): Record<string, { before: AuditValue; after: AuditValue }> {
  const previous = before as Record<string, unknown>, current = after as Record<string, unknown>
  return Object.fromEntries(fields.filter((field) => !isDeepStrictEqual(previous[field], current[field]))
    .map((field) => [field, {
      before: JSON.parse(JSON.stringify(previous[field] ?? null)) as AuditValue,
      after: JSON.parse(JSON.stringify(current[field] ?? null)) as AuditValue,
    }]))
}