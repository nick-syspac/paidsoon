import { createHash } from "node:crypto"

import { NextResponse } from "next/server"
import { z } from "zod"

import { withUserContext } from "@/lib/db/withUserContext"
import { inferSpendImportColumnMapping } from "@/lib/spendImport/mapping"
import { parseSpendImportFile } from "@/lib/spendImport/parser"
import { SPEND_IMPORT_TEMPLATE_VERSION } from "@/lib/spendImport/template"
import { createClient } from "@/lib/supabase/server"

const UploadRequestSchema = z.object({
  file: z.instanceof(File).optional(),
  defaultCurrency: z.string().trim().length(3).optional(),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData().catch(() => null)
    if (!formData) {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
    }

    const parsed = UploadRequestSchema.safeParse({
      file: formData.get("file"),
      defaultCurrency: typeof formData.get("defaultCurrency") === "string" ? formData.get("defaultCurrency") : undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const uploadedFile = parsed.data.file
    if (!uploadedFile) {
      return NextResponse.json({ error: "A CSV or XLSX expense file is required" }, { status: 400 })
    }

    const lowerName = uploadedFile.name.toLowerCase()
    if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "Only CSV and XLSX expense imports are supported" },
        { status: 400 },
      )
    }

    const buffer = Buffer.from(await uploadedFile.arrayBuffer())
    const parsedFile = parseSpendImportFile(buffer, uploadedFile.name)
    const contentHash = createHash("sha256").update(buffer).digest("hex")
    const suggestions = inferSpendImportColumnMapping(parsedFile.sourceColumns)

    const batch = await withUserContext(user.id, async (tx) => {
      const created = await tx.spendImportBatch.create({
        data: {
          userId: user.id,
          fileName: uploadedFile.name,
          fileType: parsedFile.fileType,
          fileSizeBytes: buffer.length,
          contentHash,
          schemaVersion: SPEND_IMPORT_TEMPLATE_VERSION,
          worksheetName: parsedFile.worksheetName,
          defaultCurrency: parsed.data.defaultCurrency?.toUpperCase() ?? null,
          status: "uploaded",
          rowsTotal: parsedFile.rows.length,
          rowsValid: parsedFile.rows.length,
          mapping: {
            sourceColumns: parsedFile.sourceColumns,
            suggestions,
          },
        },
      })

      if (parsedFile.rows.length > 0) {
        await tx.spendImportStagingRow.createMany({
          data: parsedFile.rows.map((row) => ({
            batchId: created.id,
            rowNumber: row.rowNumber,
            raw: row.raw,
            status: "pending",
          })),
        })
      }

      return created
    })

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      fileType: batch.fileType,
      fileName: batch.fileName,
      rowsTotal: batch.rowsTotal,
      status: batch.status,
      schemaVersion: batch.schemaVersion,
      sourceColumns: parsedFile.sourceColumns,
      suggestions,
    })
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("[POST /api/spend-imports/upload] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
