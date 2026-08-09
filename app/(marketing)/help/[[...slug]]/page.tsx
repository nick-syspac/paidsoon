import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { helpSource } from "@/lib/help/source"
import { helpMdxComponents } from "@/components/help/mdx"
import { createClient } from "@/lib/supabase/server"
import { prismaAdmin } from "@/lib/db/admin"
import { isGuideVisibleToViewer, extractSearchTextFromStructuredContent } from "@/lib/help/trainingContent"
import { isLegacyHelpSlug, resolveCanonicalHelpSlug } from "@/lib/help/legacySlugs"

function toHelpPath(slug: string): string {
  return slug === "index" ? "/help" : `/help/${slug}`
}

function renderTrainingBody(content: unknown): string {
  if (!content || typeof content !== "object") {
    return ""
  }

  const asRecord = content as Record<string, unknown>
  const importedBody = asRecord.bodyMdx
  if (typeof importedBody === "string" && importedBody.trim().length > 0) {
    return importedBody
  }

  return extractSearchTextFromStructuredContent(content)
}

async function getPublishedTrainingGuide(slug: string): Promise<{
  title: string
  summary: string | null
  bodyText: string
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Uses prismaAdmin intentionally because training tables are platform-authored and deny-all under tenant roles.
  const item = await prismaAdmin.trainingContent.findUnique({
    where: { slug },
    select: {
      title: true,
      summary: true,
      content: true,
      lifecycleState: true,
      audience: true,
    },
  })

  if (!item || item.lifecycleState !== "published") {
    return null
  }

  if (!isGuideVisibleToViewer(item.audience, { isAuthenticated: !!user })) {
    return null
  }

  return {
    title: item.title,
    summary: item.summary,
    bodyText: renderTrainingBody(item.content),
  }
}

export default async function HelpPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const requestedSlug = slug && slug.length > 0 ? slug.join("/") : "index"
  const canonicalSlug = resolveCanonicalHelpSlug(requestedSlug)

  if (isLegacyHelpSlug(requestedSlug) && canonicalSlug !== requestedSlug) {
    redirect(toHelpPath(canonicalSlug))
  }

  const trainingGuide = await getPublishedTrainingGuide(canonicalSlug)
  if (trainingGuide) {
    return (
      <article>
        <h1 className="text-3xl font-bold text-gray-900">{trainingGuide.title}</h1>
        {trainingGuide.summary ? (
          <p className="mt-3 text-lg text-gray-500">{trainingGuide.summary}</p>
        ) : null}
        <div className="mt-8">
          <div className="whitespace-pre-wrap text-gray-700 leading-7">{trainingGuide.bodyText}</div>
        </div>
      </article>
    )
  }

  const fallbackSlugParts = canonicalSlug === "index" ? [] : canonicalSlug.split("/")
  const page = helpSource.getPage(fallbackSlugParts)
  if (!page) {
    notFound()
  }

  const MDX = page.data.body

  return (
    <article>
      <h1 className="text-3xl font-bold text-gray-900">{page.data.title}</h1>
      {page.data.description ? (
        <p className="mt-3 text-lg text-gray-500">{page.data.description}</p>
      ) : null}
      <div className="mt-8">
        <MDX components={helpMdxComponents} />
      </div>
    </article>
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
  const { slug } = await params
  const requestedSlug = slug && slug.length > 0 ? slug.join("/") : "index"
  const canonicalSlug = resolveCanonicalHelpSlug(requestedSlug)

  const trainingGuide = await getPublishedTrainingGuide(canonicalSlug)
  if (trainingGuide) {
    return {
      title: `${trainingGuide.title} — PaidSoon Help Centre`,
      description: trainingGuide.summary ?? undefined,
    }
  }

  const fallbackSlugParts = canonicalSlug === "index" ? [] : canonicalSlug.split("/")
  const page = helpSource.getPage(fallbackSlugParts)
  if (!page) {
    notFound()
  }

  return {
    title: `${page.data.title} — PaidSoon Help Centre`,
    description: page.data.description,
  }
}
