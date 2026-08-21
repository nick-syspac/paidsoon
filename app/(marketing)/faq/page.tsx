import type { Metadata } from "next"
import { formatIntegrationNameList, getIntegrationsByStatus } from "@/lib/integrationsCatalog"
import { PLAN_CATALOG } from "@/lib/subscriptionPlans"
import { lowestTierWithFeature } from "@/lib/planPresentation"

export const metadata: Metadata = {
  title: "Frequently Asked Questions — PaidSoon",
  description:
    "Answers to common questions about PaidSoon — how it works, pricing, integrations, and getting started.",
}

const availableIntegrationNames = getIntegrationsByStatus("available").map((i) => i.name)
const plannedIntegrationNames = getIntegrationsByStatus("planned").map((i) => i.name)

const csvExportTier = lowestTierWithFeature("csv_export")
const csvExportTierName = csvExportTier ? PLAN_CATALOG[csvExportTier].name : "higher"

const faqs = [
  {
    q: "What does PaidSoon do?",
    a: "PaidSoon helps businesses follow up overdue invoices automatically. It monitors unpaid invoices, sends polite reminder emails, tracks promises to pay, pauses reminders for disputes and gives you a clear debtor dashboard.",
  },
  {
    q: "Do I need to connect Stripe, Xero, or MYOB to use PaidSoon?",
    a: `No. You can upload your outstanding invoices from a CSV or XLSX spreadsheet and start sending reminders right away, on any plan including Starter. Connect Stripe, Xero, or MYOB later if you'd like invoices to sync automatically. You can also export your invoice data back to CSV or XLSX on ${csvExportTierName} plans and above.`,
  },
  {
    q: "What accounting software does PaidSoon support?",
    a: `PaidSoon currently supports Stripe Connect plus ${formatIntegrationNameList(availableIntegrationNames.filter((name) => name !== "Stripe Connect"))}. ${formatIntegrationNameList(plannedIntegrationNames)} integration is planned.`,
  },
  {
    q: "Does PaidSoon send emails in my name?",
    a: "Yes. Paid plans may support your own sender name and email domain. During private beta, some emails may be sent from a PaidSoon-managed domain while deliverability and domain settings are finalised.",
  },
  {
    q: "What happens when an invoice is paid?",
    a: "PaidSoon detects the payment through the connected account and automatically stops the reminder sequence.",
  },
  {
    q: "Can I pause reminders for a specific invoice?",
    a: "Yes. You can pause, snooze or manually resolve any invoice from your dashboard.",
  },
  {
    q: "What if a customer promises to pay?",
    a: "You can record the promise-to-pay date. PaidSoon pauses reminders until that date passes, helping you avoid unnecessary follow-ups.",
  },
  {
    q: "What if an invoice is disputed?",
    a: "Mark the invoice as disputed and PaidSoon will pause the reminder sequence. You can resume reminders when the dispute is resolved.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. PaidSoon offers a 14-day free trial with no credit card required, so you can try automated invoice follow-ups before choosing a plan.",
  },
  {
    q: "Can I cancel at any time?",
    a: "Yes. PaidSoon has no lock-in contracts — you can cancel or downgrade your subscription at any time from your account settings.",
  },
  {
    q: "Is PaidSoon a debt collector?",
    a: "No. PaidSoon is an invoice reminder and workflow automation tool. It helps you send professional follow-ups but does not provide legal advice, debt collection services or credit reporting services.",
  },
]

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h1>
        <p className="mt-4 text-lg text-gray-500">
          Common questions about PaidSoon — how it works, pricing, integrations and getting started.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <div className="space-y-6">
          {faqs.map((faq) => (
            <div key={faq.q} className="border-b border-gray-100 pb-6">
              <h2 className="font-semibold text-gray-900 mb-2">{faq.q}</h2>
              <p className="text-sm text-gray-500">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

