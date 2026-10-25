import type { EffectiveAccess } from "@/lib/billing/effectiveAccess"
import { PLAN_CATALOG } from "@/lib/subscriptionPlans"

export function formatSubscriptionDate(date: Date | string | number | null | undefined): string {
  if (!date) return ""
  return new Date(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export interface SubscriptionBillingStateInput {
  status: string
  currentPeriodEnd: Date | null
  subscriptionCancelAt: Date | null
  canCancelSubscription: boolean
}

export interface SubscriptionBillingState {
  headline: string | null
  description: string | null
  showCancelAction: boolean
  isTrialOnly: boolean
}

export interface DashboardSubscriptionAccessState {
  allowAccess: boolean
  showBillingWarning: boolean
  billingWarning: string | null
  redirectReason: "incomplete" | "unpaid" | "canceled" | "trial_expired" | "access_denied" | null
}

export interface SubscriptionCancellationPageState {
  title: string
  description: string
  confirmLabel: string | null
  confirmDisabled: boolean
}

export function getDashboardSubscriptionAccessState(
  access: EffectiveAccess | null,
  status?: string | null,
): DashboardSubscriptionAccessState {
  const allowAccess = Boolean(access?.allowAccess && access.effectiveTier)
  return {
    allowAccess,
    showBillingWarning: access?.showBillingWarning ?? false,
    billingWarning: access?.billingWarning ?? null,
    redirectReason: allowAccess ? null
      : status === "incomplete" || status === "incomplete_expired" ? "incomplete"
      : status === "unpaid" ? "unpaid"
      : status === "canceled" || status === "cancelled" ? "canceled"
      : status === "trialing" ? "trial_expired" : "access_denied",
  }
}

/** Exact billing destinations only, not a general settings entitlement bypass. */
export function isDashboardBillingResolutionPath(pathname: string | null): boolean {
  return pathname === "/settings/subscription" ||
    pathname === "/settings/subscription/cancel"
}

export interface ApplicationAccessPresentation {
  headline: string
  description: string
  continuity: string | null
  stripeTrial: string | null
  retainedGrant: string | null
  showBanner: boolean
}

export function formatAccessInstant(value: Date | string): string {
  const date = new Date(value)
  return `${date.toLocaleString("en-AU", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    second: "2-digit", timeZone: "UTC",
  })} UTC`
}

/** Display projection only: never feed the granted plan into purchased-plan controls. */
export function getApplicationAccessPresentation(access: EffectiveAccess | null): ApplicationAccessPresentation {
  const retainedGrant = access?.grant?.plan && access.grant.expiresAt && access.source !== "admin_grant"
    ? `Separate grant record: ${PLAN_CATALOG[access.grant.plan].name}, expires ${formatAccessInstant(access.grant.expiresAt)}${access.grant.revokedAt ? `, revoked ${formatAccessInstant(access.grant.revokedAt)}` : ""}. This does not change the current billing plan or establish access on its own.`
    : null
  if (!access?.allowAccess || !access.effectiveTier) return {
    headline: "Application access unavailable",
    description: "Billing settings and operation recovery remain available. Choose a plan or resolve your billing state to restore application access.",
    continuity: null, stripeTrial: null, retainedGrant, showBanner: false,
  }
  const plan = PLAN_CATALOG[access.effectiveTier].name
  const expiry = access.effectiveAccessExpiresAt
    ? formatAccessInstant(access.effectiveAccessExpiresAt) : null
  const preferredExpiry = access.source === "admin_grant" ? access.grant?.expiresAt
    : access.source === "stripe_trial" ? access.stripeTrialEndsAt : access.effectiveAccessExpiresAt
  const preferredEnd = preferredExpiry ? formatAccessInstant(preferredExpiry) : null
  const sourceLabels = {
    paid: "Paid Stripe subscription", stripe_trial: "Stripe trial",
    admin_grant: "Temporary PaidSoon grant", onboarding_trial: "Onboarding trial",
    past_due_grace: "Payment grace", platform_owner: "Platform owner internal access", none: "No access",
  }
  const continuity = access.effectiveExpirySource && access.effectiveExpirySource !== access.source &&
    access.effectiveExpiryTier && expiry
    ? `Independent ${sourceLabels[access.effectiveExpirySource]} continuity: ${PLAN_CATALOG[access.effectiveExpiryTier].name} application access until ${expiry}. This does not extend the current plan or postpone Stripe charges.`
    : null
  const stripeTrial = access.source === "stripe_trial"
    ? access.trialTimingPendingReconciliation
      ? "Stripe still reports trialing. Trial end and first-payment timing are pending reconciliation; a local date does not end this Stripe trial."
      : `Stripe trial ends ${preferredEnd}. First-payment timing follows Stripe billing, not any application grant.`
    : null
  return {
    headline: `${plan} application access — ${sourceLabels[access.source]}`,
    description: access.source === "platform_owner"
      ? "Internal application access uses the existing plan limits. This is not a paid subscription or a trial; Stripe billing is unchanged."
      : access.source === "admin_grant"
      ? `PaidSoon access only until ${preferredEnd} — Stripe billing unchanged. This grant does not postpone charges or purchase a subscription.`
      : access.source === "onboarding_trial"
        ? `Onboarding application access until ${preferredEnd}. This is not a Stripe subscription or a Stripe charge date.`
        : access.source === "past_due_grace"
          ? "Your billing plan remains available under the existing payment grace policy. Retained grants do not increase this access."
          : access.source === "paid"
            ? "Your paid Stripe plan takes precedence. Any retained grant does not change your purchased plan, price or billing dates."
            : stripeTrial!,
    continuity,
    stripeTrial,
    retainedGrant,
    showBanner: ["admin_grant", "stripe_trial", "onboarding_trial", "platform_owner"].includes(access.source),
  }
}

export function getSubscriptionBillingState({
  status,
  currentPeriodEnd,
  subscriptionCancelAt,
  canCancelSubscription,
}: SubscriptionBillingStateInput): SubscriptionBillingState {
  if (status === "past_due") {
    return {
      headline: "Payment overdue",
      description:
        "We could not process your latest payment. Please update your billing details to keep your reminders running.",
      showCancelAction: canCancelSubscription,
      isTrialOnly: false,
    }
  }

  if (status === "incomplete") {
    return {
      headline: "Checkout incomplete",
      description:
        "Your subscription setup was not completed. Return to checkout to finish activation.",
      showCancelAction: false,
      isTrialOnly: false,
    }
  }

  if (status === "unpaid" || status === "canceled" || status === "cancelled") {
    return {
      headline: "Subscription inactive",
      description:
        "Your subscription is inactive. Choose a plan to restore subscription access. Any temporary application access is shown separately.",
      showCancelAction: false,
      isTrialOnly: false,
    }
  }

  if (subscriptionCancelAt) {
    const formattedDate = formatSubscriptionDate(subscriptionCancelAt)
    return {
      headline: `Cancels on ${formattedDate}`,
      description: `Your subscription stays active until ${formattedDate}. You will not be charged again after that date.`,
      showCancelAction: false,
      isTrialOnly: false,
    }
  }

  if (status === "trialing" && !canCancelSubscription) {
    return {
      headline: "End free trial",
      description: "You're on a free trial with no active paid subscription yet.",
      showCancelAction: true,
      isTrialOnly: true,
    }
  }

  if (currentPeriodEnd) {
    return {
      headline: `Next billing date: ${formatSubscriptionDate(currentPeriodEnd)}`,
      description: null,
      showCancelAction: canCancelSubscription,
      isTrialOnly: false,
    }
  }

  return {
    headline: null,
    description: null,
    showCancelAction: canCancelSubscription,
    isTrialOnly: false,
  }
}

export function getSubscriptionCancellationPageState({
  status,
  currentPeriodEnd,
  subscriptionCancelAt,
  canCancelSubscription,
}: SubscriptionBillingStateInput): SubscriptionCancellationPageState {
  if (status === "incomplete") {
    return {
      title: "Subscription not active",
      description:
        "Your checkout was not completed. Finish checkout before managing cancellation.",
      confirmLabel: null,
      confirmDisabled: true,
    }
  }

  if (status === "unpaid" || status === "canceled" || status === "cancelled") {
    return {
      title: "Subscription already inactive",
      description:
        "This subscription is no longer active. You can choose a new plan from subscription settings.",
      confirmLabel: null,
      confirmDisabled: true,
    }
  }

  if (subscriptionCancelAt) {
    const formattedDate = formatSubscriptionDate(subscriptionCancelAt)
    return {
      title: "Are you sure?",
      description: `Cancellation is already scheduled for ${formattedDate}. Your subscription stays active until then, and you can keep it if you change your mind.`,
      confirmLabel: null,
      confirmDisabled: true,
    }
  }

  if (status === "trialing" && !canCancelSubscription) {
    return {
      title: "Are you sure?",
      description: "You're on a free trial with no active paid subscription yet. Ending it now will stop the trial and return you to the subscription settings page.",
      confirmLabel: "End free trial",
      confirmDisabled: false,
    }
  }

  const billingDate = currentPeriodEnd ? formatSubscriptionDate(currentPeriodEnd) : null
  return {
    title: "Are you sure?",
    description: billingDate
      ? `Your plan will remain active until ${billingDate}, and you will not be charged again after that date.`
      : "Your plan will remain active until the end of the current billing period, and you will not be charged again after that date.",
    confirmLabel: canCancelSubscription ? "Continue to Stripe" : null,
    confirmDisabled: !canCancelSubscription,
  }
}