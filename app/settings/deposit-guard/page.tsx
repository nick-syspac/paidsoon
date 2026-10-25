import { redirect } from "next/navigation"

import { DepositGuardSettingsClient } from "@/components/settings/DepositGuardSettingsClient"
import { getSubscriptionTier } from "@/lib/billing"
import { getDepositGuardSettings } from "@/lib/depositGuard/settings"
import { hasPlanFeature } from "@/lib/subscriptionPlans"
import { getAuthenticatedUser } from "@/lib/supabase/server"

export default async function DepositGuardSettingsPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!hasPlanFeature(tier, "deposit_guard_deposit_requests")) {
    redirect("/dashboard?intent=deposit_guard")
  }

  const settings = await getDepositGuardSettings(user.id)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">DepositGuard settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Configure reminder timing, default payment handling, commencement blocking, and optional metadata.
        </p>
      </div>

      <DepositGuardSettingsClient
        settings={{
          autoReminderEnabled: settings.autoReminderEnabled,
          initialReminderOffsetDays: settings.initialReminderOffsetDays,
          beforeDueOffsetDays: settings.beforeDueOffsetDays,
          overdue3Enabled: settings.overdue3Enabled,
          overdue7Enabled: settings.overdue7Enabled,
          paymentProviderDefault: settings.paymentProviderDefault,
          requireDepositBeforeStart: settings.requireDepositBeforeStart,
          settingsJson: settings.settingsJson ?? null,
        }}
      />
    </div>
  )
}