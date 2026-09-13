import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Release Notes — PaidSoon",
  description:
    "PaidSoon release notes — product updates, improvements and fixes.",
}

const currentBuildScope = [
  "InvoiceGuard — overdue invoice monitoring and automated debtor follow-up",
  "SpendLeak — recurring spend and waste detection",
  "CostGuard — category-level cost drift and margin monitoring",
  "CashPlan — near-term cash forecast and shortfall visibility",
  "CommitGuard — committed cash and renewal timing visibility",
  "Owner’s Digest — weekly owner-level financial briefing",
  "Tax Buffer — reserve protection for tax obligations",
  "MarginGuard — profitability and margin pressure monitoring",
  "RunwayGuard — cash runway and financial resilience visibility",
  "Stripe Connect and accounting integrations for supported data sources",
  "Account and subscription management for early-access users",
]

const recommendedRoadmap = [
  {
    title: "Phase 1: Turn insight into action",
    items: [
      "Action Centre",
      "Unified priority and financial-impact scoring",
      "Approve, dismiss and snooze workflows",
      "Owner’s Digest links directly to recommended actions",
      "Track whether recommendations delivered the expected outcome",
    ],
  },
  {
    title: "Phase 2: Improve owner decisions",
    items: [
      "Scenario Planner",
      "BillGuard",
      "RevenueGuard",
      "PricingGuard",
      "GoalTrack",
    ],
  },
  {
    title: "Phase 3: Build distribution and defensibility",
    items: [
      "Advisor Hub",
      "Multi-business portfolio reporting",
      "Industry benchmarking",
      "Finance Pack",
      "Read-only bank-data integration where accounting feeds are insufficient",
    ],
  },
]

export default function ReleaseNotesPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold text-gray-900">Release Notes</h1>
        <p className="mt-4 text-lg text-gray-500">
          Product updates, improvements and fixes for PaidSoon.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16 space-y-12">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-lg font-semibold text-gray-900">Built today</h2>
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
              Current
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            PaidSoon currently includes the core workflow for connecting invoice data, monitoring
            debtor risk, and automating follow-up actions.
          </p>

          <h3 className="text-sm font-semibold text-gray-700 mb-3">What&apos;s built</h3>
          <ul className="space-y-2">
            {currentBuildScope.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-gray-600">
                <span className="text-green-500 mt-0.5">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-gray-100 pt-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Recommended roadmap</h2>
          <div className="space-y-8">
            {recommendedRoadmap.map((phase) => (
              <div key={phase.title}>
                <h3 className="text-base font-semibold text-gray-900 mb-3">{phase.title}</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                  {phase.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

