import { NextResponse } from "next/server"

import { withUserContext } from "@/lib/db/withUserContext"
import {
  applySpendImportMapping,
  getMissingRequiredSpendMappingFields,
  validateSpendImportRow,
} from "@/lib/spendImport/mapping"
import type { SpendImportCanonicalField } from "@/lib/spendImport/template"
import { createClient } from "@/lib/supabase/server"
import { Prisma } from "@/lib/generated/prisma/client"

type Params = { params: Promise<{ batchId: string }> }

const PREVIEW_ROW_LIMIT = 20

export async function POST(_request: Request, { params }: Params): Promise<NextResponse> {
  const { batchId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await withUserContext(user.id, async (tx) => {
    const batch = await tx.spendImportBatch.findFirst({ where: { id: batchId, userId: user.id } })
    if (!batch) return { ok: false as const, reason: "not_found" as const }

    if (!["mapping", "validated"].includes(batch.status)) {
      return { ok: false as const, reason: "invalid_status" as const }
    }

    const columnMappings = await tx.spendImportColumnMapping.findMany({ where: { batchId } })
    if (columnMappings.length === 0) {
      return { ok: false as const, reason: "no_mapping" as const }
    }

    const mapping = Object.fromEntries(
      columnMappings.map((entry) => [entry.sourceColumn, entry.targetField as SpendImportCanonicalField]),
    )

    const missingFields = getMissingRequiredSpendMappingFields(mapping)
    if (missingFields.length > 0) {
      return { ok: false as const, reason: "missing_required_fields" as const, missingFields }
    }

    const stagingRows = await tx.spendImportStagingRow.findMany({
      where: { batchId },
      orderBy: { rowNumber: "asc" },
    })

    await tx.spendImportError.deleteMany({ where: { batchId } })

    let validRows = 0
    let warningRows = 0
    let errorRows = 0

    const previewRows: Array<{
      rowNumber: number
      status: string
      values: Partial<Record<SpendImportCanonicalField, string>>
      issues: Array<{ field: string; severity: string; code: string; message: string }>
    }> = []

    for (const stagingRow of stagingRows) {
      const raw = (stagingRow.raw ?? {}) as Record<string, string>
      const values = applySpendImportMapping(raw, mapping)
      const issues = validateSpendImportRow(values, stagingRow.rowNumber)

      const hasError = issues.some((issue) => issue.severity === "error")
      const hasWarning = issues.some((issue) => issue.severity === "warning")
      const status = hasError ? "error" : hasWarning ? "warning" : "valid"

      if (hasError) errorRows += 1
      else if (hasWarning) warningRows += 1
      else validRows += 1

      await tx.spendImportStagingRow.update({
        where: { id: stagingRow.id },
        data: {
          normalized: values as Prisma.InputJsonValue,
          validationErrors: issues.length > 0 ? (issues as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          status,
        },
      })

      if (issues.length > 0) {
        await tx.spendImportError.createMany({
          data: issues.map((issue) => ({
            batchId,
            rowNumber: issue.rowNumber,
            fieldName: issue.field,
            errorCode: issue.code,
            message: issue.message,
            severity: issue.severity,
          })),
        })
      }

      if (previewRows.length < PREVIEW_ROW_LIMIT) {
        previewRows.push({
          rowNumber: stagingRow.rowNumber,
          status,
          values,
          issues: issues.map((issue) => ({
            field: issue.field,
            severity: issue.severity,
            code: issue.code,
            message: issue.message,
          })),
        })
      }
    }

    const nextStatus = errorRows > 0 ? "mapping" : "validated"
    const updated = await tx.spendImportBatch.update({
      where: { id: batchId },
      data: {
        status: nextStatus,
        rowsTotal: stagingRows.length,
        rowsValid: validRows,
        rowsWarning: warningRows,
        rowsFailed: errorRows,
        validatedAt: nextStatus === "validated" ? new Date() : null,
      },
    })

    return { ok: true as const, batch: updated, previewRows }
  })

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    if (result.reason === "no_mapping" || result.reason === "missing_required_fields") {
      return NextResponse.json(
        {
          error: "Column mapping is incomplete",
          missingFields: "missingFields" in result ? result.missingFields : undefined,
        },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: "Batch is not ready for validation" }, { status: 409 })
  }

  return NextResponse.json({
    success: true,
    batchId: result.batch.id,
    status: result.batch.status,
    rowsTotal: result.batch.rowsTotal,
    rowsValid: result.batch.rowsValid,
    rowsWarning: result.batch.rowsWarning,
    rowsFailed: result.batch.rowsFailed,
    previewRows: result.previewRows,
  })
}
