import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Help Centre — PaidSoon",
  description:
    "Guides and support resources for setting up and using PaidSoon — connect your account, configure reminders, and manage your debtor dashboard.",
}

const gettingStarted = [
  {
    title: "Connect your account",
    body: "Connect your Stripe account using Stripe Connect. PaidSoon uses the authorised connection to monitor invoice status and detect when invoices become overdue or paid.",
  },
  {
    title: "Configure your reminder schedule",
    body: "Choose when reminders should be sent after an invoice becomes overdue. For example, you may send a friendly reminder after 3 days, a firmer reminder after 10 days, and a final notice after 21 days.",
  },
  {
    title: "Review your reminder templates",
    body: "Select the tone for each reminder stage. PaidSoon includes friendly, firm and final notice templates that can be adjusted to match your business style.",
  },
  {
    title: "Monitor your debtor dashboard",
    body: "Use the dashboard to see overdue invoices, current follow-up stage, promise-to-pay dates, dispute status and payment history.",
  },
]

const commonTasks = [
  "Pause reminders for an invoice in dispute",
  "Record a promise-to-pay date",
  "Resume reminders after a dispute is resolved",
  "Manually mark an invoice as resolved",
  "Review weekly debtor summary emails",
  "Update your billing plan",
]

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold text-gray-900">Help Centre</h1>
        <p className="mt-4 text-lg text-gray-500">
          Guides and support resources for setting up and using PaidSoon.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-10">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Getting started</h2>
        <div className="space-y-6">
          {gettingStarted.map((step) => (
            <div key={step.title} className="border-l-2 border-blue-100 pl-4">
              <h3 className="font-medium text-gray-900 mb-1">{step.title}</h3>
              <p className="text-sm text-gray-500">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-10">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Common tasks</h2>
        <ul className="space-y-2">
          {commonTasks.map((task) => (
            <li key={task} className="flex gap-2 text-sm text-gray-600">
              <span className="text-gray-400 mt-0.5">→</span>
              {task}
            </li>
          ))}
        </ul>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <div className="bg-gray-50 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-2">Need help?</h2>
          <p className="text-sm text-gray-600">
            Contact{" "}
            <a href="mailto:support@paidsoon.com.au" className="text-blue-600 hover:underline">
              support@paidsoon.com.au
            </a>{" "}
            and include your business name, the email address on your account, and a short
            description of the issue.
          </p>
        </div>
      </section>
    </div>
  )
}

