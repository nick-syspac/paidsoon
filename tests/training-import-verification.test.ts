import test from "node:test"
import assert from "node:assert/strict"
import { verifyTrainingImport, type ImportedTrainingDbRow } from "@/lib/help/importVerification"
import type { ImportReport } from "@/lib/help/mdxImport"

function buildBaseReport(): ImportReport {
  return {
    records: [
      {
        slug: "connect-xero",
        title: "Connect Xero",
        summary: "Sync overdue invoices",
        audience: "public",
        lifecycleState: "published",
        publishedAt: "2026-08-07T00:00:00.000Z",
        featureKey: null,
        routeHint: null,
        sourcePath: "content/help/connect-xero.mdx",
        content: {
          schema: "training.mdx-import.v1",
          bodyMdx: "# Connect Xero\n\nUse this guide.",
          bodyText: "Connect Xero Use this guide.",
          headings: [{ level: 1, text: "Connect Xero" }],
          markdownLinks: [{ label: "Help", href: "/help/connect-xero" }],
          unsupportedComponents: [],
          sourcePath: "content/help/connect-xero.mdx",
          importedAt: "2026-08-07T00:00:00.000Z",
          lastVerified: null,
        },
      },
    ],
    issues: [],
    stats: {
      scanned: 1,
      imported: 1,
      skipped: 0,
      flagged: 0,
    },
  }
}

function buildMatchingDbRow(): ImportedTrainingDbRow {
  return {
    slug: "connect-xero",
    title: "Connect Xero",
    summary: "Sync overdue invoices",
    lifecycleState: "published",
    audience: "public",
    content: {
      schema: "training.mdx-import.v1",
      bodyMdx: "# Connect Xero\n\nUse this guide.",
      bodyText: "Connect Xero Use this guide.",
      markdownLinks: [{ label: "Help", href: "/help/connect-xero" }],
    },
    revisionCount: 1,
  }
}

test("verifyTrainingImport passes for matching source and DB rows", () => {
  const result = verifyTrainingImport({
    sourceReport: buildBaseReport(),
    dbRows: [buildMatchingDbRow()],
  })

  assert.equal(result.issues.length, 0)
  assert.equal(result.totalExpected, 1)
  assert.equal(result.totalFound, 1)
})

test("verifyTrainingImport reports rendering and revision mismatches", () => {
  const mismatchRow: ImportedTrainingDbRow = {
    ...buildMatchingDbRow(),
    content: {
      schema: "training.mdx-import.v1",
      bodyMdx: "# Different",
      bodyText: "Different",
      markdownLinks: [{ label: "Broken", href: "/help/not-real" }],
    },
    revisionCount: 0,
  }

  const result = verifyTrainingImport({
    sourceReport: buildBaseReport(),
    dbRows: [mismatchRow],
  })

  const checks = new Set(result.issues.map((issue) => issue.check))
  assert.equal(checks.has("content_body_mdx"), true)
  assert.equal(checks.has("content_body_text"), true)
  assert.equal(checks.has("help_link_target"), true)
  assert.equal(checks.has("revision_count"), true)
})
