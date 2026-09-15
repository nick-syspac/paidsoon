import type { Metadata } from "next"
import Link from "next/link"
import { getAllBlogPostMeta } from "@/lib/blog/content"
import { buildMarketingMetadata } from "@/lib/marketing/seo"

export const metadata: Metadata = buildMarketingMetadata({
  title: "Cash Flow And Invoice Reminder Resources | PaidSoon",
  description:
    "Browse PaidSoon guides, help, documentation, FAQ, and release notes for invoice reminders, integrations, and cash-flow control.",
  canonicalPath: "/resources",
})

const resources = [
  {
    title: "Blog",
    description: "Tips on cash flow, invoice management, and getting paid faster.",
    href: "/blog",
    cta: "Read the blog →",
  },
  {
    title: "Help Centre",
    description: "Step-by-step guides for setting up and using PaidSoon.",
    href: "/help",
    cta: "Browse help articles →",
  },
  {
    title: "Documentation",
    description: "Technical documentation for API integrations and advanced configuration.",
    href: "/docs",
    cta: "View docs →",
  },
  {
    title: "FAQ",
    description: "Answers to the most common questions about PaidSoon.",
    href: "/faq",
    cta: "Read the FAQ →",
  },
  {
    title: "Release Notes",
    description: "What's new in PaidSoon — feature updates, fixes, and improvements.",
    href: "/release-notes",
    cta: "See what's new →",
  },
]

const publishedArticles = getAllBlogPostMeta()
  .map((article) => ({
    url: `/blog/${article.slug}`,
    title: article.title,
    description: article.description,
  }))
  .slice(0, 3)

export default function ResourcesPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Resources</h1>
        <p className="mt-4 text-lg text-gray-500">
          Everything you need to get the most out of PaidSoon.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resources.map((resource) => (
            <Link
              key={resource.href}
              href={resource.href}
              className="block border border-gray-100 rounded-lg p-6 hover:border-blue-200 hover:shadow-sm transition-all"
            >
              <h2 className="font-semibold text-gray-900 mb-2">{resource.title}</h2>
              <p className="text-sm text-gray-500 mb-4 leading-relaxed">{resource.description}</p>
              <span className="text-sm text-blue-600 font-medium">{resource.cta}</span>
            </Link>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900">Popular guides</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {publishedArticles.map((article) => (
              <article key={article.url} className="rounded-xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900">{article.title}</h3>
                <p className="mt-2 text-sm text-gray-500">{article.description}</p>
                <Link href={article.url} className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:underline">
                  Read article
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
