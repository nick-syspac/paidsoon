import path from "node:path"

export type TrainingAudience = "public" | "signed_in"

export interface ParsedHelpMdx {
  sourcePath: string
  slug: string
  title: string
  description: string
  lastVerified: string | null
  bodyMdx: string
  bodyText: string
  headings: Array<{ level: number; text: string }>
  markdownLinks: Array<{ label: string; href: string }>
  unsupportedComponents: string[]
  unresolvedHelpLinks: string[]
}

export interface ImportRecord {
  slug: string
  title: string
  summary: string
  audience: TrainingAudience
  lifecycleState: "published"
  publishedAt: string
  featureKey: null
  routeHint: null
  sourcePath: string
  content: {
    schema: "training.mdx-import.v1"
    bodyMdx: string
    bodyText: string
    headings: Array<{ level: number; text: string }>
    markdownLinks: Array<{ label: string; href: string }>
    unsupportedComponents: string[]
    sourcePath: string
    importedAt: string
    lastVerified: string | null
  }
}

export interface ImportIssue {
  slug: string
  sourcePath: string
  kind:
    | "missing_frontmatter"
    | "missing_title"
    | "missing_description"
    | "unsupported_component"
    | "unresolved_help_link"
    | "duplicate_slug"
  message: string
}

export interface ImportReport {
  records: ImportRecord[]
  issues: ImportIssue[]
  stats: {
    scanned: number
    imported: number
    skipped: number
    flagged: number
  }
}

interface FrontmatterParseResult {
  frontmatter: Record<string, string>
  body: string
}

function parseFrontmatter(raw: string): FrontmatterParseResult {
  const lines = raw.split(/\r?\n/)
  if (lines.length < 3 || lines[0].trim() !== "---") {
    return { frontmatter: {}, body: raw }
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  if (endIndex === -1) {
    return { frontmatter: {}, body: raw }
  }

  const frontmatterLines = lines.slice(1, endIndex)
  const frontmatter: Record<string, string> = {}

  for (const line of frontmatterLines) {
    const separator = line.indexOf(":")
    if (separator === -1) continue

    const key = line.slice(0, separator).trim()
    const rawValue = line.slice(separator + 1).trim()
    const value = rawValue.replace(/^"|"$/g, "").replace(/^'|'$/g, "")
    if (key) frontmatter[key] = value
  }

  const body = lines.slice(endIndex + 1).join("\n").trim()
  return { frontmatter, body }
}

function stripMarkdownSyntax(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[#>*_~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function extractHeadings(body: string): Array<{ level: number; text: string }> {
  const results: Array<{ level: number; text: string }> = []
  const headingRegex = /^(#{1,6})\s+(.+)$/gm

  for (const match of body.matchAll(headingRegex)) {
    const level = match[1]?.length ?? 1
    const text = (match[2] ?? "").trim()
    if (text) {
      results.push({ level, text })
    }
  }

  return results
}

function extractMarkdownLinks(body: string): Array<{ label: string; href: string }> {
  const results: Array<{ label: string; href: string }> = []
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g

  for (const match of body.matchAll(linkRegex)) {
    const label = (match[1] ?? "").trim()
    const href = (match[2] ?? "").trim()
    if (label && href) {
      results.push({ label, href })
    }
  }

  return results
}

function extractUnsupportedComponents(body: string): string[] {
  const componentNames = new Set<string>()
  const componentRegex = /<([A-Z][A-Za-z0-9]*)\b/g

  for (const match of body.matchAll(componentRegex)) {
    const name = match[1]
    if (name) componentNames.add(name)
  }

  return [...componentNames].sort((a, b) => a.localeCompare(b))
}

function slugFromFilePath(filePath: string): string {
  const fileName = path.basename(filePath)
  return fileName.replace(/\.mdx$/i, "")
}

function resolveUnresolvedHelpLinks(
  links: Array<{ label: string; href: string }>,
  knownSlugs: Set<string>
): string[] {
  const unresolved = new Set<string>()

  for (const link of links) {
    if (!link.href.startsWith("/help")) continue

    const raw = link.href.replace(/^\/help\/?/, "")
    const normalized = raw.length === 0 ? "index" : raw.replace(/\/$/, "")

    if (!knownSlugs.has(normalized)) {
      unresolved.add(link.href)
    }
  }

  return [...unresolved].sort((a, b) => a.localeCompare(b))
}

export function buildMdxImportReport(args: {
  files: Array<{ filePath: string; content: string }>
  defaultAudience: TrainingAudience
  importedAtIso: string
}): ImportReport {
  const slugSourcePaths = new Map<string, string[]>()
  for (const file of args.files) {
    const slug = slugFromFilePath(file.filePath)
    const sources = slugSourcePaths.get(slug) ?? []
    sources.push(file.filePath)
    slugSourcePaths.set(slug, sources)
  }

  const knownSlugs = new Set(slugSourcePaths.keys())

  const records: ImportRecord[] = []
  const issues: ImportIssue[] = []

  for (const [slug, sourcePaths] of slugSourcePaths.entries()) {
    if (sourcePaths.length <= 1) continue

    for (const sourcePath of sourcePaths) {
      issues.push({
        slug,
        sourcePath,
        kind: "duplicate_slug",
        message: `Multiple source files resolve to slug ${slug}`,
      })
    }
  }

  for (const file of args.files) {
    const slug = slugFromFilePath(file.filePath)
    const parsed = parseFrontmatter(file.content)

    if (Object.keys(parsed.frontmatter).length === 0) {
      issues.push({
        slug,
        sourcePath: file.filePath,
        kind: "missing_frontmatter",
        message: "File has no frontmatter block",
      })
    }

    const title = (parsed.frontmatter.title ?? "").trim()
    const description = (parsed.frontmatter.description ?? "").trim()
    const lastVerified = (parsed.frontmatter.lastVerified ?? "").trim() || null

    if (!title) {
      issues.push({
        slug,
        sourcePath: file.filePath,
        kind: "missing_title",
        message: "Frontmatter title is missing",
      })
      continue
    }

    if (!description) {
      issues.push({
        slug,
        sourcePath: file.filePath,
        kind: "missing_description",
        message: "Frontmatter description is missing",
      })
      continue
    }

    const bodyMdx = parsed.body
    const bodyText = stripMarkdownSyntax(bodyMdx)
    const headings = extractHeadings(bodyMdx)
    const markdownLinks = extractMarkdownLinks(bodyMdx)
    const unsupportedComponents = extractUnsupportedComponents(bodyMdx)
    const unresolvedHelpLinks = resolveUnresolvedHelpLinks(markdownLinks, knownSlugs)

    for (const component of unsupportedComponents) {
      issues.push({
        slug,
        sourcePath: file.filePath,
        kind: "unsupported_component",
        message: `Unsupported MDX component <${component}> detected`,
      })
    }

    for (const href of unresolvedHelpLinks) {
      issues.push({
        slug,
        sourcePath: file.filePath,
        kind: "unresolved_help_link",
        message: `Link target not found in import set: ${href}`,
      })
    }

    records.push({
      slug,
      title,
      summary: description,
      audience: args.defaultAudience,
      lifecycleState: "published",
      publishedAt: args.importedAtIso,
      featureKey: null,
      routeHint: null,
      sourcePath: file.filePath,
      content: {
        schema: "training.mdx-import.v1",
        bodyMdx,
        bodyText,
        headings,
        markdownLinks,
        unsupportedComponents,
        sourcePath: file.filePath,
        importedAt: args.importedAtIso,
        lastVerified,
      },
    })
  }

  const flaggedSlugs = new Set(issues.map((issue) => issue.slug))

  return {
    records,
    issues,
    stats: {
      scanned: args.files.length,
      imported: records.length,
      skipped: args.files.length - records.length,
      flagged: flaggedSlugs.size,
    },
  }
}
