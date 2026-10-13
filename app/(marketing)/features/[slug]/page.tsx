import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { MarketingBreadcrumbs } from "@/components/marketing/MarketingBreadcrumbs"
import { ModulePage, moduleMetadata } from "@/components/marketing/ModulePage"
import {
  CANONICAL_FEATURE_ROUTES,
  getModuleByFeatureSlug,
} from "@/components/marketing/marketingContent"
import { buildMarketingMetadata } from "@/lib/marketing/seo"

type FeaturePageProps = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams(): Array<{ slug: string }> {
  return CANONICAL_FEATURE_ROUTES.map(({ slug }) => ({ slug }))
}

export async function generateMetadata({ params }: FeaturePageProps): Promise<Metadata> {
  const { slug } = await params
  const moduleDef = getModuleByFeatureSlug(slug)
  if (!moduleDef) return {}

  if (moduleDef.id === "client-manager") {
    return buildMarketingMetadata({
      title: "Client Manager for Accountants & Bookkeepers | PaidSoon",
      description:
        "Use InvoiceGuard for one client account at a time. Multi-client management, shared dashboards, and onboarding tools are planned, not yet available.",
      canonicalPath: "/features/client-manager",
      imagePath: "/social/accountants-og.svg",
      imageAlt: "Client Manager for accountants and bookkeepers, by PaidSoon",
    })
  }

  return moduleMetadata(moduleDef.id)
}

function ClientManagerPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="mx-auto max-w-5xl px-4 pt-16 pb-12">
        <MarketingBreadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Client Manager", href: "/features/client-manager" },
          ]}
        />
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-8 text-indigo-950 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">Invoice follow-up for accountants and bookkeepers</p>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">Support client invoice follow-ups with a practical workflow.</h1>
          <p className="mt-4 max-w-3xl text-base md:text-lg">
            Use PaidSoon and InvoiceGuard with one client account at a time. The shared multi-client workspace is planned and is not yet available.
          </p>
          <Link
            href="/contact?type=Accountant%20Partnership"
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-md bg-indigo-950 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Enquire about an accountant partnership
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-4 pb-10 md:grid-cols-2">
        <article className="rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900">What works for an individual client</h2>
          <ul className="mt-4 space-y-3 text-gray-600">
            <li>Connect an individual client account and supported invoice source.</li>
            <li>Configure that client’s reminder schedule and sender details.</li>
            <li>Review that client’s overdue invoices, promises to pay, and disputes.</li>
          </ul>
        </article>
        <article className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
          <h2 className="text-xl font-semibold text-gray-900">Multi-client tools are planned</h2>
          <p className="mt-3 text-gray-600">
            A unified client dashboard, multi-client management, and streamlined client onboarding are planned and are not yet available.
          </p>
          <Link href="/contact?type=Accountant%20Partnership" className="mt-4 inline-block font-semibold text-blue-700 underline-offset-4 hover:underline">
            Register your interest
          </Link>
        </article>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="text-2xl font-semibold text-gray-900">A client-by-client workflow</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            "Use an individual client’s account and connected invoice source.",
            "Set the reminder cadence and sender details for that account.",
            "Review follow-ups, promises, and disputes in that client’s workflow.",
          ].map((step, index) => (
            <li key={step} className="rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Step {index + 1}</p>
              <p className="mt-2 text-gray-700">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

export default async function FeatureModulePage({ params }: FeaturePageProps) {
  const { slug } = await params
  const moduleDef = getModuleByFeatureSlug(slug)
  if (!moduleDef) notFound()

  if (moduleDef.id === "client-manager") return <ClientManagerPage />
  return <ModulePage id={moduleDef.id} />
}
