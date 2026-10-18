"use client"

import { useBillingOperation } from "@/components/billing/useBillingOperation"
import { BillingOperationNotice } from "@/components/billing/BillingOperationNotice"
import type { BillingClientProps } from "@/lib/billing/clientOperation"

/**
 * Client-driven Stripe Checkout kickoff. Deliberately requires an explicit
 * user click before creating a Checkout session and redirecting — the
 * previous /billing/checkout page created a session and redirected
 * automatically on every server render, which meant Stripe's cancel_url
 * (which points back under /dashboard/**) re-entered the trial-expired
 * gate in app/dashboard/layout.tsx and immediately bounced back into a new
 * Checkout session, producing an inescapable redirect loop. Requiring a
 * click here breaks that loop: landing on this page is now a static stop,
 * not another hop.
 */
export function StartCheckoutButton({ tier, checkoutEnabled = true, ...billing }: { tier: string; checkoutEnabled?: boolean } & BillingClientProps) {
  const operation = useBillingOperation(billing)
  const { loading } = operation

  return (
    <div className="space-y-3">
      {checkoutEnabled && <button
        onClick={() => void operation.start({ path: "/api/billing/checkout", method: "POST", body: { tier } })}
        disabled={loading}
        className="w-full bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Redirecting to secure checkout…" : "Continue to Subscribe"}
      </button>}
      <BillingOperationNotice operation={operation} />
    </div>
  )
}
