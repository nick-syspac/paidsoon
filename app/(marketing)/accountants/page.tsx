import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "For Accountants & Bookkeepers — PaidSoon",
  description:
    "PaidSoon's Accountant Partner programme is designed for bookkeepers and accountants who want to offer automated invoice follow-up as a value-added service. Multi-client management is coming soon — register your interest today.",
}

export default function AccountantsPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900">For accountants and bookkeepers</h1>
        <p className="mt-4 text-lg text-gray-500">
          Offer automated invoice follow-ups as a value-added service for your clients.
          Improve cash flow. Reduce debtor days. No awkward conversations.
        </p>
      </section>

      {/* What works today, per client */}
      <section className="max-w-4xl mx-auto px-4 pb-4">
        <p className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wide mb-6">
          Available today, per client
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              title: "Automated follow-ups",
              body: "Connect a client's Stripe account and PaidSoon automatically chases their overdue invoices with a three-stage reminder sequence.",
            },
            {
              title: "Promise-to-pay tracking",
              body: "When a customer promises payment by a date, follow-ups pause automatically until that date passes.",
            },
            {
              title: "Dispute pause",
              body: "Flag an invoice as disputed and reminders stop immediately, so a client's customer relationships stay intact.",
            },
          ].map((card) => (
            <div key={card.title} className="border border-gray-100 rounded-lg p-6">
              <h2 className="font-semibold text-gray-900 mb-2">{card.title}</h2>
              <p className="text-sm text-gray-500 leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Multi-client management (planned) */}
      <section className="max-w-4xl mx-auto px-4 pt-8 pb-12">
        <p className="text-center text-sm font-semibold text-blue-600 uppercase tracking-wide mb-6">
          Coming soon
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              title: "Multi-client management (planned)",
              body: "Monitor and manage invoice follow-ups for every client from a single PaidSoon account, with each client's data kept isolated and private. Not yet available — register your interest below.",
            },
            {
              title: "Debtor visibility (planned)",
              body: "A single view across all your clients' overdue invoices, showing who owes what and what stage of follow-up they're at. Not yet available.",
            },
            {
              title: "Client onboarding workflow (planned)",
              body: "A streamlined flow for connecting new clients' Stripe accounts and configuring their reminder schedules. Not yet available.",
            },
          ].map((card) => (
            <div key={card.title} className="border border-dashed border-gray-200 rounded-lg p-6">
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
            PaidSoon&apos;s Accountant Partner plan is designed for bookkeepers and accountants who want to
            offer automated invoice follow-up as a value-added service for their clients. Benefits include:
          </p>
          <ul className="max-w-xl mx-auto space-y-3 text-sm text-gray-700">
            {[
              { text: "Dedicated onboarding and setup support", planned: false },
              {
                text: "Partner benefits for accountants and bookkeepers, including onboarding support, client rollout guidance and future referral options.",
                planned: false,
              },
              { text: "Priority support channel", planned: false },
              { text: "Unlimited clients under one account", planned: true },
              { text: "Multi-client debtor dashboard", planned: true },
            ].map((benefit) => (
              <li key={benefit.text} className="flex gap-2">
                <span className={benefit.planned ? "text-blue-500 font-bold" : "text-green-500 font-bold"}>
                  {benefit.planned ? "○" : "✓"}
                </span>
                <span>
                  {benefit.text}
                  {benefit.planned && <span className="text-gray-400"> (coming soon)</span>}
                </span>
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
