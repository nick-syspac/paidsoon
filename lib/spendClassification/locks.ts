import type { PrismaTx } from "@/lib/db/withUserContext"

export async function lockSpendClassificationTenant(tx: PrismaTx, userId: string): Promise<void> {
  // Serialize taxonomy and matching-rule writes for one tenant. This protects
  // the active-category cap and mapping-identity checks from concurrent writes.
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `spend-category:${userId}`)
}