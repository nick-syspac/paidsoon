import type { Metadata } from "next"
import { PlaceholderPage } from "@/components/marketing/PlaceholderPage"

export const metadata: Metadata = {
  title: "Frequently Asked Questions — PaidSoon",
  description:
    "Answers to common questions about PaidSoon — how it works, pricing, integrations, and getting started.",
}

const faqs = [
  { q: "What accounting software does PaidSoon support?", a: "Currently Stripe Connect. MYOB, Xero, and QuickBooks integrations are coming soon." },
  { q: "Does PaidSoon send emails in my name?", a: "Yes. On paid plans you can use your own email address and domain. On the free trial, emails come from PaidSoon's domain with your name in the sender field." },
  { q: "What happens when an invoice is paid?", a: "PaidSoon detects the payment via your connected account and automatically stops the reminder sequence. No manual action required." },
  { q: "Can I pause reminders for a specific invoice?", a: "Yes. You can pause, snooze, or manually resolve any invoice at any time from your dashboard." },
  { q: "Is there a free trial?", a: "Yes. You can start with a free trial — no credit card required." },
  { q: "Can I cancel at any time?", a: "Yes. No lock-in contracts. Cancel your subscription at any time from your account settings." },
]

export default function FaqPage() {
  return (
    <PlaceholderPage
      title="Frequently Asked Questions"
      description="Common questions about PaidSoon — how it works, pricing, integrations, and getting started."
    >
      <div className="space-y-6">
        {faqs.map((faq) => (
          <div key={faq.q} className="border-b border-gray-100 pb-6">
            <h2 className="font-semibold text-gray-900 mb-2">{faq.q}</h2>
            <p className="text-sm text-gray-500">{faq.a}</p>
          </div>
        ))}
      </div>
    </PlaceholderPage>
  )
}
