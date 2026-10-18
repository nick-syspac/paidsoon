import type { PrismaTx } from "@/lib/db/withUserContext"
import { getInvoiceSourceLimitForTier } from "@/lib/billing"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { readEffectiveAccessSnapshot } from "@/lib/billing/effectiveAccessSnapshot"
import { SubscriptionAccessError } from "@/lib/billing/accessGuard"

/** Recheck after asynchronous OAuth work, inside the tenant's connection-write transaction.
 * Denied nullable tiers must never reach the catalog's Essentials display fallback.
 */
export async function requireInvoiceSourceLimit(tx: PrismaTx, userId: string): Promise<number> {
  const snapshot = await readEffectiveAccessSnapshot(tx, userId)
  const access = resolveEffectiveAccess(snapshot, new Date())
  if (!access.allowAccess || access.effectiveTier === null) throw new SubscriptionAccessError()
  return getInvoiceSourceLimitForTier(access.effectiveTier)
}