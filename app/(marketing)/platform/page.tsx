import type { Metadata } from "next"
import Link from "next/link"
import { isLiveMode } from "@/lib/liveMode"
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink"
import { MarketingPageViewTracker } from "@/components/marketing/MarketingPageViewTracker"
import {
  getCtaForLiveMode,
  MODULES,
  MODULE_HREF,
  PLATFORM_CYCLE,
  PLATFORM_TAGLINE,
} from "@/components/marketing/marketingContent"

export const metadata: Metadata = {
  title: "Platform Overview - PaidSoon Financial Control Platform",
  description:
    "See how PaidSoon, SpendLeak, CostGuard, and CashPlan work together to help Australian businesses get paid, stop waste, control costs, and plan ahead.",
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
  const cta = getCtaForLiveMode(liveMode)

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

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-5 md:grid-cols-2">
          {MODULES.map((module) => (
            <article key={module.id} className="rounded-2xl border border-gray-200 p-6">
              <p className="text-xs uppercase tracking-wide text-gray-400">{module.name}</p>
              <h2 className="mt-1 text-xl font-semibold text-gray-900">{module.question}</h2>
              <p className="mt-3 text-gray-600">{module.summary}</p>
              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                {module.capabilities.slice(0, 3).map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-blue-600">-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href={MODULE_HREF[module.id]} className="mt-5 inline-block text-sm font-semibold text-blue-600 hover:text-blue-800">
                Explore {module.name}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="text-2xl font-semibold text-gray-900">Why alongside accounting software?</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900">Accounting systems</h3>
            <p className="mt-2 text-gray-600">Capture invoices, payments, and historical reporting.</p>
          </article>
          <article className="rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900">PaidSoon platform</h3>
            <p className="mt-2 text-gray-600">Turns that data into next actions so problems are visible sooner and decisions can be made earlier.</p>
          </article>
        </div>
      </section>

      <section className="bg-blue-600 py-14">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white">Control what happens next</h2>
          <p className="mt-3 text-blue-100">{cta.helper}</p>
          <MarketingCtaLink
            href={cta.href}
            label={cta.label}
            eventName="marketing_platform_cta_selected"
            eventData={{ liveMode: String(liveMode) }}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-white px-6 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          />
        </div>
      </section>
    </div>
  )
}
