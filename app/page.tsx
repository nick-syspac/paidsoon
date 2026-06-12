import Link from "next/link"

const pricingPlans = [
  {
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
] as const

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-gray-900">PaidSoon</span>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm text-gray-600 hover:text-gray-900">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700"
            >
              View plans
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 pt-24 pb-20 text-center">
        <h1 className="text-4xl font-bold text-gray-900 leading-tight">
          Stop chasing overdue invoices.<br />
          <span className="text-blue-600">Let software do it for you.</span>
        </h1>
        <p className="mt-6 text-lg text-gray-500 max-w-xl mx-auto">
          PaidSoon connects to your Stripe account and automatically sends
          a polite escalating sequence of follow-up emails when clients are late —
          so you never have to play bad cop again.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="bg-blue-600 text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Start with Starter
          </Link>
          <a
            href="#how-it-works"
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            How it works ↓
          </a>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-gray-50 py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
            Automatic, escalating follow-ups
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
            {[
              {
                day: "Day +3",
                title: "Friendly reminder",
                body: "A warm nudge in case your client simply forgot.",
              },
              {
                day: "Day +10",
                title: "Professional follow-up",
                body: "Politely firm — reminds them of any late fees or impact.",
              },
              {
                day: "Day +21",
                title: "Final notice",
                body: "Clear and direct. Sets a deadline before further action.",
              },
              {
                day: "Day +21",
                title: "Template tune-up*",
                body: "Pick from reminder templates to match tone for each client relationship.",
              },
              {
                day: "Day +21",
                title: "AI rewrite draft*",
                body: "Generate a polished follow-up draft while keeping your escalation sequence intact.",
              },
            ].map((step) => (
              <div key={`${step.day}-${step.title}`} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="text-xs font-medium text-blue-600 mb-1">{step.day}</div>
                <h3 className="font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500">{step.body}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-500 mt-5">
            * Available on higher plans.
          </p>
          <p className="text-center text-sm text-gray-400 mt-8">
            Sequence stops automatically when your invoice is marked paid.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
            Simple pricing
          </h2>
          <div className="grid lg:grid-cols-3 gap-6">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
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
                    ${plan.price}<span className="text-base font-normal text-gray-400">/mo</span>
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
                <Link
                  href="/sign-up"
                  className={`block text-center text-sm py-2 rounded-md ${
                    plan.featured
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
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
