import { withUserContext } from "@/lib/db/withUserContext"
import { resolveEffectiveAccess, type EffectiveAccess } from "@/lib/billing/effectiveAccess"
import {
  readEffectiveAccessSnapshot,
  type EffectiveAccessLoadOptions,
} from "@/lib/billing/effectiveAccessSnapshot"

/** Fresh customer access. userId must come from the authenticated server identity. */
export async function getEffectiveAccess(
  userId: string,
  options: EffectiveAccessLoadOptions = {},
): Promise<EffectiveAccess> {
  const snapshot = await withUserContext(userId, (tx) =>
    readEffectiveAccessSnapshot(tx, userId),
  )
  return resolveEffectiveAccess(snapshot, options.now ?? new Date())
}