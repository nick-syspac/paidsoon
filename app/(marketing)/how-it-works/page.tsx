import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "How It Works — PaidSoon",
  description:
    "See how PaidSoon automates invoice follow-ups: connect your accounting software or upload a CSV/XLSX spreadsheet, import invoices, configure reminders, and let PaidSoon do the rest.",
}

const steps = [
  {
    n: "1",
    title: "Connect an invoice source — or upload a spreadsheet",
    body: "Authorise PaidSoon to connect to Stripe, Xero, or MYOB via OAuth — no credentials to share, revocable at any time. Prefer not to connect anything yet? Upload a CSV or XLSX file of your outstanding invoices instead and get started immediately, on any plan.",
  },
  {
    n: "2",
    title: "Import your unpaid invoices",
    body: "If you connected an accounting source, PaidSoon syncs overdue and unpaid invoices automatically on each sync cycle. If you're using spreadsheet import, upload a new file any time to add or update invoices — no integration required.",
  },
  {
    n: "3",
    title: "Configure your reminder schedule and templates",
    body: "Choose when each reminder fires (e.g., 3 days, 10 days, 21 days overdue) and select or customise the reminder template for each stage — friendly, firm, or final notice.",
  },
  {
    n: "4",
    title: "PaidSoon sends reminders automatically",
    body: "On schedule, PaidSoon sends professional reminder emails on your behalf. Emails include invoice details, the amount due, and a call to action. You receive a copy for your records.",
  },
  {
    n: "5",
    title: "Promise-to-pay and disputes are tracked",
    body: "If a client promises to pay or raises a dispute, record it in PaidSoon. Reminders pause automatically when a commitment is in place, keeping the relationship professional.",
  },
  {
    n: "6",
    title: "Weekly debtor summary (coming soon)",
    body: "After production scheduler activation, PaidSoon will send a weekly summary of outstanding invoices and follow-up stages so you can monitor progress without manual checking.",
  },
]

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900">How PaidSoon works</h1>
        <p className="mt-4 text-lg text-gray-500">
          From connection to payment — the complete workflow, automated.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <ol className="space-y-10">
          {steps.map((step, i) => (
            <li key={step.n} className="flex gap-6">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
                {step.n}
              </div>
              <div className="pt-1">
                <h2 className="font-semibold text-gray-900 text-lg mb-1">{step.title}</h2>
                <p className="text-gray-500 text-sm leading-relaxed">{step.body}</p>
                {i < steps.length - 1 && (
                  <div className="mt-4 ml-[-2.75rem] pl-[2.75rem] border-l-2 border-dashed border-blue-100 h-4" />
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-blue-600 py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Start automating your follow-ups today</h2>
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
