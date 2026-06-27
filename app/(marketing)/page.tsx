import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "PaidSoon — Automated Invoice Follow-Ups for Freelancers & Small Business",
  description:
    "PaidSoon connects to your Stripe account and automatically sends escalating reminder emails when clients are late paying invoices. Stop chasing. Start getting paid.",
}

const features = [
  {
    title: "Automated Invoice Reminders",
    body: "Escalating reminder sequences sent automatically when invoices go overdue.",
  },
  {
    title: "Reminder Templates",
    body: "Choose from friendly, firm, and final notice tones tailored to each relationship.",
  },
  {
    title: "Promise-to-Pay Tracking",
    body: "Record client commitments and pause reminders when a payment date is agreed.",
  },
  {
    title: "Dispute Pause",
    body: "Instantly pause the reminder sequence for invoices in dispute, without losing history.",
  },
  {
    title: "Debtor Dashboard",
    body: "See all overdue invoices, client statuses, and follow-up history in one place.",
  },
  {
    title: "Weekly Debtor Summary",
    body: "A weekly email summary of your outstanding invoices so you're never surprised.",
  },
]

const steps = [
  { n: "1", title: "Connect your Stripe account", body: "OAuth in one click — no credentials to share." },
  { n: "2", title: "Import unpaid invoices", body: "PaidSoon syncs overdue invoices automatically." },
  { n: "3", title: "Configure your schedule", body: "Set reminder intervals that match your business style." },
  { n: "4", title: "Reminders go out automatically", body: "Polite, professional follow-ups without lifting a finger." },
]

const pricingPreview = [
  { name: "Starter", price: "A$19/mo", featured: false },
  { name: "Business", price: "A$49/mo", featured: true },
  { name: "Accountant Partner", price: "Contact us", featured: false },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 pt-24 pb-20 text-center">
        <h1 className="text-4xl font-bold text-gray-900 leading-tight">
          Stop chasing overdue invoices.<br />
          <span className="text-blue-600">Let software do it for you.</span>
        </h1>
        <p className="mt-6 text-lg text-gray-500 max-w-xl mx-auto">
          PaidSoon connects to your Stripe account and automatically sends a polite,
          escalating sequence of follow-up emails when clients are late — so you never
          have to play bad cop again.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/contact"
            className="bg-blue-600 text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Request early access
          </Link>
          <Link href="/how-it-works" className="text-sm text-gray-500 hover:text-gray-900">
            How it works →
          </Link>
        </div>
      </section>

      {/* Problem */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-10">Chasing invoices is costing you more than money</h2>
          <div className="grid md:grid-cols-3 gap-6 text-left">
            {[
              {
                heading: "Hours wasted every week",
                body: "Writing follow-up emails, checking payment status, and remembering who owes what eats into billable time.",
              },
              {
                heading: "Inconsistent follow-ups",
                body: "Busy periods mean reminders slip through. Some clients learn they can ignore invoices without consequence.",
              },
              {
                heading: "Cash flow unpredictability",
                body: "Without systematic follow-up, late payments stretch out — making it hard to plan your own expenses.",
              },
            ].map((item) => (
              <div key={item.heading} className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-2">{item.heading}</h3>
                <p className="text-sm text-gray-500">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Automated follow-ups. Zero awkwardness.</h2>
          <p className="text-lg text-gray-500">
            PaidSoon monitors your unpaid invoices, sends escalating reminders on your behalf,
            and tracks promise-to-pay commitments and disputes — so you can focus on the work
            you actually want to do.
          </p>
        </div>
      </section>

      {/* How it works preview */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">How PaidSoon works</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step) => (
              <div key={step.n} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="text-2xl font-bold text-blue-600 mb-2">{step.n}</div>
                <h3 className="font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500">{step.body}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/how-it-works" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              See the full workflow →
            </Link>
          </div>
        </div>
      </section>

      {/* Feature highlights */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Everything you need to get paid</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="border border-gray-100 rounded-lg p-5">
                <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-500">{feature.body}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/features" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              See all features →
            </Link>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Connects to tools you already use</h2>
          <div className="grid md:grid-cols-4 gap-4">
            {[
              { name: "Stripe", status: "Available", available: true },
              { name: "MYOB", status: "Coming soon", available: false },
              { name: "Xero", status: "Coming soon", available: false },
              { name: "QuickBooks", status: "Coming soon", available: false },
            ].map((integration) => (
              <div key={integration.name} className="bg-white rounded-lg border border-gray-200 p-5 text-center">
                <p className="font-semibold text-gray-900">{integration.name}</p>
                <span
                  className={`mt-2 inline-block text-xs px-2 py-0.5 rounded-full ${
                    integration.available
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {integration.status}
                </span>
              </div>
            ))}
          </div>
          <div className="text-center mt-6">
            <Link href="/integrations" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              View all integrations →
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Simple, transparent pricing</h2>
          <p className="text-gray-500 mb-10">Start with a free trial. No credit card required.</p>
          <div className="grid md:grid-cols-3 gap-6">
            {pricingPreview.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-xl p-6 ${
                  plan.featured ? "border-2 border-blue-600 shadow-sm" : "border border-gray-200"
                }`}
              >
                <p className="font-semibold text-gray-900">{plan.name}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{plan.price}</p>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Link
              href="/pricing"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-blue-700"
            >
              View full pricing →
            </Link>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Built in Australia, for Australian businesses</h2>
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 text-sm text-gray-500">
            <span>🇦🇺 Australian owned and operated — Syspac Pty Ltd</span>
            <span>🔒 Secure invoice data handling</span>
            <span>🚫 No lock-in contracts</span>
          </div>
        </div>
      </section>

      {/* FAQ preview */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Common questions</h2>
          <div className="space-y-6">
            {[
              {
                q: "Does PaidSoon send emails in my name?",
                a: "Yes. On paid plans you can use your own email address and domain. On the free trial, emails come from PaidSoon's domain with your name in the sender field.",
              },
              {
                q: "What happens when an invoice is paid?",
                a: "PaidSoon detects the payment via Stripe and automatically stops the reminder sequence. No manual intervention needed.",
              },
              {
                q: "Can I pause reminders for a specific client?",
                a: "Yes. You can pause, snooze, or manually resolve any invoice at any time from your dashboard.",
              },
            ].map((faq) => (
              <div key={faq.q} className="border-b border-gray-100 pb-6">
                <h3 className="font-medium text-gray-900 mb-2">{faq.q}</h3>
                <p className="text-sm text-gray-500">{faq.a}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/faq" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              See all FAQs →
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-blue-600 py-20">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to get paid faster?</h2>
          <p className="text-blue-100 mb-8">
            Start your free trial today. No credit card required.
          </p>
          <Link
            href="/pricing"
            className="inline-block bg-white text-blue-600 px-8 py-3 rounded-md text-sm font-semibold hover:bg-blue-50"
          >
            Start Free Trial
          </Link>
        </div>
      </section>
    </div>
  )
}
