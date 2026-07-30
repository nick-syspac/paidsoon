import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Release Notes — PaidSoon",
  description:
    "PaidSoon release notes — product updates, improvements and fixes.",
}

const privateBetaScope = [
  "Stripe Connect account connection",
  "MYOB Business integration (early access)",
  "Invoice monitoring for unpaid and overdue invoices",
  "Automated reminder sequences",
  "Friendly, firm and final notice reminder templates",
  "Debtor dashboard",
  "Promise-to-pay tracking",
  "Dispute pause",
  "Weekly debtor summary email",
  "Basic account and subscription management",
]

const upcomingUpdates = [
  "Early access onboarding improvements",
  "Accountant partner workflow enhancements",
  "MYOB Business integration — full production validation",
  "Xero integration planning",
  "Help Centre articles",
  "Public API and webhook documentation",
]

export default function ReleaseNotesPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold text-gray-900">Release Notes</h1>
        <p className="mt-4 text-lg text-gray-500">
          Product updates, improvements and fixes for PaidSoon.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16 space-y-12">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-lg font-semibold text-gray-900">Private beta</h2>
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
              Current
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            PaidSoon is currently in private beta. Public release notes will be published as the
            product becomes available to more users.
          </p>

          <h3 className="text-sm font-semibold text-gray-700 mb-3">Initial private beta scope</h3>
          <ul className="space-y-2">
            {privateBetaScope.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-gray-600">
                <span className="text-green-500 mt-0.5">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-gray-100 pt-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming updates</h2>
          <ul className="space-y-2">
            {upcomingUpdates.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-gray-500">
                <span className="text-blue-400 mt-0.5">◦</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}

