import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Integrations — PaidSoon",
  description:
    "PaidSoon integrates with Stripe Connect today, with MYOB, Xero, and QuickBooks coming soon. Connect your accounting software and automate invoice follow-ups.",
}

const integrations = [
  {
    name: "Stripe Connect",
    description:
      "Connect your Stripe account via OAuth. PaidSoon monitors your Stripe invoices and automatically sends follow-up reminders when they go overdue.",
    available: true,
    status: "Available",
  },
  {
    name: "MYOB",
    description:
      "MYOB AccountRight and Essentials integration — import invoices directly from MYOB and manage follow-ups from PaidSoon.",
    available: false,
    status: "Coming soon",
  },
  {
    name: "Xero",
    description:
      "Xero integration to sync overdue invoices automatically and trigger PaidSoon's reminder sequences.",
    available: false,
    status: "Coming soon",
  },
  {
    name: "QuickBooks",
    description:
      "QuickBooks Online integration for automated invoice monitoring and follow-up emails.",
    available: false,
    status: "Coming soon",
  },
]

export default function IntegrationsPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
        <p className="mt-4 text-lg text-gray-500">
          PaidSoon connects to the tools you already use to manage your invoices.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-2 gap-6">
          {integrations.map((integration) => (
            <div key={integration.name} className="border border-gray-200 rounded-xl p-6">
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-semibold text-gray-900 text-lg">{integration.name}</h2>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    integration.available
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {integration.status}
                </span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">{integration.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center border border-gray-200 rounded-xl p-8">
          <h2 className="font-semibold text-gray-900 mb-2">Don't see your accounting software?</h2>
          <p className="text-sm text-gray-500 mb-5">
            Let us know which integration would be most useful for you — we prioritise based on demand.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Request an integration →
          </Link>
        </div>
      </section>
    </div>
  )
}
