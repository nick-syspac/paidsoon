import type { Metadata } from "next"
import { MarketingPageViewTracker } from "@/components/marketing/MarketingPageViewTracker"
import { formatIntegrationNameList, getIntegrationsByStatus } from "@/lib/integrationsCatalog"
import { PLAN_CATALOG } from "@/lib/subscriptionPlans"
import { lowestTierWithFeature } from "@/lib/planPresentation"

export const metadata: Metadata = {
  title: "Frequently Asked Questions — PaidSoon",
  description:
    "Answers to common questions about PaidSoon — how it works, pricing, integrations, and getting started.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "Frequently Asked Questions - PaidSoon",
    description:
      "Common questions about PaidSoon pricing, integrations, and invoice follow-up workflows.",
    url: "/faq",
    type: "website",
  },
}

const availableIntegrationNames = getIntegrationsByStatus("available").map((i) => i.name)
const plannedIntegrationNames = getIntegrationsByStatus("planned").map((i) => i.name)

const csvExportTier = lowestTierWithFeature("csv_export")
const csvExportTierName = csvExportTier ? PLAN_CATALOG[csvExportTier].name : "higher"

const faqs = [
  {
    q: "What does InvoiceGuard do?",
    a: "InvoiceGuard helps businesses follow up overdue invoices automatically. It monitors unpaid invoices, sends polite reminder emails, tracks promises to pay, pauses reminders for disputes and gives you a clear debtor dashboard.",
  },
  {
    q: "Do I need to connect Stripe, Xero, or MYOB to use PaidSoon?",
    a: `No. You can upload your outstanding invoices from a CSV spreadsheet and start sending reminders right away, on any plan including Starter. Connect Stripe, Xero, or MYOB later if you'd like invoices to sync automatically. You can still export your invoice data back to CSV or XLSX on ${csvExportTierName} plans and above.`,
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
    a: "You can record the promise-to-pay date. InvoiceGuard pauses reminders until that date passes, helping you avoid unnecessary follow-ups.",
  },
  {
    q: "What if an invoice is disputed?",
    a: "Mark the invoice as disputed and InvoiceGuard will pause the reminder sequence. You can resume reminders when the dispute is resolved.",
  },
  {
    q: "What is SpendLeak?",
    a: "SpendLeak surfaces recurring spend and cost drift that often slips past normal review. It highlights duplicate services, stale subscriptions and other patterns that may be draining cash without obvious warning signs.",
  },
  {
    q: "What is CommitGuard?",
    a: "CommitGuard tracks recurring commitments and upcoming obligations so you can see how much cash is already spoken for before it becomes a cash-flow problem.",
  },
  {
    q: "What does CashPlan do?",
    a: "CashPlan models near-term inflows and outflows so you can forecast pressure before it lands. It helps you plan around upcoming obligations, seasonality and decision points.",
  },
  {
    q: "What is RunwayGuard?",
    a: "RunwayGuard helps you understand how long your cash reserves can sustain the business under current and projected conditions, including key risk bands and scenario changes.",
  },
  {
    q: "What is Tax Buffer?",
    a: "Tax Buffer protects the cash set aside for tax obligations so your planning view does not overstate spendable cash or hide future liabilities.",
  },
  {
    q: "What modules work together in the platform?",
    a: "The platform is designed as a connected system: InvoiceGuard follows up receivables, SpendLeak highlights wasteful spend, CommitGuard tracks commitments, CashPlan forecasts cash movement, and RunwayGuard / Tax Buffer help you act before pressure escalates.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. PaidSoon offers a 14-day free trial with no credit card required, so you can try the platform before choosing a plan.",
  },
  {
    q: "Can I cancel at any time?",
    a: "Yes. PaidSoon has no lock-in contracts — you can cancel or downgrade your subscription at any time from your account settings.",
  },
  {
    q: "Is PaidSoon a debt collector?",
    a: "No. InvoiceGuard and the broader platform are workflow and cash-intelligence tools. They help you send professional follow-ups and monitor risk, but do not provide legal advice, debt collection services or credit reporting services.",
  },
]

export default function FaqPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  }

  return (
    <div className="min-h-screen bg-white">
      <MarketingPageViewTracker page="faq" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h1>
        <p className="mt-4 text-lg text-gray-500">
          Common questions about the PaidSoon platform — how the modules work, pricing, integrations and getting started.
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

