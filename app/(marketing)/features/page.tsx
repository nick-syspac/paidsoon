import type { Metadata } from "next"
import Link from "next/link"
import { PLAN_CATALOG } from "@/lib/subscriptionPlans"
import { lowestTierWithFeature } from "@/lib/planPresentation"

export const metadata: Metadata = {
  title: "Features — PaidSoon",
  description:
    "Explore all PaidSoon features: automated invoice reminders, configurable schedules, AI-assisted wording, promise-to-pay tracking, dispute handling, debtor dashboard, weekly summary reports, and custom branding.",
}

const aiRewriteTier = lowestTierWithFeature("ai_rewrite")
const aiRewriteTierName = aiRewriteTier ? PLAN_CATALOG[aiRewriteTier].name : "higher"

const customSenderNameTier = lowestTierWithFeature("custom_sender_name")
const customSenderNameTierName = customSenderNameTier ? PLAN_CATALOG[customSenderNameTier].name : "higher"

const verifiedDomainTier = lowestTierWithFeature("verified_from_domain")
const verifiedDomainTierName = verifiedDomainTier ? PLAN_CATALOG[verifiedDomainTier].name : "higher"

const csvExportTier = lowestTierWithFeature("csv_export")
const csvExportTierName = csvExportTier ? PLAN_CATALOG[csvExportTier].name : "higher"

const featureSections = [
  {
    title: "Automated Invoice Reminders",
    body: "PaidSoon monitors your invoices — whether connected via Stripe, Xero, or MYOB, or imported from a spreadsheet — and automatically triggers a reminder email sequence when one becomes overdue. No manual action required — reminders go out on schedule, every time.",
  },
  {
    title: "Spreadsheet Import & Export",
    body: `Not ready to connect Stripe, Xero, or MYOB? Upload your outstanding invoices from a CSV or XLSX file on any plan, including Starter — no integration required to get started. Export your invoice data back to CSV or XLSX on ${csvExportTierName} plans and above.`,
  },
  {
    title: "Configurable Reminder Schedules",
    body: "Set the timing of each reminder stage to match your business style. Choose how many days after the due date each reminder fires, and how many stages to include in the sequence.",
  },
  {
    title: "AI-Assisted Reminder Wording",
    body: `On ${aiRewriteTierName} plans and above, use AI to generate polished, professional reminder copy that matches your selected tone — friendly, firm, or final notice — while keeping your escalation sequence intact.`,
  },
  {
    title: "Promise-to-Pay Tracking",
    body: "When a client promises to pay by a specific date, record it in PaidSoon. The reminder sequence pauses automatically until the commitment date passes, keeping the relationship professional.",
  },
  {
    title: "Dispute Handling and Pause",
    body: "If a client raises a dispute, instantly pause the reminder sequence for that invoice without losing the follow-up history. Resume at any time once the dispute is resolved.",
  },
  {
    title: "Debtor Dashboard",
    body: "See every overdue invoice, client status, and follow-up history in one place. Filter, sort, and drill into individual invoices to understand the full picture of your receivables.",
  },
  {
    title: "Weekly Debtor Summary Reports",
    body: "Receive a weekly email digest of your outstanding invoices, who owes what, and which stage of follow-up each debtor is at. Stay informed without logging in every day.",
  },
  {
    title: "Accountant and Client Visibility",
    body: "On the Accountant Partner plan, manage invoice follow-ups for multiple clients from a single dashboard. Give each client their own isolated view while you maintain oversight of the full portfolio.",
  },
  {
    title: "Custom Branding",
    body: `Use your own sender name on ${customSenderNameTierName} plans and above, and send from your own verified email domain on ${verifiedDomainTierName} plans and above — keeping the client relationship under your brand.`,
  },
  {
    title: "Security and Event Logging",
    body: "PaidSoon records key events — invoice syncs, reminder sends, promise-to-pay updates, dispute pauses, and manual workflow actions — for our own diagnostics and support use.",
  },
]

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Everything you need to get paid</h1>
        <p className="mt-4 text-lg text-gray-500">
          PaidSoon automates the entire invoice follow-up process so you can focus on what matters.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-2 gap-6">
          {featureSections.map((feature) => (
            <div key={feature.title} className="border border-gray-100 rounded-lg p-6">
              <h2 className="font-semibold text-gray-900 mb-2">{feature.title}</h2>
              <p className="text-sm text-gray-500 leading-relaxed">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-blue-600 py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Ready to stop chasing?</h2>
          <Link
            href="/pricing"
            className="inline-block bg-white text-blue-600 px-6 py-3 rounded-md text-sm font-semibold hover:bg-blue-50"
          >
            View pricing →
          </Link>
        </div>
      </section>
    </div>
  )
}
