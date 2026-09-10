import type { Metadata } from "next"
import Link from "next/link"
import { PRIVATE_BETA_POSITIONING } from "@/components/marketing/marketingContent"

export const metadata: Metadata = {
  title: "How It Works — PaidSoon",
  description:
    "See how PaidSoon helps small businesses get paid, stop waste, protect margins, and plan cash using one practical operating cycle.",
}

const operatingCycle = [
  {
    n: "1",
    title: "Get paid — InvoiceGuard",
    modules: "InvoiceGuard",
    body: "Prioritise overdue invoices and automate respectful follow-ups so debtor action is consistent without manual chasing.",
  },
  {
    n: "2",
    title: "Stop waste",
    modules: "SpendLeak",
    body: "Surface recurring spend leakage and stale subscriptions before they quietly drain operating cash.",
  },
  {
    n: "3",
    title: "Protect margins",
    modules: "CostGuard + MarginGuard + CommitGuard",
    body: "Track cost drift, commitment pressure, and profitability deterioration early enough to adjust pricing, spend, and renewal decisions.",
  },
  {
    n: "4",
    title: "Plan ahead",
    modules: "CashPlan + Tax Buffer + RunwayGuard + Owner's Digest",
    body: "Model upcoming cash pressure, protect tax reserves, monitor runway, and review one owner-level digest so next-week decisions are proactive.",
  },
]

const workflow = [
  {
    title: "Connect Xero, MYOB, Stripe, or start with CSV",
    body: "PaidSoon works alongside your accounting system. You can begin with spreadsheet import and connect providers later.",
  },
  {
    title: "See what needs attention this week",
    body: "The platform surfaces receivables, spend, commitments, margin, tax, and runway signals in one operating rhythm.",
  },
  {
    title: "Take action module by module",
    body: "Move from invoice follow-up to waste reduction, cost control, and cash planning without switching tools or rebuilding context.",
  },
]

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900">How PaidSoon works</h1>
        <p className="mt-4 text-lg text-gray-500">
          One practical cycle for getting paid, stopping waste, protecting margins, and planning cash.
        </p>
        <p className="mt-3 text-sm text-gray-500">{PRIVATE_BETA_POSITIONING}</p>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <ol className="space-y-10">
          {operatingCycle.map((step, i) => (
            <li key={step.n} className="flex gap-6">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
                {step.n}
              </div>
              <div className="pt-1">
                <h2 className="font-semibold text-gray-900 text-lg mb-1">{step.title}</h2>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{step.modules}</p>
                <p className="text-gray-500 text-sm leading-relaxed">{step.body}</p>
                {i < operatingCycle.length - 1 && (
                  <div className="mt-4 ml-[-2.75rem] pl-[2.75rem] border-l-2 border-dashed border-blue-100 h-4" />
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="max-w-4xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center">What this looks like week to week</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {workflow.map((item) => (
            <article key={item.title} className="rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900">{item.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-blue-600 py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Start with the financial problem that matters most.</h2>
          <Link
            href="/contact?type=early-access"
            className="inline-block bg-white text-blue-600 px-6 py-3 rounded-md text-sm font-semibold hover:bg-blue-50"
          >
            Request early access
          </Link>
        </div>
      </section>
    </div>
  )
}
