import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Product Roadmap — PaidSoon",
  description:
    "PaidSoon product roadmap — what is available in private beta, what is planned next, and what is coming later.",
}

const available = [
  "Stripe Connect integration",
  "Unpaid and overdue invoice monitoring",
  "Automated reminder sequences",
  "Friendly, firm and final notice reminder templates",
  "Debtor dashboard",
  "Promise-to-pay tracking",
  "Dispute pause",
  "Weekly debtor summary email",
]

const plannedNext = [
  "MYOB Business integration",
  "Xero integration",
  "Improved accountant partner dashboard",
  "Client-level settings for bookkeepers and accountants",
  "More configurable reminder schedules",
  "Enhanced email deliverability controls",
  "CSV import for businesses not yet connected to an accounting platform",
]

const later = [
  "QuickBooks Online integration",
  "Advanced reporting",
  "Team member roles and permissions",
  "More automation rules",
  "API and webhook documentation",
]

export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold text-gray-900">Product Roadmap</h1>
        <p className="mt-4 text-lg text-gray-500">
          PaidSoon is being built in stages, starting with reliable automated invoice follow-ups and
          expanding into deeper accounting integrations and accountant workflows.
        </p>
        <p className="mt-2 text-sm text-gray-400">
          This roadmap is indicative and may change based on customer feedback, integration approvals
          and product priorities.
        </p>
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

