import type { PrismaTx } from "@/lib/db/withUserContext"

/** Shared D5/D7 serialization key. Acquire before work or financial row locks. */
export async function lockCommitGuardTenant(tx: PrismaTx, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`commitguard:${userId}`}))`
}