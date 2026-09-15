import type { Metadata } from "next"
import Link from "next/link"
import { getAllBlogPostMeta } from "@/lib/blog/content"
import { buildMarketingMetadata } from "@/lib/marketing/seo"

export const metadata: Metadata = buildMarketingMetadata({
  title: "Invoice Reminder And Cash Flow Guides | PaidSoon",
  description:
    "Read practical guides on overdue invoice follow-up, reminder email timing, promise tracking, and cash-flow control for Australian small businesses.",
  canonicalPath: "/blog",
})

const publishedArticles = getAllBlogPostMeta().map((article) => ({
  url: `/blog/${article.slug}`,
  title: article.title,
  description: article.description,
  publishedAt: article.publishedAt,
}))

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold text-gray-900">Guides for getting paid faster</h1>
        <p className="mt-4 text-lg text-gray-500">
          Practical articles for Australian businesses, freelancers, bookkeepers and accountants who
          want to reduce debtor days and make cash-flow decisions earlier.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">
          Published articles
        </h2>
        <div className="space-y-6">
          {publishedArticles.map((article) => (
            <article key={article.url} className="border-b border-gray-100 pb-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {article.publishedAt}
              </p>
              <h3 className="mt-2 font-semibold text-gray-900 mb-1">
                <Link href={article.url} className="hover:text-blue-700">
                  {article.title}
                </Link>
              </h3>
              <p className="text-sm text-gray-500">{article.description}</p>
              <Link href={article.url} className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:underline">
                Read article
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-10 bg-gray-50 rounded-xl p-6">
          <p className="text-sm text-gray-600">
            Want a topic covered?{" "}
            <Link href="/contact" className="text-blue-600 hover:underline font-medium">
              Contact us
            </Link>{" "}
            with questions you would like us to answer in a future article.
          </p>
        </div>
      </section>
    </div>
  )
}

