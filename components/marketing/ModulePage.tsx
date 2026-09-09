import type { Metadata } from "next"
import Link from "next/link"
import { isLiveMode } from "@/lib/liveMode"
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink"
import { MarketingPageViewTracker } from "@/components/marketing/MarketingPageViewTracker"
import {
  getCtaForLiveMode,
  getModuleById,
  getRelatedModules,
  type MarketingModuleId,
} from "@/components/marketing/marketingContent"

export function moduleMetadata(id: MarketingModuleId): Metadata {
  const moduleDef = getModuleById(id)
  const title = `${moduleDef.name} - ${moduleDef.question} | PaidSoon`

  return {
    title,
    description: `${moduleDef.summary} ${moduleDef.tagline}`,
    alternates: { canonical: moduleDef.href },
    openGraph: {
      title,
      description: `${moduleDef.summary} ${moduleDef.tagline}`,
      url: moduleDef.href,
      type: "website",
    },
  }
}

export function ModulePage({ id }: { id: MarketingModuleId }) {
  const moduleDef = getModuleById(id)
  const liveMode = isLiveMode()
  const cta = getCtaForLiveMode(liveMode)
  const related = getRelatedModules(id)

  return (
    <div className="min-h-screen bg-white">
      <MarketingPageViewTracker page={id} />

      <section className="mx-auto max-w-5xl px-4 pt-16 pb-12">
        <div className={`rounded-2xl border p-8 md:p-10 ${moduleDef.accentClass}`}>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs uppercase tracking-[0.16em] font-semibold">Module</p>
            <span className="rounded-full border border-current/20 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
              {moduleDef.statusLabel}
            </span>
          </div>
          <h1 className="mt-3 text-3xl md:text-4xl font-bold">{moduleDef.question}</h1>
          <p className="mt-4 text-base md:text-lg max-w-3xl">{moduleDef.tagline}</p>
          <p className="mt-4 text-sm md:text-base max-w-3xl">{moduleDef.summary}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <MarketingCtaLink
              href={cta.href}
              label={cta.label}
              eventName="marketing_module_cta_selected"
              eventData={{ module: moduleDef.id, liveMode: String(liveMode) }}
              className="inline-flex items-center justify-center rounded-md bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800"
            />
            <Link
              href="/platform"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              See full platform
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8 grid gap-6 md:grid-cols-2">
        <article className="rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900">The problem</h2>
          <p className="mt-3 text-gray-600">{moduleDef.problem}</p>
        </article>
        <article className="rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900">Key capabilities</h2>
          <ul className="mt-3 space-y-2 text-gray-600">
            {moduleDef.capabilities.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-blue-600">-</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="bg-gray-50 py-10">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-2xl font-semibold text-gray-900">How it works</h2>
          <ol className="mt-5 grid gap-4 md:grid-cols-2">
            {moduleDef.workflow.map((step, index) => (
              <li key={step} className="rounded-xl border border-gray-200 bg-white p-5">
                <p className="text-xs font-semibold tracking-wide uppercase text-gray-400">Step {index + 1}</p>
                <p className="mt-2 text-gray-700">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="text-2xl font-semibold text-gray-900">Business outcomes</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {moduleDef.outcomes.map((outcome) => (
            <article key={outcome} className="rounded-xl border border-gray-200 p-5">
              <p className="text-gray-700">{outcome}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-gray-50 py-10">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-2xl font-semibold text-gray-900">How it fits the platform</h2>
          <p className="mt-3 text-gray-600">
            {moduleDef.name} is one part of a connected financial control system: get paid, stop waste, control costs, and plan ahead.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="rounded-lg border border-gray-200 p-4 text-sm font-medium text-gray-600 hover:bg-white"
              >
                <span className="block text-gray-900">{item.name}</span>
                <span className="mt-1 block text-xs text-gray-500">{item.question}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="text-2xl font-semibold text-gray-900">FAQ</h2>
        <div className="mt-4 space-y-4">
          {moduleDef.faq.map((item) => (
            <article key={item.q} className="rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900">{item.q}</h3>
              <p className="mt-2 text-gray-600">{item.a}</p>
            </article>
          ))}
        </div>
        {moduleDef.disclaimer ? (
          <p className="mt-6 text-xs text-gray-500">{moduleDef.disclaimer}</p>
        ) : null}
      </section>

      <section className="bg-blue-600 py-14">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white">Ready to take control?</h2>
          <p className="mt-3 text-blue-100">{cta.helper}</p>
          <MarketingCtaLink
            href={cta.href}
            label={cta.label}
            eventName="marketing_module_bottom_cta_selected"
            eventData={{ module: moduleDef.id, liveMode: String(liveMode) }}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-white px-6 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          />
        </div>
      </section>
    </div>
  )
}
