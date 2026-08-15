import Link from "next/link"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { getDashboardProfile } from "@/lib/dashboard/loadDashboardProfile"
import { normalizeSubscriptionTier } from "@/lib/subscriptionPlans"
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

  const isTrialing = profile?.subscriptionStatus === "trialing"
  const trialEndsAt = profile?.trialEndsAt ?? null
  const tier = normalizeSubscriptionTier(profile?.subscriptionTier)

  // Gate: trial has expired → force checkout
  if (isTrialing && trialEndsAt !== null && trialEndsAt < new Date()) {
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        stage: "dashboard.layout.redirect",
        operation: "redirect_trial_expired",
        subsystem: "dashboard",
        component: "app/dashboard/layout.tsx",
        event: "decision",
        navigation: { from: "/dashboard", to: `/billing/checkout?plan=${tier}&reason=trial_expired`, decision: "trial_expired" },
        outputs: { tier, isTrialing, trialEndsAtPresent: true },
      }),
      traceContext,
    )
    redirect(`/billing/checkout?plan=${tier}&reason=trial_expired`)
  }

  // Banner: trial still active
  const daysRemaining =
    isTrialing && trialEndsAt !== null
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
      : null

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
        isTrialing,
        trialBannerShown: daysRemaining !== null,
        daysRemainingPresent: daysRemaining !== null,
      },
    }),
    traceContext,
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <SupportBanner />
      {daysRemaining !== null && (
        <TrialBanner
          daysRemaining={daysRemaining}
          checkoutUrl={`/billing/checkout?plan=${tier}`}
        />
      )}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="font-semibold text-gray-900 text-sm">
            PaidSoon
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Dashboard
            </Link>
            <Link
              href="/dashboard/settings"
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
      <DashboardMain>{children}</DashboardMain>
    </div>
  )
}
