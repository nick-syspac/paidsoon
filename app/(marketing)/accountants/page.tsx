import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "For Accountants & Bookkeepers — PaidSoon",
  description:
    "PaidSoon's Accountant Partner programme helps bookkeepers and accountants manage invoice follow-ups for all their clients from one dashboard — improving cash flow across the board.",
}

export default function AccountantsPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900">For accountants and bookkeepers</h1>
        <p className="mt-4 text-lg text-gray-500">
          Manage invoice follow-ups across all your clients from a single dashboard.
          Improve cash flow. Reduce debtor days. No awkward conversations.
        </p>
      </section>

      {/* Multi-client management */}
      <section className="max-w-4xl mx-auto px-4 pb-12">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              title: "Multi-client management",
              body: "Monitor and manage invoice follow-ups for every client from a single PaidSoon account. Each client's data is kept isolated and private.",
            },
            {
              title: "Debtor visibility",
              body: "See the full overdue invoice picture for each client. Know who owes what, which stage of follow-up they're at, and when the next reminder fires.",
            },
            {
              title: "Client onboarding workflow",
              body: "Onboard new clients quickly with a streamlined connection flow. Link their Stripe account, configure their reminder schedule, and activate — in minutes.",
            },
          ].map((card) => (
            <div key={card.title} className="border border-gray-100 rounded-lg p-6">
              <h2 className="font-semibold text-gray-900 mb-2">{card.title}</h2>
              <p className="text-sm text-gray-500 leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Partner programme */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-6">
            Accountant Partner Programme
          </h2>
          <p className="text-center text-gray-500 mb-8">
            PaidSoon's Accountant Partner plan is designed for bookkeepers and accountants who want to
            offer automated invoice follow-up as a value-added service for their clients. Benefits include:
          </p>
          <ul className="max-w-xl mx-auto space-y-3 text-sm text-gray-700">
            {[
              "Unlimited clients under one account",
              "Multi-client debtor dashboard",
              "Dedicated onboarding and setup support",
              "Partner benefits and referral programme (details TBA)",
              "Priority support channel",
            ].map((benefit) => (
              <li key={benefit} className="flex gap-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
          <div className="text-center mt-10">
            <Link
              href="/contact?type=Accountant Partnership"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-md text-sm font-semibold hover:bg-blue-700"
            >
              Enquire about a partnership
            </Link>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to get started?</h2>
          <p className="text-gray-500 mb-6">
            Contact us to learn more about the Accountant Partner plan and how PaidSoon can improve
            cash flow for your clients.
          </p>
          <Link
            href="/contact?type=Accountant Partnership"
            className="inline-block border border-blue-600 text-blue-600 px-6 py-3 rounded-md text-sm font-semibold hover:bg-blue-50"
          >
            Contact us →
          </Link>
        </div>
      </section>
    </div>
  )
}
