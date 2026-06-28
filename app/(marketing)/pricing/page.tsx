import type { Metadata } from "next"
import Link from "next/link"
import { PricingCTA } from "@/components/pricing/PricingCTA"

export const metadata: Metadata = {
  title: "Pricing — PaidSoon",
  description:
    "Simple, transparent pricing for PaidSoon. Start a free trial with Starter at $19/mo AUD, Business at $49/mo AUD, or contact us for the Accountant Partner plan.",
}

const pricingPlans = [
  {
    id: "starter" as const,
    name: "Starter",
    price: "$19/mo",
    cta: "Start with Starter",
    featured: false,
    description: "For freelancers and sole traders who want automated invoice chasing on autopilot.",
    features: [
      "Up to 20 tracked invoices",
      "1 connected Stripe account",
      "Automated 3-stage reminder sequence",
      "Reminder templates",
      "Debtor dashboard",
      "PaidSoon branding on emails",
    ],
  },
  {
    id: "business" as const,
    name: "Business",
    price: "$49/mo",
    cta: "Start with Business",
    featured: true,
    description: "For growing businesses that need more volume, custom branding, and AI-assisted reminders.",
    features: [
      "Up to 100 tracked invoices",
      "Up to 3 connected Stripe accounts",
      "Everything in Starter",
      "Custom email address (your domain)",
      "AI-assisted reminder wording",
      "Promise-to-pay & dispute tracking",
      "Weekly debtor summary reports",
    ],
  },
]

const comparisonFeatures = [
  { feature: "Tracked invoices", starter: "Up to 20", business: "Up to 100", partner: "Unlimited" },
  { feature: "Connected Stripe accounts", starter: "1", business: "Up to 3", partner: "Unlimited" },
  { feature: "Automated reminder sequence", starter: "✓", business: "✓", partner: "✓" },
  { feature: "Reminder templates", starter: "✓", business: "✓", partner: "✓" },
  { feature: "Custom email address (your domain)", starter: "—", business: "✓", partner: "✓" },
  { feature: "AI-assisted reminder wording", starter: "—", business: "✓", partner: "✓" },
  { feature: "Promise-to-pay tracking", starter: "—", business: "✓", partner: "✓" },
  { feature: "Dispute pause", starter: "—", business: "✓", partner: "✓" },
  { feature: "Weekly debtor summary email", starter: "—", business: "✓", partner: "✓" },
  { feature: "Multi-client management", starter: "—", business: "—", partner: "✓" },
  { feature: "Client visibility dashboard", starter: "—", business: "—", partner: "✓" },
  { feature: "Dedicated onboarding support", starter: "—", business: "—", partner: "✓" },
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
      </section>

      {/* Plan cards */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="grid lg:grid-cols-3 gap-6">
          {pricingPlans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl p-6 space-y-4 relative ${
                plan.featured
                  ? "border-2 border-blue-600 shadow-sm"
                  : "border border-gray-200"
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-3 py-0.5 rounded-full">
                  Most popular
                </div>
              )}
              <div>
                <p className="text-lg font-semibold text-gray-900">{plan.name}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{plan.price}</p>
                <p className="text-sm text-gray-500 mt-2">{plan.description}</p>
              </div>
              <ul className="space-y-2 text-sm text-gray-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="text-green-500">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <PricingCTA tier={plan.id} label={plan.cta} featured={plan.featured} />
            </div>
          ))}

          {/* Accountant Partner */}
          <div className="rounded-xl p-6 space-y-4 border border-gray-200">
            <div>
              <p className="text-lg font-semibold text-gray-900">Accountant Partner</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">Contact us</p>
              <p className="text-sm text-gray-500 mt-2">
                For bookkeepers and accountants managing invoice follow-ups across multiple clients.
              </p>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              {["Everything in Business", "Unlimited clients", "Multi-client debtor dashboard", "Client onboarding support", "Partner programme benefits"].map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-green-500">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/contact?type=partnership"
              className="block text-center text-sm py-2 rounded-md border border-blue-600 text-blue-600 hover:bg-blue-50"
            >
              Contact us
            </Link>
          </div>
        </div>
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
                <th className="text-center py-3 px-4 font-semibold text-gray-900">Starter</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-900">Business</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-900">Accountant Partner</th>
              </tr>
            </thead>
            <tbody>
              {comparisonFeatures.map((row) => (
                <tr key={row.feature} className="border-b border-gray-100">
                  <td className="py-3 pr-4 text-gray-700">{row.feature}</td>
                  <td className="text-center py-3 px-4 text-gray-500">{row.starter}</td>
                  <td className="text-center py-3 px-4 text-gray-500">{row.business}</td>
                  <td className="text-center py-3 px-4 text-gray-500">{row.partner}</td>
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
