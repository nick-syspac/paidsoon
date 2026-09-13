import type { Metadata } from "next"
import Link from "next/link"
import { isLiveMode } from "@/lib/liveMode"
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink"
import { MarketingPageViewTracker } from "@/components/marketing/MarketingPageViewTracker"
import {
  getMarketingModuleLabel,
  getJourneyCta,
  getModuleById,
  getIntegrationSupportCopy,
  getModulesByPlatformArea,
  PRACTICAL_CONTROL_GROUPS,
  PLATFORM_AREAS,
  PLATFORM_CYCLE,
  PLATFORM_TAGLINE,
} from "@/components/marketing/marketingContent"

export const metadata: Metadata = {
  title: "Platform Overview - PaidSoon Financial Control Platform",
  description:
    "See how PaidSoon, SpendLeak, CostGuard, CashPlan, CommitGuard, Owner's Digest, Tax Buffer, MarginGuard, and RunwayGuard work together to help Australian businesses control what happens next.",
  alternates: { canonical: "/platform" },
  openGraph: {
    title: "Platform Overview - PaidSoon",
    description:
      "One connected financial control platform for Australian small businesses.",
    url: "/platform",
    type: "website",
  },
}

export default function PlatformPage() {
  const liveMode = isLiveMode()
  const cta = getJourneyCta("after-modules", liveMode)
  const integrationSupportCopy = getIntegrationSupportCopy()

  return (
    <div className="min-h-screen bg-white">
      <MarketingPageViewTracker page="platform" />

      <section className="mx-auto max-w-5xl px-4 pt-16 pb-12 text-center">
        <h1 className="text-4xl font-bold text-gray-900">Financial control for small business</h1>
        <p className="mt-4 text-lg text-gray-600 max-w-3xl mx-auto">{PLATFORM_TAGLINE}</p>
      </section>

      <section className="bg-gray-50 py-10">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-2xl font-semibold text-gray-900 text-center">The control cycle</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {PLATFORM_CYCLE.map((item, index) => (
              <article key={item} className="rounded-xl border border-gray-200 bg-white p-5 text-center">
                <p className="text-xs uppercase tracking-wide text-gray-400">Step {index + 1}</p>
                <h3 className="mt-2 font-semibold text-gray-900">{item}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="text-2xl font-semibold text-gray-900 text-center">How PaidSoon works with Xero, MYOB, and CSV</h2>
        <p className="mt-3 text-center text-gray-600">Your accounting software records the past. PaidSoon helps decide what to do next.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900">Accounting software</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li>Records invoices and payments</li>
              <li>Reports historical results</li>
              <li>Stores expenses and transactions</li>
              <li>Shows available cash</li>
            </ul>
          </article>
          <article className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <h3 className="font-semibold text-blue-900">PaidSoon</h3>
            <ul className="mt-3 space-y-2 text-sm text-blue-900">
              <li>Tells you what needs attention</li>
              <li>Highlights emerging risks</li>
              <li>Helps control waste and commitments</li>
              <li>Helps plan what happens next</li>
            </ul>
          </article>
        </div>
        <p className="mt-4 text-center text-sm text-gray-500">{integrationSupportCopy}</p>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <h2 className="text-2xl font-semibold text-gray-900">Everything you need for practical financial control</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {PRACTICAL_CONTROL_GROUPS.map((group) => (
            <article key={group.id} className="rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900">{group.label}</h3>
              <p className="mt-2 text-sm text-gray-600">{group.question}</p>
              <p className="mt-3 text-sm text-gray-700">{group.benefit}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {group.moduleIds.map((moduleId) => {
                  const moduleDef = getModuleById(moduleId)

                  return (
                    <Link
                      key={moduleDef.id}
                      href={moduleDef.href}
                      className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    >
                      Explore {getMarketingModuleLabel(moduleDef)}
                    </Link>
                  )
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-semibold text-gray-900">A practical weekly workflow</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900">Monday: prioritise receivables and risks</h3>
            <p className="mt-2 text-sm text-gray-600">Review what needs attention in PaidSoon, SpendLeak, and CostGuard.</p>
          </article>
          <article className="rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900">Midweek: protect commitments and margins</h3>
            <p className="mt-2 text-sm text-gray-600">Use CommitGuard and MarginGuard signals to adjust spend and pricing decisions.</p>
          </article>
          <article className="rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900">End of week: plan cash ahead</h3>
            <p className="mt-2 text-sm text-gray-600">Validate CashPlan, Tax Buffer, and RunwayGuard before upcoming obligations.</p>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-2">
        <h2 className="text-2xl font-semibold text-gray-900">Who this is for</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900">Owner-operators and solo founders</h3>
            <p className="mt-2 text-sm text-gray-600">Get one operating rhythm for receivables, spending, and cash decisions without replacing your accounting system.</p>
          </article>
          <article className="rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900">Growing small-business teams</h3>
            <p className="mt-2 text-sm text-gray-600">Share visibility across commitments, margins, and runway so decisions happen earlier and with less firefighting.</p>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-6 lg:grid-cols-2">
          {PLATFORM_AREAS.map((area) => {
            const areaModules = getModulesByPlatformArea(area.id)
            const areaAnchorId = area.id === "plan-ahead" ? "plan-cash" : area.id

            return (
              <section key={area.id} id={areaAnchorId} className="rounded-2xl border border-gray-200 p-6">
                <p className="text-xs uppercase tracking-wide text-gray-400">{area.name}</p>
                <h2 className="mt-1 text-2xl font-semibold text-gray-900">{area.summary}</h2>
                <div className="mt-5 grid gap-4">
                  {areaModules.map((module) => (
                    <article key={module.id} className="rounded-xl border border-gray-200 p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">{getMarketingModuleLabel(module)}</h3>
                      </div>
                      <p className="mt-2 text-sm text-gray-600">{module.question}</p>
                      <p className="mt-3 text-gray-600">{module.summary}</p>
                      <Link href={module.href} className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:text-blue-800">
                        Explore {getMarketingModuleLabel(module)}
                      </Link>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </section>

      <section className="bg-blue-600 py-14">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white">Start with the financial problem that matters most</h2>
          <p className="mt-3 text-blue-100">Find the right starting point, then expand to the full control platform at your pace.</p>
          <MarketingCtaLink
            href={cta.href}
            label="Find the right starting point"
            eventName="marketing_platform_cta_selected"
            eventData={{ liveMode: String(liveMode) }}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-white px-6 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          />
        </div>
      </section>
    </div>
  )
}
