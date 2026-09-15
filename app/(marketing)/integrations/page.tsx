import type { Metadata } from "next"
import Link from "next/link"
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink"
import { MarketingPageViewTracker } from "@/components/marketing/MarketingPageViewTracker"
import { buildMarketingMetadata } from "@/lib/marketing/seo"
import {
  getIntegrations,
  INTEGRATION_STATUS_BADGE_STYLES,
  INTEGRATION_STATUS_LABEL,
} from "@/lib/integrationsCatalog"

export const metadata: Metadata = buildMarketingMetadata({
  title: "Accounting And Invoice Reminder Integrations | PaidSoon",
  description:
    "Connect Stripe, Xero, MYOB Business, or start with CSV import to run PaidSoon's invoice reminder and debtor follow-up workflows.",
  canonicalPath: "/integrations",
})

const integrations = getIntegrations()

export default function IntegrationsPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingPageViewTracker page="integrations" />
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
        <p className="mt-4 text-lg text-gray-500">
          PaidSoon connects to the tools you already use to manage your invoices.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-2 gap-6">
          {integrations.map((integration) => (
            <article key={integration.id} className="border border-gray-200 rounded-xl p-6">
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-semibold text-gray-900 text-lg">{integration.name}</h2>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${INTEGRATION_STATUS_BADGE_STYLES[integration.status]}`}
                >
                  {INTEGRATION_STATUS_LABEL[integration.status]}
                </span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">{integration.description}</p>
              {integration.href ? (
                <Link
                  href={integration.href}
                  className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline"
                >
                  Explore {integration.name}
                </Link>
              ) : null}
            </article>
          ))}
        </div>

        <div className="mt-12 text-center border border-blue-100 bg-blue-50 rounded-xl p-8">
          <h2 className="font-semibold text-gray-900 mb-2">Not ready to connect an accounting system?</h2>
          <p className="text-sm text-gray-600 mb-5">
            Upload your outstanding invoices from a CSV spreadsheet instead — no integration
            required, and it works on every plan including Starter. You can connect Stripe, Xero, or
            MYOB for automatic syncing whenever you&apos;re ready.
          </p>
        </div>

        <div className="mt-8 text-center border border-gray-200 rounded-xl p-8">
          <h2 className="font-semibold text-gray-900 mb-2">Don&apos;t see your accounting software?</h2>
          <p className="text-sm text-gray-500 mb-5">
            Let us know which integration would be most useful for you — we prioritise based on demand.
          </p>
          <MarketingCtaLink
            href="/contact"
            label="Request an integration"
            eventName="marketing_integration_request_clicked"
            className="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700"
          />
        </div>
      </section>
    </div>
  )
}
