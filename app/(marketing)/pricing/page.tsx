import type { Metadata } from "next"
import Link from "next/link"
import { PricingCTA } from "@/components/pricing/PricingCTA"
import { MarketingPageViewTracker } from "@/components/marketing/MarketingPageViewTracker"
import {
  getPublicPlans,
  isFeatureImplemented,
  PLAN_CATALOG,
  type SubscriptionFeature,
  type SubscriptionTier,
} from "@/lib/subscriptionPlans"
import {
  formatPlanPrice,
  getPlanModuleCoverage,
  planHighlights,
  PLAN_TAGLINE,
} from "@/lib/planPresentation"
import { isLiveMode } from "@/lib/liveMode"
import { canAccessMarginGuard } from "@/lib/dashboard/marginguardAccess"
import { canAccessOwnersDigest } from "@/lib/dashboard/ownersDigestAccess"
import { canAccessRunwayGuard } from "@/lib/dashboard/runwayGuardAccess"
import { canAccessTaxBuffer } from "@/lib/dashboard/taxBufferAccess"

const publicPlans = getPublicPlans()

export const metadata: Metadata = {
  title: "Pricing — PaidSoon",
  description: `Simple, transparent pricing for PaidSoon. Start a free trial with ${publicPlans
    .map((plan) => `${plan.name} at ${formatPlanPrice(plan.monthlyPriceAud)} AUD (inc. GST)`)
    .join(", ")}, or contact us for the ${PLAN_CATALOG.accountant_partner.name} plan.`,
    alternates: { canonical: "/pricing" },
    openGraph: {
      title: "Pricing - PaidSoon",
      description:
        "Compare Essentials, Solo, Small Business, and Business Pro plans across receivables, commitments, tax, margin, digest, and runway controls.",
      url: "/pricing",
      type: "website",
    },
}

const PLAN_CTA_LABEL: Record<SubscriptionTier, string> = {
  starter: "Start with Essentials",
  solo: "Start with Solo",
  small_business: "Start with Small Business",
  business_pro: "Start with Business Pro",
  accountant_partner: "Contact us",
}

interface ComparisonRow {
  label: string
  values: (tier: SubscriptionTier) => string
}

function limitRow(
  label: string,
  select: (tier: SubscriptionTier) => number,
  unimplementedAbove = Infinity,
): ComparisonRow {
  return {
    label,
    values: (tier) => {
      const limit = select(tier)
      if (limit === -1) return "Unlimited"
      return limit > unimplementedAbove ? `Up to ${limit} (coming soon)` : `${limit}`
    },
  }
}

function featureRow(label: string, feature: SubscriptionFeature): ComparisonRow {
  return {
    label,
    values: (tier) => {
      if (!PLAN_CATALOG[tier].features[feature]) return "—"
      return isFeatureImplemented(feature) ? "✓" : "Coming soon"
    },
  }
}

function customRow(label: string, values: (tier: SubscriptionTier) => string): ComparisonRow {
  return { label, values }
}

const comparisonRows: ComparisonRow[] = [
  limitRow("Invoices chased per month", (tier) => PLAN_CATALOG[tier].limits.chasedInvoicesPerMonth),
  limitRow("Internal users", (tier) => PLAN_CATALOG[tier].limits.userSeats, 1),
  limitRow("Connected invoice sources", (tier) => PLAN_CATALOG[tier].limits.connectedInvoiceSources),
  featureRow("PaidSoon reminders", "basic_email_reminders"),
  featureRow("Custom reminder timing", "email_reminder_sequence"),
  featureRow("Custom reminder templates", "custom_reminder_templates"),
  featureRow("Custom sender name", "custom_sender_name"),
  featureRow("Verified custom from-address", "verified_from_domain"),
  featureRow("AI-assisted reminder wording", "ai_rewrite"),
  featureRow("Promise-to-pay tracking", "promise_to_pay_tracking"),
  featureRow("Dispute pause", "dispute_pause"),
  customRow("CommitGuard", (tier) => (PLAN_CATALOG[tier].features.commitguard_core ? "Included" : "—")),
  customRow("Tax Buffer", (tier) => (canAccessTaxBuffer(tier) ? "Included" : "—")),
  customRow("Owner's Digest", (tier) => (canAccessOwnersDigest(tier) ? "Included" : "—")),
  customRow("MarginGuard", (tier) => (canAccessMarginGuard(tier) ? "Included" : "—")),
  customRow("RunwayGuard", (tier) => (canAccessRunwayGuard(tier) ? "Included" : "—")),
  featureRow("Owner's Digest email delivery", "owners_digest_email"),
  featureRow("CSV export", "csv_export"),
  featureRow("Accounting integrations (MYOB, Xero)", "accounting_integrations"),
]

export default function PricingPage() {
  const liveMode = isLiveMode()
  const defaultCtaHref = liveMode ? "/sign-up" : "/contact?type=early-access"

  return (
    <div className="min-h-screen bg-white">
      <MarketingPageViewTracker page="pricing" />
      {/* Header */}
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-12 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Simple, transparent pricing</h1>
        <p className="mt-4 text-lg text-gray-500">
          {liveMode
            ? "Start your free trial. No credit card required. Cancel any time - no lock-in contracts."
            : "Pricing is available now. Request early access to start using PaidSoon."}
        </p>
        <p className="mt-2 text-sm text-gray-400">All prices are in AUD and include GST.</p>
      </section>

      {/* Plan cards */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="grid lg:grid-cols-4 gap-6">
          {publicPlans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl p-6 space-y-4 relative ${
                plan.popular
                  ? "border-2 border-blue-600 shadow-sm"
                  : "border border-gray-200"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-3 py-0.5 rounded-full">
                  Most popular
                </div>
              )}
              <div>
                <p className="text-lg font-semibold text-gray-900">{plan.name}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {formatPlanPrice(plan.monthlyPriceAud)}
                </p>
                <p className="text-sm text-gray-500 mt-2">{PLAN_TAGLINE[plan.id]}</p>
              </div>
              <ul className="space-y-2 text-sm text-gray-600">
                {planHighlights(plan.id).map((highlight) => (
                  <li key={highlight} className="flex gap-2">
                    <span className="text-green-500">✓</span>
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Module coverage</p>
                <ul className="mt-2 space-y-1 text-sm text-gray-600">
                  {getPlanModuleCoverage(plan.id).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <PricingCTA
                tier={plan.id}
                label={liveMode ? PLAN_CTA_LABEL[plan.id] : `Request access for ${plan.name}`}
                featured={plan.popular}
                href={defaultCtaHref}
                liveMode={liveMode}
              />
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">
          Managing invoice follow-ups for multiple clients?{" "}
          <Link href="/contact?type=partnership" className="text-blue-600 hover:underline">
            Contact us about {PLAN_CATALOG.accountant_partner.name}
          </Link>
          .
        </p>
      </section>

      {/* Trust messaging */}
      <section className="bg-gray-50 py-10">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 text-sm text-gray-500 text-center">
            <span>✓ Free trial — no credit card required</span>
            <span>✓ No lock-in contracts</span>
            <span>✓ Cancel any time</span>
            <span>✓ Australian owned and operated</span>
          </div>
        </div>
      </section>

      {/* Feature comparison */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Compare plans</h2>
        <p className="mx-auto mb-6 max-w-3xl text-center text-sm text-gray-600">
          Public plan coverage is shown from the current plan catalog and entitlement model. Contact us for Accountant Partner when you need a managed multi-client setup.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 pr-4 font-medium text-gray-500 w-1/2">Feature</th>
                {publicPlans.map((plan) => (
                  <th key={plan.id} className="text-center py-3 px-4 font-semibold text-gray-900">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.label} className="border-b border-gray-100">
                  <td className="py-3 pr-4 text-gray-700">{row.label}</td>
                  {publicPlans.map((plan) => (
                    <td key={plan.id} className="text-center py-3 px-4 text-gray-500">
                      {row.values(plan.id)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-blue-600 py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Ready to get started?</h2>
          <p className="text-blue-100 mb-6">
            {liveMode ? "Free trial. No credit card required." : "Request early access and we will contact you."}
          </p>
          <Link
            href={defaultCtaHref}
            className="inline-block bg-white text-blue-600 px-6 py-3 rounded-md text-sm font-semibold hover:bg-blue-50"
          >
            {liveMode ? "Start Free Trial" : "Request Early Access"}
          </Link>
        </div>
      </section>
    </div>
  )
}
