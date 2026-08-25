import type { Metadata } from "next"
import { PLAN_CATALOG } from "@/lib/subscriptionPlans"
import { lowestTierWithFeature } from "@/lib/planPresentation"

export const metadata: Metadata = {
  title: "Documentation — PaidSoon",
  description:
    "Technical and configuration documentation for PaidSoon — Stripe Connect, CSV invoice import and export, invoice sync, reminder workflow, and email sending.",
}

const csvExportTier = lowestTierWithFeature("csv_export")
const csvExportTierName = csvExportTier ? PLAN_CATALOG[csvExportTier].name : "higher"

const currentDocs = [
  {
    title: "Stripe Connect",
    body: "PaidSoon uses Stripe Connect to securely authorise access to invoice data. Users connect their own Stripe account through OAuth and can revoke access at any time.",
  },
  {
    title: "Invoice sync",
    body: "PaidSoon monitors invoice status, due dates, payment state and customer contact details needed to run reminder workflows.",
  },
  {
    title: "Reminder workflow",
    body: "Reminder workflows are configured by overdue stage. Each stage defines when a reminder should be sent and which template should be used.",
  },
  {
    title: "Email sending",
    body: "Reminder emails are sent according to the configured schedule. Paid plans may support custom sender details and domain-based sending where configured.",
  },
  {
    title: "Audit trail",
    body: "PaidSoon records key workflow events such as invoice syncs, reminder sends, promise-to-pay updates, dispute pauses and manual actions.",
  },
  {
    title: "MYOB Business integration",
    body: "Connect a MYOB Business company file to import overdue invoices and manage follow-ups from PaidSoon.",
  },
  {
    title: "Xero integration",
    body: "Connect Xero to sync overdue invoices automatically and trigger PaidSoon's reminder sequences.",
  },
  {
    title: "Spreadsheet import and export",
    body: `Don't want to connect an accounting system? Upload outstanding invoices from a CSV file on any plan, using a downloadable template with column mapping and validation. Export invoice data back to CSV or XLSX on ${csvExportTierName} plans and above.`,
  },
]

const futureDocs = [
  "QuickBooks Online integration",
  "Webhooks",
  "Public API",
  "Accountant partner setup",
  "Custom domain email configuration",
]

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold text-gray-900">Documentation</h1>
        <p className="mt-4 text-lg text-gray-500">
          Technical and configuration documentation for PaidSoon.
        </p>
        <p className="mt-2 text-sm text-gray-400">
          PaidSoon is currently in private beta. The public API and webhook documentation will
          expand as integrations are released.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-10">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Current documentation areas</h2>
        <div className="space-y-6">
          {currentDocs.map((doc) => (
            <div key={doc.title} className="border-b border-gray-100 pb-6">
              <h3 className="font-medium text-gray-900 mb-1">{doc.title}</h3>
              <p className="text-sm text-gray-500">{doc.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Future documentation</h2>
        <ul className="space-y-2">
          {futureDocs.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-gray-500">
              <span className="mt-0.5">◦</span>
              {item}
            </li>
          ))}
        </ul>

        <p className="mt-8 text-sm text-gray-500">
          For technical questions, contact{" "}
          <a href="mailto:support@paidsoon.com.au" className="text-blue-600 hover:underline">
            support@paidsoon.com.au
          </a>
          .
        </p>
      </section>
    </div>
  )
}

