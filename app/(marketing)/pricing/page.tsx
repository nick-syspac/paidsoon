import type { Metadata } from "next"
import Link from "next/link"
import { PricingCTA } from "@/components/pricing/PricingCTA"
import {
  getPublicPlans,
  isFeatureImplemented,
  PLAN_CATALOG,
  type SubscriptionFeature,
  type SubscriptionTier,
} from "@/lib/subscriptionPlans"
import { formatPlanPrice, planHighlights, PLAN_TAGLINE } from "@/lib/planPresentation"

const publicPlans = getPublicPlans()

export const metadata: Metadata = {
  title: "Pricing — PaidSoon",
  description: `Simple, transparent pricing for PaidSoon. Start a free trial with ${publicPlans
    .map((plan) => `${plan.name} at ${formatPlanPrice(plan.monthlyPriceAud)} AUD (inc. GST)`)
    .join(", ")}, or contact us for the ${PLAN_CATALOG.accountant_partner.name} plan.`,
}

const PLAN_CTA_LABEL: Record<SubscriptionTier, string> = {
  starter: "Start with Starter",
  solo: "Start with Solo",
  small_business: "Start with Small Business",
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

const comparisonRows: ComparisonRow[] = [
  limitRow("Invoices chased per month", (tier) => PLAN_CATALOG[tier].limits.chasedInvoicesPerMonth),
  limitRow("Internal users", (tier) => PLAN_CATALOG[tier].limits.userSeats, 1),
  limitRow("Connected invoice sources", (tier) => PLAN_CATALOG[tier].limits.connectedInvoiceSources),
  featureRow("Automated reminder sequence", "basic_email_reminders"),
  featureRow("Custom reminder timing", "email_reminder_sequence"),
  featureRow("Customer-specific sequences", "customer_specific_sequences"),
  featureRow("Fully editable templates", "custom_reminder_templates"),
  featureRow("Multiple templates & customer wording", "multi_template_customer_wording"),
  featureRow("Custom sender name", "custom_sender_name"),
  featureRow("Verified custom from-address", "verified_from_domain"),
  featureRow("AI-assisted reminder wording", "ai_rewrite"),
  featureRow("Promise-to-pay tracking", "promise_to_pay_tracking"),
  featureRow("Dispute pause", "dispute_pause"),
  featureRow("Weekly debtor summary email", "weekly_summary_email"),
  featureRow("CSV export", "csv_export"),
  featureRow("Approval mode", "approval_mode"),
  featureRow("Customer suppression / do-not-contact", "contact_suppression"),
  featureRow("Accounting integrations (MYOB, Xero)", "accounting_integrations"),
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-12 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Simple, transparent pricing</h1>
        <p className="mt-4 text-lg text-gray-500">
          Start your free trial. No credit card required. Cancel any time — no lock-in contracts.
        </p>
        <p className="mt-2 text-sm text-gray-400">All prices are in AUD and include GST.</p>
      </section>

      {/* Plan cards */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="grid lg:grid-cols-3 gap-6">
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
              <PricingCTA tier={plan.id} label={PLAN_CTA_LABEL[plan.id]} featured={plan.popular} />
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
          <p className="text-blue-100 mb-6">Free trial. No credit card required.</p>
          <Link
            href="/sign-up"
            className="inline-block bg-white text-blue-600 px-6 py-3 rounded-md text-sm font-semibold hover:bg-blue-50"
          >
            Start Free Trial
          </Link>
        </div>
      </section>
    </div>
  )
}
