import "./_loadEnvFiles"

import path from "node:path"
import { promises as fs } from "node:fs"
import {
  buildMdxImportReport,
  type ImportReport,
  type TrainingAudience,
} from "@/lib/help/mdxImport"
import type { Prisma } from "@/lib/generated/prisma/client"

type Mode = "dry-run" | "write"

interface CliOptions {
  mode: Mode
  defaultAudience: TrainingAudience
  changeNote: string
}

function parseArgs(argv: string[]): CliOptions {
  let mode: Mode = "dry-run"
  let defaultAudience: TrainingAudience = "public"
  let changeNote = "Initial import from content/help"

  for (const arg of argv) {
    if (arg === "--write") {
      mode = "write"
      continue
    }

    if (arg.startsWith("--default-audience=")) {
      const audience = arg.split("=")[1]
      if (audience === "public" || audience === "signed_in") {
        defaultAudience = audience
      } else {
        throw new Error(`Unsupported --default-audience value: ${audience}`)
      }
      continue
    }

    if (arg.startsWith("--change-note=")) {
      const value = arg.slice("--change-note=".length).trim()
      if (!value) {
        throw new Error("--change-note cannot be empty")
      }
      changeNote = value
      continue
    }

    if (arg === "--dry-run") {
      mode = "dry-run"
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return { mode, defaultAudience, changeNote }
}

async function readHelpMdxFiles(root: string): Promise<Array<{ filePath: string; content: string }>> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mdx"))
    .map((entry) => path.join(root, entry.name))
    .sort((a, b) => a.localeCompare(b))

  const rows: Array<{ filePath: string; content: string }> = []

  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8")
    rows.push({ filePath, content })
  }

  return rows
}

function printReport(report: ImportReport, mode: Mode): void {
  console.log("=== Training Help MDX Import Report ===")
  console.log(`Mode: ${mode}`)
  console.log(`Scanned: ${report.stats.scanned}`)
  console.log(`Importable records: ${report.stats.imported}`)
  console.log(`Skipped: ${report.stats.skipped}`)
  console.log(`Flagged guides: ${report.stats.flagged}`)

  if (report.issues.length === 0) {
    console.log("Issues: none")
    return
  }

  console.log(`Issues: ${report.issues.length}`)
  for (const issue of report.issues) {
    console.log(`- [${issue.kind}] ${issue.slug}: ${issue.message}`)
  }
}

async function runWrite(report: ImportReport, changeNote: string): Promise<void> {
  const actorUserId = process.env.TRAINING_IMPORT_ACTOR_USER_ID?.trim()
  if (!actorUserId) {
    throw new Error("TRAINING_IMPORT_ACTOR_USER_ID is required in --write mode")
  }

  if (process.env.TRAINING_IMPORT_ALLOW_WRITE !== "yes") {
    throw new Error("Set TRAINING_IMPORT_ALLOW_WRITE=yes to enable --write mode")
  }

  const { materializeSupabaseEnvironment } = await import(
    "@/lib/config/supabaseEnvironmentRuntime"
  )
  materializeSupabaseEnvironment({ mode: "database-admin" })
  const { prismaAdmin } = await import("@/lib/db/admin")
  for (const record of report.records) {
    const upserted = await prismaAdmin.trainingContent.upsert({
      where: { slug: record.slug },
      update: {
        title: record.title,
        summary: record.summary,
        content: record.content as Prisma.InputJsonValue,
        lifecycleState: "published",
        audience: record.audience,
        featureKey: null,
        routeHint: null,
        publishedAt: new Date(record.publishedAt),
        updatedBy: actorUserId,
      },
      create: {
        slug: record.slug,
        title: record.title,
        summary: record.summary,
        content: record.content as Prisma.InputJsonValue,
        lifecycleState: "published",
        audience: record.audience,
        featureKey: null,
        routeHint: null,
        publishedAt: new Date(record.publishedAt),
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    })

    const latest = await prismaAdmin.trainingRevision.findFirst({
      where: { trainingContentId: upserted.id },
      orderBy: { revisionNumber: "desc" },
      select: { revisionNumber: true },
    })

    await prismaAdmin.trainingRevision.create({
      data: {
        trainingContentId: upserted.id,
        revisionNumber: (latest?.revisionNumber ?? 0) + 1,
        snapshotState: "published",
        snapshot: {
          title: upserted.title,
          slug: upserted.slug,
          summary: upserted.summary,
          content: upserted.content,
          audience: upserted.audience,
          featureKey: upserted.featureKey,
          routeHint: upserted.routeHint,
          destinationKeys: upserted.destinationKeys,
          sourcePath: record.sourcePath,
        } as Prisma.InputJsonValue,
        changeNote,
        actorUserId,
      },
    })
  }

  console.log(`Write complete: upserted ${report.records.length} guides with revision snapshots.`)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const contentRoot = path.join(process.cwd(), "content", "help")

  const rows = await readHelpMdxFiles(contentRoot)
  const importedAtIso = new Date().toISOString()

  const report = buildMdxImportReport({
    files: rows,
    defaultAudience: options.defaultAudience,
    importedAtIso,
  })

  printReport(report, options.mode)

  if (options.mode === "write") {
    await runWrite(report, options.changeNote)
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error("Import failed:", message)
  process.exit(1)
})
