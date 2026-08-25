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

export interface SubscriptionCancellationPageState {
  title: string
  description: string
  confirmLabel: string | null
  confirmDisabled: boolean
}

export function getSubscriptionBillingState({
  status,
  currentPeriodEnd,
  subscriptionCancelAt,
  canCancelSubscription,
}: SubscriptionBillingStateInput): SubscriptionBillingState {
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