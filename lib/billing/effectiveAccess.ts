import { PLAN_CATALOG, type SubscriptionTier } from "@/lib/subscriptionPlans"

export type PublicGrantTier = Exclude<SubscriptionTier, "accountant_partner">
export type EffectiveAccessSource =
  | "paid"
  | "stripe_trial"
  | "admin_grant"
  | "onboarding_trial"
  | "past_due_grace"
  | "platform_owner"
  | "none"
export type TrialExpirySource =
  | "stripe_trial"
  | "admin_grant"
  | "onboarding_trial"
export type BillingRestriction =
  | "past_due"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "billing_risk"
  | "unknown_billing_risk"
  | "unknown_subscription_status"
  | "unknown_billing_tier"
  | "missing_subscription"
  | "missing_profile"

/** Already tenant-scoped, server-owned facts; no provider or database dependencies. */
export interface EffectiveAccessProfile {
  subscriptionStatus: string | null
  subscriptionTier: string | null
  stripeSubscriptionId: string | null
  trialEndsAt: Date | null
  billingAccessVersion: number
}

export interface TrialGrantSnapshot {
  plan: string
  startsAt: Date
  expiresAt: Date
  revokedAt: Date | null
}

export interface BillingRiskSnapshot {
  kind: string
  stripeStatus: string
  blocking: boolean
}

export interface EffectiveAccessSnapshot {
  /** Fresh server-owned role fact, not client/JWT input. Absent is false. */
  platformOwnerAccess?: boolean
  profile: EffectiveAccessProfile | null
  grant: TrialGrantSnapshot | null
  /** Empty means no known risks, not proof of eligibility for a new mutation. */
  billingRisks: readonly BillingRiskSnapshot[]
}

export interface SafeTrialGrant {
  plan: PublicGrantTier | null
  startsAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  eligible: boolean
}

export interface EffectiveAccess {
  allowAccess: boolean
  effectiveTier: SubscriptionTier | null
  source: EffectiveAccessSource
  effectiveAccessExpiresAt: Date | null
  effectiveTrialExpiresAt: Date | null
  effectiveExpirySource: TrialExpirySource | null
  /** The plan at the later expiry, not a promise to extend the preferred plan. */
  effectiveExpiryTier: SubscriptionTier | null
  stripeTrialEndsAt: Date | null
  grant: SafeTrialGrant | null
  showBillingWarning: boolean
  billingWarning: string | null
  restriction: BillingRestriction | null
  trialTimingPendingReconciliation: boolean
  version: number
}

function safeDate(value: Date | null): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? new Date(value.getTime())
    : null
}

function billingTier(value: string | null): SubscriptionTier | null {
  if (value === "starter") return "essentials"
  if (value === "solo") return "business_control"
  return value && Object.prototype.hasOwnProperty.call(PLAN_CATALOG, value)
    ? (value as SubscriptionTier)
    : null
}

function grantTier(value: string): PublicGrantTier | null {
  return Object.prototype.hasOwnProperty.call(PLAN_CATALOG, value) &&
    PLAN_CATALOG[value as SubscriptionTier].visibility === "public"
    ? (value as PublicGrantTier)
    : null
}

function riskRestriction(
  risks: readonly BillingRiskSnapshot[],
): BillingRestriction | null {
  for (const risk of risks) {
    const invoice = risk.kind === "subscription_invoice"
    const dispute = risk.kind === "subscription_dispute"
    const knownStatus = invoice
      ? ["draft", "open", "paid", "void", "uncollectible"].includes(risk.stripeStatus)
      : dispute && [
          "warning_needs_response", "warning_under_review", "needs_response",
          "under_review", "lost", "won", "warning_closed", "prevented",
        ].includes(risk.stripeStatus)
    if (!knownStatus || typeof risk.blocking !== "boolean") {
      return "unknown_billing_risk"
    }
  }
  return risks.some((risk) =>
    risk.blocking ||
    (risk.kind === "subscription_invoice" && risk.stripeStatus === "uncollectible") ||
    (risk.kind === "subscription_dispute" && [
      "warning_needs_response", "warning_under_review", "needs_response",
      "under_review", "lost",
    ].includes(risk.stripeStatus)),
  ) ? "billing_risk" : null
}

/**
 * Resolve fresh access at an explicit instant. Stripe status, not a local trial
 * timer or billing-period date, controls subscription access. This is not the
 * stricter read-only Stripe preflight required before granting/extending access.
 */
export function resolveEffectiveAccess(
  snapshot: EffectiveAccessSnapshot,
  now: Date,
): EffectiveAccess {
  const instant = safeDate(now)
  if (!instant) throw new RangeError("Effective access requires a valid explicit now")
  const nowMs = instant.getTime()
  const { profile, grant } = snapshot
  const safeGrant: SafeTrialGrant | null = grant ? {
    plan: grantTier(grant.plan),
    startsAt: safeDate(grant.startsAt),
    expiresAt: safeDate(grant.expiresAt),
    revokedAt: safeDate(grant.revokedAt),
    eligible: false,
  } : null
  const linked = Boolean(profile?.stripeSubscriptionId?.trim())
  const stripeTrialEndsAt = linked ? safeDate(profile?.trialEndsAt ?? null) : null
  const result: EffectiveAccess = {
    allowAccess: false,
    effectiveTier: null,
    source: "none",
    effectiveAccessExpiresAt: null,
    effectiveTrialExpiresAt: null,
    effectiveExpirySource: null,
    effectiveExpiryTier: null,
    stripeTrialEndsAt,
    grant: safeGrant,
    showBillingWarning: false,
    billingWarning: null,
    restriction: null,
    trialTimingPendingReconciliation: false,
    version: profile?.billingAccessVersion ?? 0,
  }
  if (!profile) return { ...result, restriction: "missing_profile" }

  const status = profile.subscriptionStatus
  const tier = billingTier(profile.subscriptionTier)
  const knownStatus = [
    "active", "trialing", "past_due", "unpaid", "incomplete",
    "incomplete_expired", "canceled", "cancelled", "paused",
  ].includes(status ?? "")
  const risk = riskRestriction(snapshot.billingRisks)
  const delinquent = status === "past_due" || status === "unpaid" ||
    status === "incomplete" || status === "incomplete_expired"
  result.restriction = !knownStatus ? "unknown_subscription_status"
    : delinquent ? status : risk
  if (result.restriction) {
    result.showBillingWarning = true
    result.billingWarning = status === "past_due"
      ? "Your latest payment did not go through. Please update your billing details to avoid interruption."
      : "Please resolve your billing state through billing settings or support."
  }
  if (!knownStatus) return result

  // Real subscriptions alone establish paid or grace access. Neither has a
  // trial-derived cutoff, and retained grants never alter the billing plan.
  if (linked && (status === "active" || status === "past_due")) {
    if (!tier) return { ...result, restriction: "unknown_billing_tier" }
    return {
      ...result, allowAccess: true, effectiveTier: tier,
      source: status === "active" ? "paid" : "past_due_grace",
    }
  }
  if (delinquent) return result

  const validGrant = !(linked && status === "trialing" && !tier) &&
    !risk && safeGrant?.plan && safeGrant.startsAt &&
    safeGrant.expiresAt && grant?.revokedAt === null &&
    safeGrant.startsAt.getTime() <= nowMs && nowMs < safeGrant.expiresAt.getTime()
  if (validGrant && safeGrant) safeGrant.eligible = true

  const trialSources: {
    source: TrialExpirySource
    tier: SubscriptionTier
    expiresAt: Date
  }[] = []
  if (linked && status === "trialing") {
    if (!tier) return { ...result, restriction: "unknown_billing_tier" }
    result.allowAccess = true
    result.effectiveTier = tier
    result.source = "stripe_trial"
    if (stripeTrialEndsAt && stripeTrialEndsAt.getTime() > nowMs) {
      trialSources.push({ source: "stripe_trial", tier, expiresAt: stripeTrialEndsAt })
    } else {
      // Date is display/extension data only. An absent/stale date cannot end
      // Stripe-authoritative trialing access; now is the minimum extension base.
      result.trialTimingPendingReconciliation = true
      trialSources.push({ source: "stripe_trial", tier, expiresAt: instant })
    }
  }
  if (validGrant && safeGrant?.plan && safeGrant.expiresAt) {
    trialSources.push({ source: "admin_grant", tier: safeGrant.plan, expiresAt: safeGrant.expiresAt })
    if (!result.allowAccess) {
      result.allowAccess = true
      result.effectiveTier = safeGrant.plan
      result.source = "admin_grant"
    }
  }
  const onboardingEnd = !linked && status === "trialing" ? safeDate(profile.trialEndsAt) : null
  if (tier && onboardingEnd && onboardingEnd.getTime() > nowMs) {
    trialSources.push({ source: "onboarding_trial", tier, expiresAt: onboardingEnd })
    if (!result.allowAccess) {
      result.allowAccess = true
      result.effectiveTier = tier
      result.source = "onboarding_trial"
    }
  }
  // Stable ties retain preferred-source provenance; expiry and plan precedence
  // are otherwise independent (including a longer onboarding source).
  const latest = trialSources.reduce<(typeof trialSources)[number] | null>(
    (current, candidate) => !current || candidate.expiresAt > current.expiresAt ? candidate : current,
    null,
  )
  if (latest) {
    result.effectiveTrialExpiresAt = new Date(latest.expiresAt)
    result.effectiveAccessExpiresAt = new Date(latest.expiresAt)
    result.effectiveExpirySource = latest.source
    result.effectiveExpiryTier = latest.tier
  }
  // Narrow internal-account fallback, never a subscription/trial or staff bypass.
  if (!result.allowAccess && !linked && status === "active" && tier && !risk &&
      snapshot.platformOwnerAccess === true) {
    result.allowAccess = true
    result.effectiveTier = tier
    result.source = "platform_owner"
  }
  if (!result.allowAccess && !result.restriction) {
    if (!tier && status === "trialing") result.restriction = "unknown_billing_tier"
    else if (!linked && status === "active") result.restriction = "missing_subscription"
  }
  return result
}