import "./_loadEnv"

import path from "node:path"
import { promises as fs } from "node:fs"
import { prismaAdmin } from "@/lib/db/admin"
import { buildMdxImportReport } from "@/lib/help/mdxImport"
import { verifyTrainingImport } from "@/lib/help/importVerification"

async function readHelpMdxFiles(root: string): Promise<Array<{ filePath: string; content: string }>> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mdx"))
    .map((entry) => path.join(root, entry.name))
    .sort((a, b) => a.localeCompare(b))

  const rows: Array<{ filePath: string; content: string }> = []
  for (const filePath of files) {
    rows.push({ filePath, content: await fs.readFile(filePath, "utf8") })
  }

  return rows
}

async function main(): Promise<void> {
  const rows = await readHelpMdxFiles(path.join(process.cwd(), "content", "help"))
  const importedAtIso = new Date().toISOString()

  const sourceReport = buildMdxImportReport({
    files: rows,
    defaultAudience: "public",
    importedAtIso,
  })

  const dbRows = await prismaAdmin.trainingContent.findMany({
    where: {
      slug: { in: sourceReport.records.map((record) => record.slug) },
    },
    select: {
      slug: true,
      title: true,
      summary: true,
      lifecycleState: true,
      audience: true,
      content: true,
      _count: {
        select: { revisions: true },
      },
    },
    orderBy: { slug: "asc" },
  })

  const result = verifyTrainingImport({
    sourceReport,
    dbRows: dbRows.map((row) => ({
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      lifecycleState: row.lifecycleState,
      audience: row.audience,
      content: row.content,
      revisionCount: row._count.revisions,
    })),
  })

  console.log("=== Training Import Verification ===")
  console.log(`Expected guides: ${result.totalExpected}`)
  console.log(`DB guides found: ${result.totalFound}`)
  console.log(`Source issues: ${sourceReport.issues.length}`)

  if (result.issues.length === 0) {
    console.log("Verification passed: import records and rendering content are consistent.")
    return
  }

  console.error(`Verification failed with ${result.issues.length} issue(s):`)
  for (const issue of result.issues) {
    console.error(`- [${issue.check}] ${issue.slug}: ${issue.message}`)
  }

  process.exit(1)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('The table `public.training_content` does not exist') || message.includes('table `public.training_content` does not exist')) {
    console.error("Verification failed: the training_content tables are missing from the target database.")
    console.error("Run `npm run prisma:migrate:deploy` for the target canonical Supabase configuration before re-running this verification.")
    process.exit(1)
  }

  console.error("Verification failed:", message)
  process.exit(1)
})
