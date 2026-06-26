import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Features — PaidSoon",
  description:
    "Explore all PaidSoon features: automated invoice reminders, configurable schedules, AI-assisted wording, promise-to-pay tracking, dispute handling, debtor dashboard, reports, accountant visibility, custom branding, and audit trail.",
}

const featureSections = [
  {
    title: "Automated Invoice Reminders",
    body: "PaidSoon monitors your connected Stripe account and automatically triggers a reminder email sequence when an invoice becomes overdue. No manual action required — reminders go out on schedule, every time.",
  },
  {
    title: "Configurable Reminder Schedules",
    body: "Set the timing of each reminder stage to match your business style. Choose how many days after the due date each reminder fires, and how many stages to include in the sequence.",
  },
  {
    title: "AI-Assisted Reminder Wording",
    body: "On Business plans, use AI to generate polished, professional reminder copy that matches your selected tone — friendly, firm, or final notice — while keeping your escalation sequence intact.",
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
    body: "Use your own email domain and sender name on Business and higher plans. Reminder emails come from your address, keeping the client relationship under your brand.",
  },
  {
    title: "Security and Audit Trail",
    body: "Every email sent, every invoice status change, and every manual action is logged with a timestamp. Full audit trail available for dispute resolution or business compliance review.",
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
