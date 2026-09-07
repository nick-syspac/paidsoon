import type { Metadata } from "next"
import Link from "next/link"
import { isLiveMode } from "@/lib/liveMode"
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink"
import { MarketingPageViewTracker } from "@/components/marketing/MarketingPageViewTracker"
import { getPublicPlans, PLAN_CATALOG } from "@/lib/subscriptionPlans"
import { formatPlanPrice, lowestTierWithFeature } from "@/lib/planPresentation"
import {
  getIntegrations,
  INTEGRATION_STATUS_BADGE_STYLES,
  INTEGRATION_STATUS_LABEL,
} from "@/lib/integrationsCatalog"
import {
  getCtaForLiveMode,
  MODULE_HREF,
  MODULES,
  PLATFORM_CYCLE,
  PLATFORM_TAGLINE,
} from "@/components/marketing/marketingContent"

export const metadata: Metadata = {
  title: "PaidSoon - Financial Control for Australian Businesses",
  description:
    "Your accounting software tells you what happened. PaidSoon helps you control what happens next across receivables, waste, costs, and cash planning.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "PaidSoon - Financial Control for Australian Businesses",
    description:
      "Get paid, stop waste, control costs, and plan ahead with one connected financial control platform.",
    url: "/",
    type: "website",
  },
}

const pricingPreview = getPublicPlans().map((plan) => ({
  id: plan.id,
  name: plan.name,
  price: formatPlanPrice(plan.monthlyPriceAud),
  allowance: plan.limits.chasedInvoicesPerMonth,
  featured: Boolean(plan.popular),
}))

const integrations = getIntegrations()

const customSenderNameTier = lowestTierWithFeature("custom_sender_name")
const customSenderNameTierName = customSenderNameTier
  ? PLAN_CATALOG[customSenderNameTier].name
  : "a paid"

export default function HomePage() {
  const liveMode = isLiveMode()
  const cta = getCtaForLiveMode(liveMode)

  const faq = [
    {
      q: "Do I need to replace Xero or MYOB?",
      a: "No. PaidSoon sits alongside your accounting software and turns existing data into practical next actions.",
    },
    {
      q: "Can I start without integrations?",
      a: "Yes. CSV invoice import is available so you can start quickly and connect providers later.",
    },
    {
      q: "Does PaidSoon guarantee payment outcomes?",
      a: "No. It improves visibility, consistency, and early action, but does not guarantee payment or financial outcomes.",
    },
    {
      q: "Can emails be sent in my business name?",
      a: `Yes. Custom sender name starts on ${customSenderNameTierName} plans and above; verified custom from-address starts on Small Business plans and above.`,
    },
  ]

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  }

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "PaidSoon",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "9",
      highPrice: "99",
      priceCurrency: "AUD",
    },
  }

  return (
    <div className="min-h-screen bg-white">
      <MarketingPageViewTracker page="homepage" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />

      <section className="border-b border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-6xl px-4 py-3 text-center text-sm text-gray-700">
          New: Business Pro plan now available for growing teams that need higher follow-up capacity.
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-16 pb-14">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Financial control platform</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight text-gray-900 md:text-5xl">
              Your accounting software tells you what happened.
              <span className="block text-blue-700">PaidSoon helps you control what happens next.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-gray-600">{PLATFORM_TAGLINE}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <MarketingCtaLink
                href={cta.href}
                label={cta.label}
                eventName="marketing_hero_cta_selected"
                eventData={{ liveMode: String(liveMode) }}
                className="inline-flex items-center justify-center rounded-md bg-blue-700 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-800"
              />
              <MarketingCtaLink
                href="/platform"
                label="See platform overview"
                eventName="marketing_hero_secondary_cta_selected"
                className="inline-flex items-center justify-center rounded-md border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              />
            </div>
            <p className="mt-3 text-sm text-gray-500">{cta.helper}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-blue-50 to-slate-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900">Four-module control system</h2>
            <div className="mt-4 grid gap-3">
              {MODULES.map((item) => (
                <Link key={item.id} href={MODULE_HREF[item.id]} className="rounded-xl border border-white bg-white/80 p-4 hover:bg-white">
                  <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                  <p className="text-sm text-gray-600">{item.question}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-gray-100 py-12">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 md:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((item) => (
            <article key={item.id} className="rounded-xl border border-gray-200 p-5">
              <p className="text-xs uppercase tracking-wide text-gray-400">{item.name}</p>
              <h2 className="mt-2 text-lg font-semibold text-gray-900">{item.question}</h2>
              <p className="mt-2 text-sm text-gray-600">{item.summary}</p>
              <Link href={MODULE_HREF[item.id]} className="mt-3 inline-block text-sm font-semibold text-blue-700 hover:text-blue-900">
                Learn more
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-gray-50 py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-semibold text-gray-900">Accounting records. PaidSoon controls.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold text-gray-900">Your accounting software</h3>
              <ul className="mt-3 space-y-2 text-gray-600">
                <li>Records invoices and payments</li>
                <li>Shows historical reporting</li>
                <li>Tracks what already happened</li>
              </ul>
            </article>
            <article className="rounded-xl border border-blue-200 bg-blue-50 p-6">
              <h3 className="text-lg font-semibold text-blue-900">PaidSoon platform</h3>
              <ul className="mt-3 space-y-2 text-blue-900">
                <li>Shows what needs attention now</li>
                <li>Flags waste and cost drift early</li>
                <li>Models likely cash position ahead</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-semibold text-gray-900">Real business pressure, every week</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              "Late payments make payroll and BAS planning stressful.",
              "Recurring software and supplier costs rise quietly.",
              "Cash decisions happen too late when visibility is fragmented.",
            ].map((item) => (
              <article key={item} className="rounded-xl border border-gray-200 p-6">
                <p className="text-gray-700">{item}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-semibold text-gray-900">How the modules work together</h2>
          <p className="mt-3 text-center text-gray-600">One operating rhythm for day-to-day financial control.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {PLATFORM_CYCLE.map((step, index) => (
              <article key={step} className="rounded-xl border border-gray-200 bg-white p-5 text-center">
                <p className="text-xs uppercase tracking-wide text-gray-400">Step {index + 1}</p>
                <h3 className="mt-2 font-semibold text-gray-900">{step}</h3>
              </article>
            ))}
          </div>
          <div className="mt-6 text-center">
            <MarketingCtaLink
              href="/platform"
              label="Explore the full platform"
              eventName="marketing_platform_explore_selected"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-white"
            />
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-semibold text-gray-900">Module deep dives</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {MODULES.map((item) => (
              <article key={item.id} className="rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
                <p className="mt-1 text-gray-600">{item.tagline}</p>
                <ul className="mt-4 space-y-2 text-sm text-gray-600">
                  {item.capabilities.slice(0, 3).map((capability) => (
                    <li key={capability}>{capability}</li>
                  ))}
                </ul>
                <Link href={MODULE_HREF[item.id]} className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:text-blue-900">
                  Visit {item.name}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-semibold text-gray-900">Outcome-focused benefits</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[
              "Faster receivables follow-up with less manual chasing",
              "Clearer view of recurring spend and waste",
              "Earlier visibility of cost pressure",
              "More confidence in near-term cash decisions",
            ].map((benefit) => (
              <article key={benefit} className="rounded-xl border border-gray-200 bg-white p-5">
                <p className="text-gray-700">{benefit}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-semibold text-gray-900">Integrations</h2>
          <p className="mt-3 text-center text-gray-600">Connect what you already use, or start with CSV import.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {integrations.map((integration) => (
              <article key={integration.id} className="rounded-xl border border-gray-200 p-5 text-center">
                <h3 className="font-semibold text-gray-900">{integration.name}</h3>
                <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${INTEGRATION_STATUS_BADGE_STYLES[integration.status]}`}>
                  {INTEGRATION_STATUS_LABEL[integration.status]}
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-semibold text-gray-900">Trust and security</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="font-semibold text-gray-900">Tenant isolation</h3>
              <p className="mt-2 text-sm text-gray-600">Row-level security policies protect customer data boundaries.</p>
            </article>
            <article className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="font-semibold text-gray-900">Verified webhooks</h3>
              <p className="mt-2 text-sm text-gray-600">Stripe billing and connect webhooks require signature verification before processing.</p>
            </article>
            <article className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="font-semibold text-gray-900">Protected provider tokens</h3>
              <p className="mt-2 text-sm text-gray-600">Accounting OAuth tokens are encrypted at rest and handled server-side only.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-semibold text-gray-900">Pricing at a glance</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {pricingPreview.map((plan) => (
              <article key={plan.id} className={`rounded-xl p-6 ${plan.featured ? "border-2 border-blue-700" : "border border-gray-200"}`}>
                <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                <p className="mt-1 text-2xl font-bold text-gray-900">{plan.price}</p>
                <p className="mt-2 text-sm text-gray-600">
                  {plan.allowance === -1 ? "Unlimited chased invoices" : `${plan.allowance} chased invoices / period`}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-6 text-center">
            <MarketingCtaLink
              href="/pricing"
              label="Compare all plans"
              eventName="marketing_pricing_preview_selected"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            />
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-12">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-center text-2xl font-semibold text-gray-900">Frequently asked questions</h2>
          <div className="mt-6 space-y-4">
            {faq.map((item) => (
              <article key={item.q} className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="font-semibold text-gray-900">{item.q}</h3>
                <p className="mt-2 text-sm text-gray-600">{item.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-blue-700 py-14">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white">Get paid. Stop waste. Control costs. Plan ahead.</h2>
          <p className="mt-3 text-blue-100">Built for Australian small businesses that want practical financial control.</p>
          <MarketingCtaLink
            href={cta.href}
            label={cta.label}
            eventName="marketing_home_bottom_cta_selected"
            eventData={{ liveMode: String(liveMode) }}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-white px-6 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          />
        </div>
      </section>
    </div>
  )
}
