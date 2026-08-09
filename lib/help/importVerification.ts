import type { ImportRecord, ImportReport } from "@/lib/help/mdxImport"

export interface ImportedTrainingDbRow {
  slug: string
  title: string
  summary: string | null
  lifecycleState: string
  audience: string
  content: unknown
  revisionCount: number
}

export interface VerificationIssue {
  slug: string
  check:
    | "missing_record"
    | "lifecycle_state"
    | "title"
    | "summary"
    | "content_schema"
    | "content_body_mdx"
    | "content_body_text"
    | "audience"
    | "revision_count"
    | "help_link_target"
    | "source_unresolved_link"
  message: string
}

export interface VerificationResult {
  totalExpected: number
  totalFound: number
  issues: VerificationIssue[]
}

function normalizeHelpSlugFromHref(href: string): string {
  const raw = href.replace(/^\/help\/?/, "")
  return raw.length === 0 ? "index" : raw.replace(/\/$/, "")
}

function getContentRecord(content: unknown): Record<string, unknown> | null {
  if (!content || typeof content !== "object") {
    return null
  }
  return content as Record<string, unknown>
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

export function verifyTrainingImport(args: {
  sourceReport: ImportReport
  dbRows: ImportedTrainingDbRow[]
}): VerificationResult {
  const issues: VerificationIssue[] = []

  const unresolvedLinkIssues = args.sourceReport.issues.filter(
    (issue) => issue.kind === "unresolved_help_link"
  )
  for (const issue of unresolvedLinkIssues) {
    issues.push({
      slug: issue.slug,
      check: "source_unresolved_link",
      message: issue.message,
    })
  }

  const expectedBySlug = new Map<string, ImportRecord>()
  for (const record of args.sourceReport.records) {
    expectedBySlug.set(record.slug, record)
  }

  const dbBySlug = new Map<string, ImportedTrainingDbRow>()
  for (const row of args.dbRows) {
    dbBySlug.set(row.slug, row)
  }

  const knownDbSlugs = new Set(args.dbRows.map((row) => row.slug))

  for (const [slug, expected] of expectedBySlug.entries()) {
    const row = dbBySlug.get(slug)
    if (!row) {
      issues.push({
        slug,
        check: "missing_record",
        message: "Expected slug is missing from training_content",
      })
      continue
    }

    if (row.lifecycleState !== "published") {
      issues.push({
        slug,
        check: "lifecycle_state",
        message: `Expected lifecycleState=published but found ${row.lifecycleState}`,
      })
    }

    if (row.audience !== expected.audience) {
      issues.push({
        slug,
        check: "audience",
        message: `Expected audience=${expected.audience} but found ${row.audience}`,
      })
    }

    if (row.title !== expected.title) {
      issues.push({
        slug,
        check: "title",
        message: "DB title does not match imported source title",
      })
    }

    if ((row.summary ?? null) !== expected.summary) {
      issues.push({
        slug,
        check: "summary",
        message: "DB summary does not match imported source description",
      })
    }

    if (row.revisionCount < 1) {
      issues.push({
        slug,
        check: "revision_count",
        message: "Expected at least one training revision snapshot",
      })
    }

    const content = getContentRecord(row.content)
    if (!content) {
      issues.push({
        slug,
        check: "content_schema",
        message: "DB content is not an object",
      })
      continue
    }

    if (content.schema !== "training.mdx-import.v1") {
      issues.push({
        slug,
        check: "content_schema",
        message: "DB content schema marker is missing or incorrect",
      })
    }

    if (content.bodyMdx !== expected.content.bodyMdx) {
      issues.push({
        slug,
        check: "content_body_mdx",
        message: "DB content.bodyMdx does not match source MDX body",
      })
    }

    if (content.bodyText !== expected.content.bodyText) {
      issues.push({
        slug,
        check: "content_body_text",
        message: "DB content.bodyText does not match stripped source text",
      })
    }

    const markdownLinks = content.markdownLinks
    if (Array.isArray(markdownLinks)) {
      for (const link of markdownLinks) {
        if (!link || typeof link !== "object") {
          continue
        }
        const href = (link as Record<string, unknown>).href
        if (typeof href !== "string" || !href.startsWith("/help")) {
          continue
        }

        const targetSlug = normalizeHelpSlugFromHref(href)
        if (!knownDbSlugs.has(targetSlug)) {
          issues.push({
            slug,
            check: "help_link_target",
            message: `Help link target is missing after import: ${href}`,
          })
        }
      }
    }

    const destinationKeys = content.destinationKeys
    if (destinationKeys !== undefined && destinationKeys !== null && !isStringArray(destinationKeys)) {
      issues.push({
        slug,
        check: "content_schema",
        message: "DB content.destinationKeys is present but not a string array",
      })
    }
  }

  return {
    totalExpected: expectedBySlug.size,
    totalFound: args.dbRows.length,
    issues,
  }
}
