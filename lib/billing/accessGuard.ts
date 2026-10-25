import { getEffectiveAccess } from "@/lib/billing/effectiveAccessLoader"
import type { EffectiveAccess } from "@/lib/billing/effectiveAccess"

export const BILLING_RESOLUTION_URL = "/settings/subscription"

/** Safe customer contract: never serialize a profile, grant, or provider identity. */
export const NO_SUBSCRIPTION_ACCESS = {
  error: "Subscription access required",
  code: "no_access",
  allowAccess: false,
  effectiveTier: null,
  billingResolutionUrl: BILLING_RESOLUTION_URL,
} as const

export class SubscriptionAccessError extends Error {
  readonly status = 403
  readonly code = "no_access"
  readonly result = NO_SUBSCRIPTION_ACCESS

  constructor() {
    super(NO_SUBSCRIPTION_ACCESS.error)
    this.name = "SubscriptionAccessError"
  }
}

/** Entitlement only, NOT authentication or ownership. Call with server-authenticated identity.
 * Every invocation loads fresh RLS-scoped facts; no request/job-crossing cache or tier fallback.
 */
export async function requireSubscriptionAccess(userId: string): Promise<EffectiveAccess> {
  const access = await getEffectiveAccess(userId)
  if (!access.allowAccess || access.effectiveTier === null) {
    throw new SubscriptionAccessError()
  }
  return access
}