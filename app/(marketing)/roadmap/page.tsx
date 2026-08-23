import type { Metadata } from "next"
import Link from "next/link"
import { getIntegrationsByStatus } from "@/lib/integrationsCatalog"
import { PLAN_CATALOG } from "@/lib/subscriptionPlans"
import { lowestTierWithFeature } from "@/lib/planPresentation"

export const metadata: Metadata = {
  title: "Product Roadmap — PaidSoon",
  description:
    "PaidSoon product roadmap — what is live today, what SpendLeak adds next, and what remains later-stage financial operations work.",
}

const csvExportTier = lowestTierWithFeature("csv_export")
const csvExportTierName = csvExportTier ? PLAN_CATALOG[csvExportTier].name : "higher"

const available = [
  ...getIntegrationsByStatus("available").map((integration) => `${integration.name} integration`),
  "CSV invoice import (all plans, no integration required)",
  `CSV/XLSX invoice export (${csvExportTierName} plans and above)`,
  "Unpaid and overdue invoice monitoring",
  "Automated reminder sequences",
  "Friendly, firm and final notice reminder templates",
  "Debtor dashboard",
  "Promise-to-pay tracking",
  "Dispute pause",
]

const phase1 = [
  "Promise to pay",
  "Disputes",
  "Weekly debtor summary email (after production scheduler cutover)",
  "Customer payment scoring",
]

const phase2 = [
  "Spendleak",
  "Cash forecasting",
  "AI owner digest",
  "Subscription detection",
]

const phase3 = [
  "Benchmark against similar businesses",
  "Predict insolvency risk",
  "Automatic payment plans",
  "AI cashflow coach",
]

const phase4 = [
  "Industry benchmarking",
  "Bank integrations",
  "Lending readiness score",
  "Working capital optimisation",
]

export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold text-gray-900">Product Roadmap</h1>
        <p className="mt-4 text-lg text-gray-500">
          PaidSoon is being built in stages, starting with reliable automated invoice follow-ups and
          expanding into a broader financial operations platform for small business.
        </p>
        <p className="mt-4 text-base text-gray-600">
          PaidSoon focuses on cash collection. SpendLeak is the planned spend-side companion: an AI
          financial operations layer on top of Xero and MYOB that highlights savings
          opportunities, upcoming renewals, duplicate spend, and cash-pressure risks.
        </p>
        <p className="mt-2 text-sm text-gray-400">
          This roadmap is indicative and may change based on customer feedback, integration approvals
          and product priorities.
        </p>
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-blue-900">
            Platform direction
          </h2>
          <p className="mt-2 text-sm text-blue-900">
            Xero and MYOB remain the accounting source of truth. SpendLeak is not a replacement
            accounting package. Its role is to explain what to do next using the data those systems
            already hold.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-12">
        <div className="space-y-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Available / Private beta</h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">
                Live
              </span>
            </div>
            <ul className="space-y-2">
              {available.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-gray-600">
                  <span className="text-green-500 mt-0.5">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-gray-100 pt-10">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Phase 1</h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
                Planned
              </span>
            </div>
            <ul className="space-y-2">
              {phase1.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-gray-600">
                  <span className="text-blue-400 mt-0.5">◦</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-gray-100 pt-10">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Phase 2</h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
                Planned
              </span>
            </div>
            <ul className="space-y-2">
              {phase2.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-gray-600">
                  <span className="text-blue-400 mt-0.5">◦</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-gray-100 pt-10">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Phase 3</h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">
                Future
              </span>
            </div>
            <ul className="space-y-2">
              {phase3.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-gray-500">
                  <span className="mt-0.5">◦</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-gray-100 pt-10">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Phase 4</h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">
                Future
              </span>
            </div>
            <ul className="space-y-2">
              {phase4.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-gray-500">
                  <span className="mt-0.5">◦</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 bg-gray-50 rounded-xl p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Suggest a feature</h3>
          <p className="text-sm text-gray-600 mb-4">
            We prioritise based on real customer demand. If there is a feature or integration that
            would make PaidSoon more useful for your business, let us know.
          </p>
          <Link
            href="/contact"
            className="inline-block text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Contact us →
          </Link>
        </div>
      </section>
    </div>
  )
}

