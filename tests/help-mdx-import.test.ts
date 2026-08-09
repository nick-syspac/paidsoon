import test from "node:test"
import assert from "node:assert/strict"
import { buildMdxImportReport } from "@/lib/help/mdxImport"

test("buildMdxImportReport maps frontmatter and preserves slug continuity", () => {
  const report = buildMdxImportReport({
    files: [
      {
        filePath: "content/help/connect-xero.mdx",
        content: `---\ntitle: Connect Xero\ndescription: Sync overdue invoices\nlastVerified: 2026-08-02\n---\n\nBody text`,
      },
    ],
    defaultAudience: "public",
    importedAtIso: "2026-08-07T00:00:00.000Z",
  })

  assert.equal(report.records.length, 1)
  const [record] = report.records
  assert.equal(record.slug, "connect-xero")
  assert.equal(record.title, "Connect Xero")
  assert.equal(record.summary, "Sync overdue invoices")
  assert.equal(record.audience, "public")
  assert.equal(record.lifecycleState, "published")
  assert.equal(record.content.lastVerified, "2026-08-02")
})

test("buildMdxImportReport flags unsupported components and unresolved /help links", () => {
  const report = buildMdxImportReport({
    files: [
      {
        filePath: "content/help/index.mdx",
        content: `---\ntitle: Home\ndescription: Root\n---\n\n<Callout title=\"Heads up\">A</Callout>\n\n[Missing](/help/not-real)`,
      },
      {
        filePath: "content/help/connect-xero.mdx",
        content: `---\ntitle: Xero\ndescription: Doc\n---\n\nSee [Home](/help).`,
      },
    ],
    defaultAudience: "signed_in",
    importedAtIso: "2026-08-07T00:00:00.000Z",
  })

  const componentIssue = report.issues.find((issue) => issue.kind === "unsupported_component")
  assert.ok(componentIssue)

  const unresolvedIssue = report.issues.find((issue) => issue.kind === "unresolved_help_link")
  assert.ok(unresolvedIssue)

  assert.equal(report.stats.flagged >= 1, true)
})
