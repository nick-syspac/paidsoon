import {
  getDepositGuardActiveJobsLimitForTier,
  getSubscriptionTier,
  requireFeature,
} from "@/lib/billing"

export interface DepositGuardEntitlements {
  tier: string
  hasAccess: boolean
  canCreateRequests: boolean
  hasAutomaticReminders: boolean
  hasProgressPayments: boolean
  hasPaymentSchedules: boolean
  hasAccountingSync: boolean
  hasCashPlanForecasting: boolean
  hasAdvancedReporting: boolean
  activeJobsLimit: number
}

export async function getDepositGuardEntitlements(
  userId: string,
): Promise<DepositGuardEntitlements> {
  const [
    tier,
    hasAccess,
    canCreateRequests,
    hasAutomaticReminders,
    hasProgressPayments,
    hasPaymentSchedules,
    hasAccountingSync,
    hasCashPlanForecasting,
    hasAdvancedReporting,
  ] = await Promise.all([
    getSubscriptionTier(userId),
    requireFeature(userId, "deposit_guard_access"),
    requireFeature(userId, "deposit_guard_deposit_requests"),
    requireFeature(userId, "deposit_guard_automatic_reminders"),
    requireFeature(userId, "deposit_guard_progress_payments"),
    requireFeature(userId, "deposit_guard_payment_schedules"),
    requireFeature(userId, "deposit_guard_accounting_sync"),
    requireFeature(userId, "deposit_guard_cashplan_forecasting"),
    requireFeature(userId, "deposit_guard_advanced_reporting"),
  ])

  return {
    tier,
    hasAccess,
    canCreateRequests,
    hasAutomaticReminders,
    hasProgressPayments,
    hasPaymentSchedules,
    hasAccountingSync,
    hasCashPlanForecasting,
    hasAdvancedReporting,
    activeJobsLimit: getDepositGuardActiveJobsLimitForTier(tier),
  }
}

export async function requireDepositGuardAccess(userId: string): Promise<void> {
  if (!(await requireFeature(userId, "deposit_guard_access"))) {
    throw new Error("Upgrade required")
  }
}

export async function requireDepositGuardRequestAccess(
  userId: string,
): Promise<void> {
  if (!(await requireFeature(userId, "deposit_guard_deposit_requests"))) {
    throw new Error("Upgrade required")
  }
}

export async function requireDepositGuardProgressPaymentsAccess(
  userId: string,
): Promise<void> {
  if (!(await requireFeature(userId, "deposit_guard_progress_payments"))) {
    throw new Error("Upgrade required")
  }
}

export async function requireDepositGuardPaymentSchedulesAccess(
  userId: string,
): Promise<void> {
  if (!(await requireFeature(userId, "deposit_guard_payment_schedules"))) {
    throw new Error("Upgrade required")
  }
}
