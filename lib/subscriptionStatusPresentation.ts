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
  redirectReason: "incomplete" | "unpaid" | "canceled" | null
}

export interface SubscriptionCancellationPageState {
  title: string
  description: string
  confirmLabel: string | null
  confirmDisabled: boolean
}

export function getDashboardSubscriptionAccessState(
  status: string,
): DashboardSubscriptionAccessState {
  switch (status) {
    case "active":
    case "trialing":
      return {
        allowAccess: true,
        showBillingWarning: false,
        billingWarning: null,
        redirectReason: null,
      }
    case "past_due":
      return {
        allowAccess: true,
        showBillingWarning: true,
        billingWarning:
          "Your latest payment did not go through. Please update your billing details to avoid interruption.",
        redirectReason: null,
      }
    case "incomplete":
      return {
        allowAccess: false,
        showBillingWarning: false,
        billingWarning: null,
        redirectReason: "incomplete",
      }
    case "unpaid":
      return {
        allowAccess: false,
        showBillingWarning: false,
        billingWarning: null,
        redirectReason: "unpaid",
      }
    case "canceled":
    case "cancelled":
      return {
        allowAccess: false,
        showBillingWarning: false,
        billingWarning: null,
        redirectReason: "canceled",
      }
    default:
      return {
        allowAccess: true,
        showBillingWarning: false,
        billingWarning: null,
        redirectReason: null,
      }
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
        "Your subscription is inactive. Choose a plan to restore full access.",
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