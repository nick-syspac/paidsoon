import { PricingCTA } from "@/components/pricing/PricingCTA"

const pricingPlans = [
  {
    id: "starter" as const,
    name: "Starter",
    price: 9,
    cta: "Start with Starter",
    featured: false,
    description: "For solo operators who want essential chasing on autopilot.",
    features: [
      "10 chased invoices per month",
      "1 user",
      "1 connected Stripe account",
      "Basic email reminders",
      "PaidSoon branding",
    ],
  },
  {
    id: "solo" as const,
    name: "Solo",
    price: 19,
    cta: "Choose Solo",
    featured: true,
    description: "The core plan for consultants and freelancers who need more control.",
    features: [
      "30 chased invoices per month",
      "1 user",
      "1 connected Stripe account",
      "Reminder sequence + basic templates",
      "Use your own email address",
      "Basic payment status dashboard",
    ],
  },
  {
    id: "small_business" as const,
    name: "Small Business",
    price: 39,
    cta: "Choose Small Business",
    featured: false,
    description: "For growing teams that want more volume, more control, and AI help.",
    features: [
      "100 chased invoices per month",
      "Up to 3 users",
      "Up to 3 connected Stripe accounts",
      "Custom reminder templates",
      "Friendly, firm, and final notice tones",
      "Basic AI rewrite + overdue dashboard",
    ],
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="font-semibold text-gray-900">PaidSoon</a>
          <div className="flex items-center gap-4">
            <a href="/sign-in" className="text-sm text-gray-600 hover:text-gray-900">
              Sign in
            </a>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-12 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Simple, transparent pricing</h1>
        <p className="mt-4 text-lg text-gray-500">
          Start your 14-day free trial. No credit card required.
        </p>
      </section>

      {/* Plan cards */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
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
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  A${plan.price}<span className="text-base font-normal text-gray-400">/mo</span>
                </p>
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
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <p className="text-center text-xs text-gray-400">
          © {new Date().getFullYear()} PaidSoon. Built for freelancers who have better things to do.
        </p>
      </footer>
    </div>
  )
}
