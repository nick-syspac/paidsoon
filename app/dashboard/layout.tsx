import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { buildNoIndexMetadata } from "@/lib/marketing/seo"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { getDashboardProfile } from "@/lib/dashboard/loadDashboardProfile"
import { hasPlanFeature, normalizeSubscriptionTier } from "@/lib/subscriptionPlans"
import { getDashboardSubscriptionAccessState, getApplicationAccessPresentation, isDashboardBillingResolutionPath } from "@/lib/subscriptionStatusPresentation"
import { canAccessSpendLeak } from "@/lib/dashboard/spendleakAccess"
import { canAccessDepositGuard } from "@/lib/dashboard/depositGuardAccess"
import { canAccessTaxBuffer } from "@/lib/dashboard/taxBufferAccess"
import { canAccessMarginGuard } from "@/lib/dashboard/marginguardAccess"
import { canAccessOwnersDigest } from "@/lib/dashboard/ownersDigestAccess"
import { canAccessRunwayGuard } from "@/lib/dashboard/runwayGuardAccess"
import { TrialBanner } from "@/components/dashboard/TrialBanner"
import { UserMenu } from "@/components/dashboard/UserMenu"
import { SupportBanner } from "@/components/dashboard/SupportBanner"
import { DashboardMain } from "@/components/dashboard/DashboardMain"
import {
  createServerTraceContext,
  traceEvent,
  traceOperation,
  warnIfProductionDebugEnabled,
} from "@/lib/diagnostics/server"
import { summariseAuthForTrace } from "@/lib/diagnostics/shared"

export const metadata: Metadata = buildNoIndexMetadata({
  title: "PaidSoon dashboard",
  description: "View and manage your PaidSoon account dashboard.",
})

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const requestHeaders = await headers()
  const traceContext = createServerTraceContext({
    headers: requestHeaders,
    cookieHeader: requestHeaders.get("cookie"),
  })
  warnIfProductionDebugEnabled(traceContext)

  const { data: { user } } = await traceOperation(
    traceContext,
    {
      traceId: traceContext.traceId,
      stage: "dashboard.layout.auth",
      operation: "supabase.auth.getUser",
      subsystem: "dashboard",
      component: "app/dashboard/layout.tsx",
    },
    () => getAuthenticatedUser(),
    {
      success: (result) => ({
        auth: summariseAuthForTrace({ user: result.data.user }),
        outputs: { userPresent: Boolean(result.data.user) },
      }),
    },
  )

  if (!user) {
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        stage: "dashboard.layout.redirect",
        operation: "redirect_unauthenticated_layout",
        subsystem: "dashboard",
        component: "app/dashboard/layout.tsx",
        event: "decision",
        navigation: { from: "/dashboard", to: "/sign-in", decision: "layout_unauthenticated" },
        auth: summariseAuthForTrace({ user }),
      }),
      traceContext,
    )
    redirect("/sign-in")
  }

  const profile = await traceOperation(
    traceContext,
    {
      traceId: traceContext.traceId,
      stage: "dashboard.layout.profile_load",
      operation: "getDashboardProfile",
      subsystem: "dashboard",
      component: "app/dashboard/layout.tsx",
      auth: summariseAuthForTrace({ user }),
      tenant: { context: "user_rls" },
    },
    () => getDashboardProfile(user.id),
    {
      success: (result) => ({
        outputs: {
          profilePresent: Boolean(result),
          subscriptionStatus: result?.subscriptionStatus ?? null,
          subscriptionTier: result?.subscriptionTier ?? null,
          trialEndsAtPresent: Boolean(result?.trialEndsAt),
          displayNamePresent: Boolean(result?.displayName),
        },
      }),
    },
  )

  const access = profile?.effectiveAccess ?? null
  const tier = access?.allowAccess ? access.effectiveTier : null
  const status = profile?.subscriptionStatus ?? null
  const accessState = getDashboardSubscriptionAccessState(access, status)
  const accessPresentation = getApplicationAccessPresentation(access)
  const billingResolution = isDashboardBillingResolutionPath(requestHeaders.get("x-paidsoon-pathname"))
  // Catalog fallback is a Checkout selection only, never application authorization.
  const checkoutTier = normalizeSubscriptionTier(profile?.subscriptionTier)
  const checkoutUrl = `/billing/checkout?plan=${checkoutTier}`

  if (!accessState.allowAccess && !billingResolution) {
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        stage: "dashboard.layout.redirect",
        operation: "redirect_subscription_inactive",
        subsystem: "dashboard",
        component: "app/dashboard/layout.tsx",
        event: "decision",
        navigation: {
          from: "/dashboard",
          to: `${checkoutUrl}&reason=${accessState.redirectReason}`,
          decision: `subscription_${accessState.redirectReason}`,
        },
        outputs: {
          tier,
          status,
          allowAccess: accessState.allowAccess,
          redirectReason: accessState.redirectReason,
        },
      }),
      traceContext,
    )
    redirect(`${checkoutUrl}&reason=${accessState.redirectReason}`)
  }

  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "dashboard.layout.render",
      operation: "render_dashboard_layout",
      subsystem: "dashboard",
      component: "app/dashboard/layout.tsx",
      event: "complete",
      auth: summariseAuthForTrace({ user }),
      outputs: {
        tier,
        source: access?.source ?? "none",
        trialBannerShown: accessPresentation.showBanner,
      },
    }),
    traceContext,
  )

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
      <DashboardMain
        canViewDepositGuard={tier !== null && canAccessDepositGuard(tier)}
        canViewOwnersDigest={tier !== null && canAccessOwnersDigest(tier)}
        canViewCommitGuard={tier !== null && hasPlanFeature(tier, "commitguard_core")}
        canViewSpendLeak={tier !== null && canAccessSpendLeak(tier)}
        canViewTaxBuffer={tier !== null && canAccessTaxBuffer(tier)}
        canViewMarginGuard={tier !== null && canAccessMarginGuard(tier)}
        canViewRunwayGuard={tier !== null && canAccessRunwayGuard(tier)}
      >
        {children}
      </DashboardMain>
    </div>
  )
}
