import type { Metadata } from "next"
import Link from "next/link"
import { isLiveMode } from "@/lib/liveMode"
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink"
import { MarketingPageViewTracker } from "@/components/marketing/MarketingPageViewTracker"
import { buildMarketingMetadata } from "@/lib/marketing/seo"
import { getPublicPlans } from "@/lib/subscriptionPlans"
import { formatPlanPrice } from "@/lib/planPresentation"
import {
  getIntegrations,
  getIntegrationsByStatus,
  INTEGRATION_STATUS_BADGE_STYLES,
  INTEGRATION_STATUS_LABEL,
} from "@/lib/integrationsCatalog"
import {
  getCanonicalModuleHref,
  getMarketingModuleLabel,
  getJourneyCta,
  MODULES,
} from "@/components/marketing/marketingContent"

export const metadata: Metadata = buildMarketingMetadata({
  title: "Financial Control Software for Australian Small Businesses",
  description:
    "Control costs, review recurring spend, follow up overdue invoices and plan cash flow with PaidSoon, financial control software for Australian small businesses.",
  canonicalPath: "/",
  imagePath: "/social/home-og.svg",
})

const integrations = getIntegrations()
const availableIntegrations = getIntegrationsByStatus("available").map((item) => item.name)
const plannedIntegrations = getIntegrationsByStatus("planned").map((item) => item.name)
const publicPlans = getPublicPlans().map((plan) => ({
  id: plan.id,
  name: plan.name,
  price: formatPlanPrice(plan.monthlyPriceAud),
  allowance: plan.limits.chasedInvoicesPerMonth,
  featured: Boolean(plan.popular),
}))

const outcomeGroups = [
  {
    title: "Control costs",
    description: "Review category-level cost movement, known commitments and margin pressure.",
    modules: ["costguard", "commitguard", "margin-guard"] as const,
  },
  {
    title: "Stop waste",
    description: "Review recurring spend and potential waste before it becomes accepted overhead.",
    modules: ["spendleak"] as const,
  },
  {
    title: "Get paid",
    description: "Keep overdue invoice follow-ups moving and track deposit requests.",
    modules: ["paidsoon", "deposit-guard"] as const,
  },
  {
    title: "Plan ahead",
    description: "Review expected cash movement, tax reserves and runway for upcoming decisions.",
    modules: ["cashplan", "tax-buffer", "runway-guard"] as const,
  },
]

export default function HomePage() {
  const liveMode = isLiveMode()
  const primaryCta = getJourneyCta("hero", liveMode)
  const walkthroughCta = { label: "See how it works", href: "/how-it-works" }
  const faq = [
    {
      q: "What is FinOps for a small business?",
      a: "FinOps brings spending, payments and cash-flow information together so business owners can see what needs attention and make better-informed financial decisions.",
    },
    {
      q: "How does PaidSoon help with financial control?",
      a: "PaidSoon brings together tools for invoice follow-up, recurring-spend review, cost and commitment monitoring, and cash-planning information. Available modules depend on your plan and access.",
    },
    {
      q: "How does PaidSoon work with accounting software?",
      a: `PaidSoon works alongside supported providers rather than replacing them. ${availableIntegrations.join(", ")} are currently listed as available. ${plannedIntegrations.length ? `${plannedIntegrations.join(", ")} ${plannedIntegrations.length === 1 ? "is" : "are"} planned.` : "See the integrations page for current connection details."}`,
    },
    {
      q: "Does PaidSoon include invoice follow-ups?",
      a: "Yes. InvoiceGuard is PaidSoon’s invoice follow-up capability. Plan-specific features and invoice limits are shown on the pricing page.",
    },
    {
      q: "What is involved in getting started?",
      a: liveMode
        ? "Create an account, choose a plan, and connect a supported provider or use an available import option for your workflow. The trial is 14 days and does not require a credit card."
        : "Request early access and the PaidSoon team will explain the next steps and available setup options.",
    },
  ]

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  }

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "PaidSoon",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    areaServed: "AU",
    offers: getPublicPlans()
      .filter((plan) => plan.monthlyPriceAud !== null)
      .map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        price: String(plan.monthlyPriceAud),
        priceCurrency: "AUD",
      })),
  }

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "PaidSoon",
    url: "https://www.paidsoon.com.au",
    logo: "/paidsoon-logo.png",
    sameAs: ["https://www.linkedin.com/company/syspac"],
    areaServed: "AU",
  }

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "PaidSoon",
    url: "https://www.paidsoon.com.au",
  }

  return (
    <div className="min-h-screen bg-white">
      <MarketingPageViewTracker page="homepage" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
              Financial control software for Australian small businesses
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-gray-900 md:text-5xl">
              Control spending. Protect cash flow. Make better financial decisions.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-gray-600">
              PaidSoon helps Australian businesses control spending, protect cash flow and make better financial decisions. Invoice follow-ups are one part of that broader platform. It brings spending, payments and cash-flow information together so you can see what needs attention and decide what to do next.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <MarketingCtaLink
                href={primaryCta.href}
                label={primaryCta.label}
                eventName="marketing_hero_cta_selected"
                eventData={{ liveMode: String(liveMode) }}
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-blue-700 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              />
              <Link
                href={walkthroughCta.href}
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {walkthroughCta.label}
              </Link>
            </div>
            <p className="mt-3 text-sm text-gray-500">
              {liveMode
                ? "14-day trial. No credit card required. Works alongside supported accounting software."
                : "Request early access. PaidSoon works alongside supported accounting software."}
            </p>
          </div>
          <aside aria-label="PaidSoon financial-control outcomes" className="rounded-2xl border border-gray-200 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-6 md:p-8">
            <p className="text-sm font-semibold text-blue-800">A broader view of business finances</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              FinOps, in plain English, means bringing spending, payments and cash-flow information together to support better day-to-day decisions.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {outcomeGroups.map((outcome) => (
                <li key={outcome.title} className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="font-semibold text-gray-900">{outcome.title}</p>
                  <p className="mt-1 text-sm text-gray-600">{outcome.description}</p>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="bg-gray-50 py-14 md:py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-gray-900">Get a clearer view of the money coming in and going out</h2>
            <p className="mt-4 text-gray-600">
              For a small business, cost control software and business expense management work best alongside a clear view of small business cash flow.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Recurring costs go unnoticed", copy: "Review recurring spend and potential waste with SpendLeak.", href: "/spendleak", link: "Explore recurring-spend review" },
              { title: "Costs are hard to monitor", copy: "Review cost patterns, commitments and margin pressure with the relevant modules.", href: "/platform#control-costs", link: "Explore cost control" },
              { title: "Invoices become overdue", copy: "Keep follow-ups consistent and see which invoices need attention with InvoiceGuard.", href: "/invoiceguard", link: "Explore invoice follow-ups" },
              { title: "Upcoming cash pressure is unclear", copy: "Review planning information for cash, obligations, tax reserves and runway.", href: "/platform#plan-cash", link: "Explore planning tools" },
            ].map((problem) => (
              <article key={problem.title} className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="font-semibold text-gray-900">{problem.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{problem.copy}</p>
                <Link href={problem.href} className="mt-4 inline-block text-sm font-semibold text-blue-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  {problem.link}
                </Link>
              </article>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/how-it-works" className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              See how it works
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 md:py-16">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold text-gray-900">Four practical ways to take control</h2>
            <p className="mt-3 text-gray-600">Start with the business issue you need to understand or act on.</p>
          </div>
          <Link href="/platform" className="shrink-0 font-semibold text-blue-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">View the platform overview</Link>
        </div>
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {outcomeGroups.map((outcome) => (
            <article key={outcome.title} className="rounded-xl border border-gray-200 p-6">
              <h3 className="text-xl font-semibold text-gray-900">{outcome.title}</h3>
              <p className="mt-2 text-gray-600">{outcome.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {outcome.modules.map((moduleId) => {
                  const productModule = MODULES.find((item) => item.id === moduleId)
                  if (!productModule) return null
                  return (
                    <Link key={productModule.id} href={getCanonicalModuleHref(productModule.id)} className="inline-flex min-h-10 items-center rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      Explore {getMarketingModuleLabel(productModule)}
                    </Link>
                  )
                })}
              </div>
            </article>
          ))}
        </div>
        <article className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-6">
          <h3 className="text-xl font-semibold text-blue-950">See what matters across your business</h3>
          <p className="mt-2 max-w-3xl text-blue-900">Owner&apos;s Digest brings eligible financial signals together so owners can review priorities and follow links back to the relevant module.</p>
          <Link href="/owners-digest" className="mt-4 inline-flex min-h-10 items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            Explore Owner&apos;s Digest
          </Link>
        </article>
        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <MarketingCtaLink href={primaryCta.href} label={primaryCta.label} eventName="marketing_home_benefits_cta_selected" eventData={{ liveMode: String(liveMode) }} className="inline-flex min-h-12 items-center justify-center rounded-md bg-blue-700 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" />
          <Link href="/platform" className="inline-flex min-h-12 items-center justify-center rounded-md border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            Explore the platform
          </Link>
        </div>
      </section>

      <section className="border-y border-gray-100 bg-gray-50 py-14 md:py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-gray-900">Start with the financial information you have</h2>
            <p className="mt-3 text-gray-600">FinOps for small business is a practical routine: bring information together, review it, then decide what to do next.</p>
          </div>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { title: "Connect or import supported data", copy: "Connect an available provider or use an import option supported for your workflow. Check current providers and connection details." },
              { title: "Review what needs attention", copy: "Use the modules available to your plan to review invoices, recurring spend, costs, commitments and cash indicators." },
              { title: "Take a practical next step", copy: "Follow up an overdue invoice, review a recurring cost, or use available planning information to prepare for a commitment." },
            ].map((step, index) => (
              <li key={step.title} className="rounded-xl border border-gray-200 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Step {index + 1}</p>
                <h3 className="mt-2 text-lg font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{step.copy}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-center">
            <Link href="/integrations" className="font-semibold text-blue-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">See available integrations</Link>
            <span className="px-2 text-gray-400" aria-hidden="true">·</span>
            <Link href="/how-it-works" className="font-semibold text-blue-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">See how it works</Link>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 md:py-16">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold text-gray-900">One platform, ten connected modules</h2>
            <p className="mt-3 text-gray-600">Explore the product areas that support getting paid, stopping waste, controlling costs and planning ahead. Availability varies by module and plan.</p>
          </div>
          <Link href="/platform" className="shrink-0 font-semibold text-blue-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">View the platform overview</Link>
        </div>
        <ul className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {MODULES.map((module) => (
            <li key={module.id}>
              <Link href={getCanonicalModuleHref(module.id)} className="flex h-full min-h-24 flex-col justify-between rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <span className="font-semibold text-gray-900">{getMarketingModuleLabel(module)}</span>
                <span className="mt-2 text-sm text-gray-600">{module.statusLabel}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-gray-50 py-14 md:py-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Built to work alongside your accounting software</h2>
            <p className="mt-3 leading-relaxed text-gray-600">PaidSoon is for Australian small-business owners who want a practical way to review spending, payments and cash-flow information without replacing their accounting system. Current provider status is shown below{plannedIntegrations.length ? `; ${plannedIntegrations.join(", ")} ${plannedIntegrations.length === 1 ? "is" : "are"} planned` : ""}.</p>
            <Link href="/integrations" className="mt-5 inline-flex min-h-11 items-center font-semibold text-blue-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">See integrations and setup details</Link>
            <p className="mt-4 text-sm text-gray-600">
              Read more about the <Link href="/platform" className="font-semibold text-blue-700 underline-offset-4 hover:underline">platform</Link> or how PaidSoon approaches <Link href="/security" className="font-semibold text-blue-700 underline-offset-4 hover:underline">security</Link>.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {integrations.map((integration) => (
              <li key={integration.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{integration.name}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${INTEGRATION_STATUS_BADGE_STYLES[integration.status]}`}>
                    {INTEGRATION_STATUS_LABEL[integration.status]}
                  </span>
                </div>
                {integration.href ? <Link href={integration.href} className="mt-3 inline-block text-sm font-semibold text-blue-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Integration details</Link> : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 md:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-gray-900">Choose a plan for the way you work</h2>
          <p className="mt-3 text-gray-600">Compare current plan prices, invoice limits and module availability before you choose.</p>
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {publicPlans.map((plan) => (
            <li key={plan.id} className={`rounded-xl bg-white p-5 ${plan.featured ? "border-2 border-blue-700" : "border border-gray-200"}`}>
              <h3 className="font-semibold text-gray-900">{plan.name}</h3>
              <p className="mt-2 text-2xl font-bold text-gray-900">{plan.price}</p>
              <p className="mt-2 text-sm text-gray-600">{plan.allowance === -1 ? "Unlimited chased invoices" : `${plan.allowance} chased invoices per month`}</p>
            </li>
          ))}
        </ul>
        <div className="mt-7 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link href="/pricing" className="inline-flex min-h-12 items-center justify-center rounded-md border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Compare all plans</Link>
          <MarketingCtaLink href={primaryCta.href} label={primaryCta.label} eventName="marketing_pricing_preview_selected" eventData={{ liveMode: String(liveMode) }} className="inline-flex min-h-12 items-center justify-center rounded-md bg-blue-700 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" />
        </div>
      </section>

      <section className="bg-gray-50 py-14 md:py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-center text-3xl font-bold text-gray-900">Frequently asked questions</h2>
          <dl className="mt-8 space-y-4">
            {faq.map((item) => (
              <div key={item.q} className="rounded-xl border border-gray-200 bg-white p-5">
                <dt className="font-semibold text-gray-900">{item.q}</dt>
                <dd className="mt-2 leading-relaxed text-gray-600">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-blue-800 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white">Make your next financial decision with a clearer view.</h2>
          <p className="mt-4 text-blue-100">Bring spending, payments and cash-flow information into a more practical routine for your business.</p>
          <MarketingCtaLink href={primaryCta.href} label={primaryCta.label} eventName="marketing_home_bottom_cta_selected" eventData={{ liveMode: String(liveMode) }} className="mt-7 inline-flex min-h-12 items-center justify-center rounded-md bg-white px-6 py-3 text-sm font-semibold text-blue-800 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-800" />
        </div>
      </section>
    </div>
  )
}
