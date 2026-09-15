import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { helpMdxComponents } from "@/components/help/mdx"
import { MarketingBreadcrumbs } from "@/components/marketing/MarketingBreadcrumbs"
import { getAllBlogPostMeta, getBlogPostMeta } from "@/lib/blog/content"
import { buildMarketingMetadata } from "@/lib/marketing/seo"
import { blogSource } from "@/lib/blog/source"

interface BlogDocData {
  title?: string
  description?: string
  body: React.ComponentType<{ components: typeof helpMdxComponents }>
}

function getBlogPost(slug: string): {
  page: ReturnType<typeof blogSource.getPage>
  data: BlogDocData
} {
  const page = blogSource.getPage([slug])
  if (!page) {
    notFound()
  }

  const data = page.data as BlogDocData
  if (!data.title || !data.description) {
    throw new Error(`Blog post ${slug} is missing required frontmatter`)
  }

  return {
    page,
    data,
  }
}

export function generateStaticParams(): Array<{ slug: string }> {
  return getAllBlogPostMeta().map((page) => ({ slug: page.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const meta = getBlogPostMeta(slug)

  return buildMarketingMetadata({
    title: `${meta.title} | PaidSoon`,
    description: meta.description,
    canonicalPath: `/blog/${slug}`,
    type: "article",
  })
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { data } = getBlogPost(slug)
  const meta = getBlogPostMeta(slug)
  const MDX = data.body

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: meta.title,
    description: meta.description,
    author: {
      "@type": "Organization",
      name: meta.author,
    },
    datePublished: meta.publishedAt,
    dateModified: meta.updatedAt ?? meta.publishedAt,
    mainEntityOfPage: "/blog/" + slug,
  }

  return (
    <article className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <div className="mx-auto max-w-3xl px-4 pt-16 pb-10">
        <MarketingBreadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Resources", href: "/resources" },
            { label: "Blog", href: "/blog" },
            { label: meta.title, href: `/blog/${slug}` },
          ]}
        />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">PaidSoon blog</p>
        <h1 className="mt-4 text-4xl font-bold text-gray-900">{meta.title}</h1>
        <p className="mt-4 text-lg text-gray-600">{meta.description}</p>
        <div className="mt-6 flex flex-wrap gap-4 text-sm text-gray-500">
          <span>By {meta.author}</span>
          <span>Published {meta.publishedAt}</span>
          {meta.updatedAt ? <span>Updated {meta.updatedAt}</span> : null}
          {meta.reviewer ? <span>Reviewed by {meta.reviewer}</span> : null}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-12">
        <div className="rounded-2xl border border-gray-200 p-8">
          <MDX components={helpMdxComponents} />
        </div>
      </div>

      <section className="mx-auto max-w-3xl px-4 pb-16">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
          <h2 className="text-xl font-semibold text-gray-900">Put this into practice</h2>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Move from advice to action with PaidSoon&apos;s invoice reminder workflow.
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link
              href={meta.relatedProductHref}
              className="inline-flex items-center justify-center rounded-md bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800"
            >
              {meta.relatedProductLabel}
            </Link>
            <Link
              href="/blog"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Read more articles
            </Link>
          </div>
        </div>
      </section>
    </article>
  )
}