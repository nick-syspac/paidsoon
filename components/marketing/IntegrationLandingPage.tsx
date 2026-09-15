import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { MarketingBreadcrumbs } from "@/components/marketing/MarketingBreadcrumbs"
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink"
import { MarketingPageViewTracker } from "@/components/marketing/MarketingPageViewTracker"
import { buildMarketingMetadata } from "@/lib/marketing/seo"
import {
  getIntegrationBySlug,
  getIntegrationLandingPages,
  type IntegrationDefinition,
} from "@/lib/integrationsCatalog"
import { isLiveMode } from "@/lib/liveMode"

export function integrationMetadata(integration: IntegrationDefinition): Metadata {
  if (!integration.href) {
    return buildMarketingMetadata({
      title: integration.seoTitle,
      description: integration.seoDescription,
      canonicalPath: "/integrations",
    })
  }

  return buildMarketingMetadata({
    title: integration.seoTitle,
    description: integration.seoDescription,
    canonicalPath: integration.href,
    imagePath: integration.socialImagePath,
  })
}

export function getIntegrationPage(slug: string): IntegrationDefinition {
  const integration = getIntegrationBySlug(slug)
  if (!integration || !integration.href) {
    notFound()
  }
  return integration
}

export function getIntegrationStaticParams(): Array<{ integrationId: string }> {
  return getIntegrationLandingPages().map((integration) => ({
    integrationId: integration.id,
  }))
}

export function IntegrationLandingPage({
  integration,
}: {
  integration: IntegrationDefinition
}) {
  const liveMode = isLiveMode()
  const ctaHref = liveMode ? "/sign-up" : "/contact?type=early-access"
  const ctaLabel = liveMode ? "Start free trial" : "Request early access"

  return (
    <div className="min-h-screen bg-white">
      <MarketingPageViewTracker page={`integration-${integration.id}`} />

      <section className="mx-auto max-w-5xl px-4 pt-16 pb-12">
        <MarketingBreadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Integrations", href: "/integrations" },
            { label: integration.name, href: integration.href ?? "/integrations" },
          ]}
        />
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-blue-50 to-slate-100 p-8 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
            {integration.categoryLabel}
          </p>
          <h1 className="mt-4 text-3xl font-bold text-gray-900 md:text-4xl">
            {integration.headline}
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-600">{integration.summary}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <MarketingCtaLink
              href={ctaHref}
              label={ctaLabel}
              eventName="marketing_integration_landing_cta_selected"
              eventData={{ integration: integration.id, liveMode: String(liveMode) }}
              className="inline-flex items-center justify-center rounded-md bg-blue-700 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-800"
            />
            <Link
              href="/integrations"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Back to integrations
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-4 py-4 md:grid-cols-2">
        <article className="rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900">How setup works</h2>
          <ol className="mt-4 space-y-3 text-sm text-gray-600">
            {integration.setupSteps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </article>
        <article className="rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900">Source of record</h2>
          <p className="mt-4 text-sm leading-7 text-gray-600">{integration.sourceOfRecord}</p>
          <h3 className="mt-6 text-base font-semibold text-gray-900">Why PaidSoon on top</h3>
          <ul className="mt-3 space-y-2 text-sm text-gray-600">
            {integration.differentiators.map((item) => (
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
          <h2 className="text-2xl font-semibold text-gray-900">Supported workflows</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {integration.supportedWorkflows.map((workflow) => (
              <article key={workflow} className="rounded-xl border border-gray-200 bg-white p-5">
                <p className="text-gray-700">{workflow}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-2xl border border-gray-200 p-6">
          <h2 className="text-2xl font-semibold text-gray-900">How it compares with native provider reminders</h2>
          <p className="mt-4 text-sm leading-7 text-gray-600">{integration.nativeComparison}</p>
        </div>
      </section>
    </div>
  )
}