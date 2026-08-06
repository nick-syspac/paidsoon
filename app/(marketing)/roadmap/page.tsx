import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Product Roadmap — PaidSoon",
  description:
    "PaidSoon product roadmap — what is live today, what SpendLeak adds next, and what remains later-stage financial operations work.",
}

const available = [
  "Stripe Connect integration",
  "MYOB Business integration (early access)",
  "Unpaid and overdue invoice monitoring",
  "Automated reminder sequences",
  "Friendly, firm and final notice reminder templates",
  "Debtor dashboard",
  "Promise-to-pay tracking",
  "Dispute pause",
  "Weekly debtor summary email",
]

const plannedNext = [
  "MYOB Business integration — full production support (sandbox validation in progress)",
  "Xero integration",
  "Improved accountant partner dashboard",
  "Client-level settings for bookkeepers and accountants",
  "More configurable reminder schedules",
  "Enhanced email deliverability controls",
  "CSV import for businesses not yet connected to an accounting platform",
]

const spendLeakMvp = [
  "Recurring subscription and recurring payment detection",
  "Subscription price increase detection",
  "Duplicate invoice and duplicate payment detection",
  "Upcoming contract and renewal alerts",
  "Supplier spend dashboard with concentration and trend views",
  "AI savings recommendations with estimated annual impact",
  "Combined cash-flow view pairing PaidSoon receivables with SpendLeak payables",
]

const later = [
  "QuickBooks Online integration",
  "Advanced reporting",
  "Team member roles and permissions",
  "More automation rules",
  "API and webhook documentation",
]

const spendLeakLater = [
  "Identity-provider usage correlation for forgotten software subscriptions",
  "Anonymous expense benchmarking by business size or profile",
  "Deeper supplier-risk analysis and single-point-of-failure alerts",
  "Cloud-cost optimization recommendations for infrastructure-heavy businesses",
]

export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold text-gray-900">Product Roadmap</h1>
        <p className="mt-4 text-lg text-gray-500">
          PaidSoon is being built in stages, starting with reliable automated invoice follow-ups and
          expanding into a broader financial operations platform for small business.
        </p>
        <p className="mt-4 text-base text-gray-600">
          PaidSoon focuses on cash collection. SpendLeak is the planned spend-side companion: an AI
          financial operations layer on top of Xero and MYOB that highlights savings
          opportunities, upcoming renewals, duplicate spend, and cash-pressure risks.
        </p>
        <p className="mt-2 text-sm text-gray-400">
          This roadmap is indicative and may change based on customer feedback, integration approvals
          and product priorities.
        </p>
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-blue-900">
            Platform direction
          </h2>
          <p className="mt-2 text-sm text-blue-900">
            Xero and MYOB remain the accounting source of truth. SpendLeak is not a replacement
            accounting package. Its role is to explain what to do next using the data those systems
            already hold.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-12">
        <div className="space-y-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Available / Private beta</h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">
                Live
              </span>
            </div>
            <ul className="space-y-2">
              {available.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-gray-600">
                  <span className="text-green-500 mt-0.5">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-gray-100 pt-10">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Planned next</h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
                Planned
              </span>
            </div>
            <ul className="space-y-2">
              {plannedNext.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-gray-600">
                  <span className="text-blue-400 mt-0.5">◦</span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-8 rounded-2xl border border-blue-100 bg-white p-6">
              <h3 className="text-base font-semibold text-gray-900">SpendLeak MVP</h3>
              <p className="mt-2 text-sm text-gray-600">
                The first SpendLeak release is planned as a practical spend-efficiency layer that
                helps owners understand where cash is leaking and what to act on next.
              </p>
              <ul className="mt-4 space-y-2">
                {spendLeakMvp.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-blue-400 mt-0.5">◦</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-10">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Later</h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">
                Future
              </span>
            </div>
            <ul className="space-y-2">
              {later.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-gray-500">
                  <span className="mt-0.5">◦</span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6">
              <h3 className="text-base font-semibold text-gray-900">SpendLeak later-stage ideas</h3>
              <p className="mt-2 text-sm text-gray-600">
                These are intentionally later-stage items, not part of the initial SpendLeak MVP.
              </p>
              <ul className="mt-4 space-y-2">
                {spendLeakLater.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-gray-500">
                    <span className="mt-0.5">◦</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 bg-gray-50 rounded-xl p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Suggest a feature</h3>
          <p className="text-sm text-gray-600 mb-4">
            We prioritise based on real customer demand. If there is a feature or integration that
            would make PaidSoon more useful for your business, let us know.
          </p>
          <Link
            href="/contact"
            className="inline-block text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Contact us →
          </Link>
        </div>
      </section>
    </div>
  )
}

