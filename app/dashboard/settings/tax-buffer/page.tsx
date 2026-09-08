import { redirect } from "next/navigation"

import { TaxBufferSettingsClient } from "@/components/settings/TaxBufferSettingsClient"
import { getSubscriptionTier } from "@/lib/billing"
import { hasPlanFeature } from "@/lib/subscriptionPlans"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { getTaxBufferSettings } from "@/lib/taxBuffer/service"

export default async function TaxBufferSettingsPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!hasPlanFeature(tier, "tax_buffer_basic")) {
    redirect("/dashboard?intent=tax_buffer")
  }

  const canCustomizeCategories = hasPlanFeature(tier, "tax_buffer_custom_reserves")

  const data = await getTaxBufferSettings(user.id)
  const configuration = data.configuration

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Tax Buffer settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Configure how Tax Buffer estimates obligations and safe-to-spend cash for your business.
        </p>
      </div>

      <TaxBufferSettingsClient
        settings={{
          enabled: configuration?.enabled ?? false,
          accountingBasis: configuration?.accountingBasis === "accrual" ? "accrual" : "cash",
          businessType: configuration?.businessType ?? "other",
          gstRegistered: configuration?.gstRegistered ?? false,
          gstFrequency:
            configuration?.gstFrequency === "monthly" || configuration?.gstFrequency === "annually"
              ? configuration.gstFrequency
              : "quarterly",
          reserveBalanceSource:
            configuration?.reserveBalanceSource === "connected_account" ? "connected_account" : "manual",
          reserveBalanceCents: configuration?.reserveBalanceCents ?? 0,
          reserveAccountName: configuration?.reserveAccountName ?? null,
          categories: data.categories.map((category) => ({
            id: category.id,
            categoryType: category.categoryType,
            name: category.name,
            enabled: category.enabled,
            calculationMethod: category.calculationMethod,
            recurrence: category.recurrence,
            ratePercent: category.ratePercent,
            fixedAmountCents: category.fixedAmountCents,
            manualAmountCents: category.manualAmountCents,
          })),
          suggestedDefaults: data.suggestedDefaults,
        }}
        canCustomizeCategories={canCustomizeCategories}
      />
    </div>
  )
}
