import { createElement } from "react"
import { redirect } from "next/navigation"

import { DepositGuardCreateJobWizard } from "@/components/dashboard/depositGuard/DepositGuardCreateJobWizard"
import { getSubscriptionTier } from "@/lib/billing"
import { canAccessDepositGuard } from "@/lib/dashboard/depositGuardAccess"
import { getDepositGuardEntitlements } from "@/lib/depositGuard/entitlements"
import { getAuthenticatedUser } from "@/lib/supabase/server"

export default async function DepositGuardCreateJobPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!canAccessDepositGuard(tier)) {
    redirect("/dashboard?intent=deposit_guard")
  }

  const entitlements = await getDepositGuardEntitlements(user.id)

  return createElement(DepositGuardCreateJobWizard, {
    canSubmit: entitlements.canCreateRequests,
  })
}