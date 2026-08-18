import { createHash } from "node:crypto"

import { NextResponse } from "next/server"
import { z } from "zod"

import { withUserContext } from "@/lib/db/withUserContext"
import { parseInvoiceImportFile } from "@/lib/invoiceImport/parser"
import { INVOICE_IMPORT_TEMPLATE_VERSION } from "@/lib/invoiceImport/template"
import { createClient } from "@/lib/supabase/server"

const UploadRequestSchema = z.object({
  file: z.instanceof(File).optional(),
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

    const parsed = UploadRequestSchema.safeParse({ file: formData.get("file") })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const uploadedFile = parsed.data.file
    if (!uploadedFile) {
      return NextResponse.json({ error: "A spreadsheet file is required" }, { status: 400 })
    }

    const buffer = Buffer.from(await uploadedFile.arrayBuffer())
    const parsedFile = parseInvoiceImportFile(buffer, uploadedFile.name)
    const contentHash = createHash("sha256").update(buffer).digest("hex")

    const batch = await withUserContext(user.id, async (tx) =>
      tx.invoiceImportBatch.create({
        data: {
          userId: user.id,
          fileName: uploadedFile.name,
          fileType: parsedFile.fileType,
          fileSizeBytes: buffer.length,
          contentHash,
          schemaVersion: INVOICE_IMPORT_TEMPLATE_VERSION,
          status: "uploaded",
          rowsTotal: parsedFile.rows.length,
          rowsValid: parsedFile.rows.length,
          mapping: {
            columns: parsedFile.columns,
            detectedColumns: parsedFile.columns,
          },
        },
      }),
    )

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      fileType: batch.fileType,
      fileName: batch.fileName,
      rowsTotal: batch.rowsTotal,
      status: batch.status,
      schemaVersion: batch.schemaVersion,
    })
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("[POST /api/invoice-imports/upload] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
