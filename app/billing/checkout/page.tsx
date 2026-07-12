import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { getPlanByTier, normalizeSubscriptionTier } from "@/lib/subscriptionPlans"
import { StartCheckoutButton } from "@/components/billing/StartCheckoutButton"

export default async function BillingCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; reason?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/sign-in")

  const params = await searchParams

  // Resolve tier: prefer the ?plan query param, fall back to the user's stored tier.
  let tier = normalizeSubscriptionTier(params.plan ?? null)
  if (!params.plan) {
    const profile = await withUserContext(user.id, (tx) =>
      tx.userProfile.findUnique({
        where: { userId: user.id },
        select: { subscriptionTier: true },
      }),
    )
    tier = normalizeSubscriptionTier(profile?.subscriptionTier)
  }

  const plan = getPlanByTier(tier)
  const isTrialExpired = params.reason === "trial_expired"

  // Note: this page intentionally does NOT create a Checkout session or
  // redirect automatically on render. It previously did both, which meant
  // Stripe's cancel_url (pointing back under /dashboard/**) re-entered the
  // trial-expired gate in app/dashboard/layout.tsx and immediately bounced
  // back here for a brand-new session — an inescapable redirect loop.
  // Session creation now only happens client-side, on an explicit click
  // (see StartCheckoutButton), so landing here is always a stable stop.
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">
          {isTrialExpired ? "Your trial has ended" : "Upgrade your plan"}
        </h1>
        <p className="text-sm text-gray-600">
          {isTrialExpired
            ? "Subscribe to keep sending reminders and tracking overdue invoices."
            : `Subscribe to the ${plan.name} plan to continue.`}
        </p>
        {plan.monthlyPriceAud !== null ? (
          <>
            <p className="text-2xl font-semibold text-gray-900">
              {plan.name} — ${plan.monthlyPriceAud}/mo
            </p>
            <StartCheckoutButton tier={tier} />
          </>
        ) : (
          <p className="text-sm text-gray-600">
            The {plan.name} plan uses custom pricing — contact us to get set up.
          </p>
        )}
        <a
          href="/"
          className="inline-block text-sm text-gray-500 hover:underline"
        >
          Not now — return to homepage
        </a>
      </div>
    </div>
  )
}
