import type { Metadata } from "next"
import Link from "next/link"
import { MarketingPageViewTracker } from "@/components/marketing/MarketingPageViewTracker"
import {
  getMarketingModuleLabel,
  MODULES,
  PLATFORM_AREAS,
  PLATFORM_TAGLINE,
} from "@/components/marketing/marketingContent"

export const metadata: Metadata = {
  title: "Features — PaidSoon",
  description:
    "Explore the public PaidSoon module portfolio across receivables, commitments, tax, margin, runway, and owner-level summaries.",
}

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingPageViewTracker page="features" />
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Features across the full portfolio</h1>
        <p className="mt-4 text-lg text-gray-500">
          {PLATFORM_TAGLINE}
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="grid gap-6 lg:grid-cols-2">
          {PLATFORM_AREAS.map((area) => (
            <section key={area.id} className="rounded-2xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900">{area.name}</h2>
              <p className="mt-2 text-sm text-gray-600">{area.summary}</p>
              <div className="mt-5 grid gap-4">
                {MODULES.filter((module) => area.moduleIds.includes(module.id)).map((module) => (
                  <article key={module.id} className="rounded-xl border border-gray-100 p-5">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{getMarketingModuleLabel(module)}</h3>
                    </div>
                    <p className="mt-2 text-sm text-gray-500 leading-relaxed">{module.summary}</p>
                    <ul className="mt-3 space-y-1 text-sm text-gray-600">
                      {module.capabilities.slice(0, 3).map((capability) => (
                        <li key={capability}>{capability}</li>
                      ))}
                    </ul>
                    <Link href={module.href} className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline">
                      Explore {getMarketingModuleLabel(module)}
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="bg-blue-600 py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Ready to see the full platform?</h2>
          <Link
            href="/platform"
            className="inline-block bg-white text-blue-600 px-6 py-3 rounded-md text-sm font-semibold hover:bg-blue-50"
          >
            Explore the platform →
          </Link>
        </div>
      </section>
    </div>
  )
}
