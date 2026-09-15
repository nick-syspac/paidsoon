import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

export interface BlogPostMeta {
  slug: string
  title: string
  description: string
  author: string
  reviewer: string | null
  publishedAt: string
  updatedAt: string | null
  relatedProductHref: string
  relatedProductLabel: string
}

function parseFrontmatter(raw: string): Record<string, string> {
  const lines = raw.split(/\r?\n/)
  if (lines.length < 3 || lines[0]?.trim() !== "---") {
    return {}
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  if (endIndex === -1) {
    return {}
  }

  const frontmatter: Record<string, string> = {}

  for (const line of lines.slice(1, endIndex)) {
    const separator = line.indexOf(":")
    if (separator === -1) continue

    const key = line.slice(0, separator).trim()
    const rawValue = line.slice(separator + 1).trim()
    const value = rawValue.replace(/^"|"$/g, "").replace(/^'|'$/g, "")

    if (key) {
      frontmatter[key] = value
    }
  }

  return frontmatter
}

function readBlogPostMetaFromFile(fileName: string): BlogPostMeta {
  const filePath = path.join(process.cwd(), "content", "blog", fileName)
  const raw = readFileSync(filePath, "utf8")
  const frontmatter = parseFrontmatter(raw)
  const slug = frontmatter.slug ?? fileName.replace(/\.mdx$/i, "")

  const requiredFields = [
    "title",
    "description",
    "author",
    "publishedAt",
    "relatedProductHref",
    "relatedProductLabel",
  ] as const

  for (const field of requiredFields) {
    if (!frontmatter[field]) {
      throw new Error(`Blog post ${fileName} is missing required frontmatter field: ${field}`)
    }
  }

  return {
    slug,
    title: frontmatter.title,
    description: frontmatter.description,
    author: frontmatter.author,
    reviewer: frontmatter.reviewer ?? null,
    publishedAt: frontmatter.publishedAt,
    updatedAt: frontmatter.updatedAt ?? null,
    relatedProductHref: frontmatter.relatedProductHref,
    relatedProductLabel: frontmatter.relatedProductLabel,
  }
}

export function getAllBlogPostMeta(): BlogPostMeta[] {
  return readdirSync(path.join(process.cwd(), "content", "blog"))
    .filter((fileName) => fileName.endsWith(".mdx"))
    .map(readBlogPostMetaFromFile)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

export function getBlogPostMeta(slug: string): BlogPostMeta {
  const meta = getAllBlogPostMeta().find((item) => item.slug === slug)
  if (!meta) {
    throw new Error(`Blog metadata not found for slug: ${slug}`)
  }

  return meta
}