import type { Metadata } from "next"
import Link from "next/link"
import { isDebugEnabled } from "@/lib/diagnostics/server"
import { isLiveMode } from "@/lib/liveMode"
import DebugDbCheckButton from "@/components/marketing/DebugDbCheckButton"
import { getPublicPlans, PLAN_CATALOG } from "@/lib/subscriptionPlans"
import { formatPlanPrice, lowestTierWithFeature } from "@/lib/planPresentation"
import {
  getIntegrations,
  INTEGRATION_STATUS_BADGE_STYLES,
  INTEGRATION_STATUS_LABEL,
} from "@/lib/integrationsCatalog"

export const metadata: Metadata = {
  title: "PaidSoon — Financial Control for Australian Businesses",
  description:
    "Xero and MYOB tell you what happened. PaidSoon tells you what needs attention today, what happens next, and what action to take to improve cashflow.",
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
    body: "Coming soon: weekly email summaries of your outstanding invoices once the production scheduler cutover is complete.",
  },
]

const pricingPreview = getPublicPlans().map((plan) => ({
  name: plan.name,
  price: formatPlanPrice(plan.monthlyPriceAud),
  featured: Boolean(plan.popular),
}))

const integrations = getIntegrations()

const customSenderNameTier = lowestTierWithFeature("custom_sender_name")
const customSenderNameTierName = customSenderNameTier
  ? PLAN_CATALOG[customSenderNameTier].name
  : "a paid"

const steps = [
  {
    n: "1",
    title: "Connect an invoice source — or upload a spreadsheet",
    body: "Connect Stripe, Xero, or MYOB via OAuth in one click, or skip integrations entirely and upload a CSV or XLSX file of your invoices.",
  },
  { n: "2", title: "Import unpaid invoices", body: "Connected accounts sync overdue invoices automatically; spreadsheet uploads import them in minutes." },
  { n: "3", title: "Configure your schedule", body: "Set reminder intervals that match your business style." },
  { n: "4", title: "Reminders go out automatically", body: "Polite, professional follow-ups without lifting a finger." },
]

export default function HomePage() {
  const liveMode = isLiveMode()
  const heroCtaLabel = liveMode ? "Start Free Trial" : "Request early access"
  const heroCtaHref = liveMode ? "/sign-up" : "/contact"

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 pt-24 pb-20 text-center">
        <h1 className="text-4xl font-bold text-gray-900 leading-tight">
          Accounting software records the past.<br />
          <span className="text-blue-600">PaidSoon helps you control the future.</span>
        </h1>
        <p className="mt-6 text-lg text-gray-500 max-w-xl mx-auto">
          PaidSoon turns your accounting and payment data into practical next actions so
          you can collect faster, control spending, and stay ahead of cashflow pressure.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href={heroCtaHref}
            className="bg-blue-600 text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            {heroCtaLabel}
          </Link>
          <Link href="/how-it-works" className="text-sm text-gray-500 hover:text-gray-900">
            How it works →
          </Link>
        </div>
        <p className="mt-4 text-sm text-gray-400">
          No accounting software required to start — import your invoices from a CSV or XLSX file today.
        </p>
        {isDebugEnabled() && <DebugDbCheckButton />}
      </section>

      {/* Purpose alignment */}
      <section className="py-16 border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center">
            Xero and MYOB tell you what happened.
            <span className="block text-blue-600 mt-1">PaidSoon tells you:</span>
          </h2>
          <ul className="mt-8 grid md:grid-cols-2 gap-4">
            {[
              "What needs attention today.",
              "What will happen next month.",
              "What action you should take.",
              "How to improve cashflow.",
              "Where you're losing money.",
              "Which customers are becoming risky.",
              "Whether you'll have enough cash for wages, tax, and suppliers.",
            ].map((item) => (
              <li key={item} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                {item}
              </li>
            ))}
          </ul>
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
            {integrations.map((integration) => (
              <div key={integration.id} className="bg-white rounded-lg border border-gray-200 p-5 text-center">
                <p className="font-semibold text-gray-900">{integration.name}</p>
                <span
                  className={`mt-2 inline-block text-xs px-2 py-0.5 rounded-full ${INTEGRATION_STATUS_BADGE_STYLES[integration.status]}`}
                >
                  {INTEGRATION_STATUS_LABEL[integration.status]}
                </span>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-6">
            Don&apos;t want to connect an accounting system yet? Upload a CSV or XLSX spreadsheet instead —
            works on every plan, no integration required.
          </p>
          <div className="text-center mt-6">
            <Link href="/integrations" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              View all integrations →
            </Link>
          </div>
        </div>
      </section>

      {/* Now / future */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-4">Now and next</h2>
          <p className="text-center text-gray-500 max-w-2xl mx-auto mb-10">
            PaidSoon is rolling out in phases, starting with stronger payment follow-up control and
            expanding into broader financial operations guidance.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
              <h3 className="text-base font-semibold text-blue-900 mb-3">Phase 1 focus</h3>
              <ul className="space-y-2 text-sm text-blue-900">
                {[
                  "Promise to pay",
                  "Disputes",
                  "Customer payment scoring",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span>•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-3">Future phases</h3>
              <p className="text-sm text-gray-600 mb-4">
                Spendleak, forecasting, AI owner guidance, insolvency and lending signals, bank
                integrations, and working capital optimisation.
              </p>
              <Link href="/roadmap" className="text-sm font-medium text-blue-600 hover:text-blue-800">
                View full Phase 1-4 roadmap →
              </Link>
            </div>
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
                q: "Do I need to connect Stripe, Xero, or MYOB to use PaidSoon?",
                a: "No. You can upload your outstanding invoices from a CSV or XLSX spreadsheet and start sending reminders right away, on any plan. Connect Stripe, Xero, or MYOB later if you'd like automatic syncing.",
              },
              {
                q: "Does PaidSoon send emails in my name?",
                a: `Yes, on ${customSenderNameTierName} plans and above you can set a custom sender name, and on Small Business plans and above you can send from your own verified domain. On the free trial and Starter plan, emails come from PaidSoon's domain with your name in the sender field.`,
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
