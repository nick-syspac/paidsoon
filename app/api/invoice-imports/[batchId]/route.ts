import { NextResponse } from "next/server"

import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

type Params = { params: Promise<{ batchId: string }> }

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const { batchId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const batch = await withUserContext(user.id, (tx) =>
    tx.invoiceImportBatch.findFirst({ where: { id: batchId, userId: user.id } }),
  )

  if (!batch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const mappingMeta =
    batch.mapping && typeof batch.mapping === "object" ? (batch.mapping as Record<string, unknown>) : {}

  return NextResponse.json({
    batchId: batch.id,
    fileName: batch.fileName,
    fileType: batch.fileType,
    status: batch.status,
    duplicateMode: batch.duplicateMode,
    schemaVersion: batch.schemaVersion,
    worksheetName: batch.worksheetName,
    dateFormat: batch.dateFormat,
    numberFormat: batch.numberFormat,
    defaultCurrency: batch.defaultCurrency,
    rowsTotal: batch.rowsTotal,
    rowsValid: batch.rowsValid,
    rowsWarning: batch.rowsWarning,
    rowsSkipped: batch.rowsSkipped,
    rowsFailed: batch.rowsFailed,
    failureReason: batch.failureReason,
    createdAt: batch.createdAt,
    validatedAt: batch.validatedAt,
    startedAt: batch.startedAt,
    completedAt: batch.completedAt,
    updatedAt: batch.updatedAt,
    sourceColumns: mappingMeta.sourceColumns ?? [],
    suggestions: mappingMeta.suggestions ?? [],
    mapping: mappingMeta.mapping ?? {},
    commitResult: mappingMeta.commitResult ?? null,
  })
}
