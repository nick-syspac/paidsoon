import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { helpSource } from "@/lib/help/source"
import { helpMdxComponents } from "@/components/help/mdx"

export default async function HelpPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const page = helpSource.getPage(slug ?? [])
  if (!page) notFound()

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

export function generateStaticParams() {
  return helpSource.generateParams()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
  const { slug } = await params
  const page = helpSource.getPage(slug ?? [])
  if (!page) notFound()

  return {
    title: `${page.data.title} — PaidSoon Help Centre`,
    description: page.data.description,
  }
}
