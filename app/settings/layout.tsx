import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { headers } from "next/headers"

import { getSubscriptionTier } from "@/lib/billing"
import { SettingsNavigation } from "@/components/settings/SettingsNavigation"
import { getVisibleSettingsNavGroups } from "@/lib/settings/navigation"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { getDashboardProfile } from "@/lib/dashboard/loadDashboardProfile"
import { normalizeSubscriptionTier } from "@/lib/subscriptionPlans"
import {
  getApplicationAccessPresentation,
  getDashboardSubscriptionAccessState,
  isDashboardBillingResolutionPath,
} from "@/lib/subscriptionStatusPresentation"
import { SupportBanner } from "@/components/dashboard/SupportBanner"
import { TrialBanner } from "@/components/dashboard/TrialBanner"
import { UserMenu } from "@/components/dashboard/UserMenu"

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers()
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const profile = await getDashboardProfile(user.id)
  const access = profile?.effectiveAccess ?? null
  const status = profile?.subscriptionStatus ?? null
  const accessState = getDashboardSubscriptionAccessState(access, status)
  const accessPresentation = getApplicationAccessPresentation(access)
  const billingResolution = isDashboardBillingResolutionPath(requestHeaders.get("x-paidsoon-pathname"))

  // Catalog fallback is a Checkout selection only, never application authorization.
  const checkoutTier = normalizeSubscriptionTier(profile?.subscriptionTier)
  const checkoutUrl = `/billing/checkout?plan=${checkoutTier}`

  if (!accessState.allowAccess && !billingResolution) {
    redirect(`${checkoutUrl}&reason=${accessState.redirectReason}`)
  }

  const tier = await getSubscriptionTier(user.id)
  const groups = tier === null
    ? [{ id: "general", label: "Billing", items: [{
        href: "/settings/subscription", label: "Subscription", group: "general", order: 1,
      }] }]
    : getVisibleSettingsNavGroups(tier)

  return (
    <div className="min-h-screen bg-gray-50">
      <SupportBanner />
      {accessState.showBillingWarning && accessState.billingWarning ? (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto max-w-5xl px-4 py-2 text-sm text-amber-800">
            {accessState.billingWarning}
          </div>
        </div>
      ) : null}
      {accessPresentation.showBanner && (
        <TrialBanner
          presentation={accessPresentation}
          checkoutUrl={checkoutUrl}
        />
      )}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/dashboard"
            aria-label="PaidSoon dashboard"
            className="shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Image
              src="/paidsoon-logo.png"
              alt="PaidSoon FinOps"
              width={1086}
              height={160}
              priority
              className="h-6 w-auto"
            />
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Dashboard
            </Link>
            <Link
              href="/settings"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Settings
            </Link>
            <UserMenu
              email={user.email ?? ""}
              displayName={profile?.displayName ?? null}
              tier={tier}
            />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="space-y-6">
          <h1 className="text-xl font-semibold text-gray-900">Settings</h1>

          <div className="flex flex-col gap-6 md:flex-row">
            <SettingsNavigation groups={groups} />

            <div className="min-w-0">{children}</div>
          </div>
        </div>
      </main>
    </div>
  )
}
