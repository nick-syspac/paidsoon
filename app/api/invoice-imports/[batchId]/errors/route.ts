import { NextResponse } from "next/server"

import { withUserContext } from "@/lib/db/withUserContext"
import { csvEscape } from "@/lib/invoiceImport/template"
import { createClient } from "@/lib/supabase/server"

type Params = { params: Promise<{ batchId: string }> }

const CSV_HEADER = ["row_number", "invoice_number", "field_name", "error_code", "severity", "message"]

export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  const { batchId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await withUserContext(user.id, async (tx) => {
    const batch = await tx.invoiceImportBatch.findFirst({
      where: { id: batchId, userId: user.id },
      select: { id: true },
    })
    if (!batch) return { ok: false as const }

    const errors = await tx.invoiceImportError.findMany({
      where: { batchId },
      orderBy: [{ rowNumber: "asc" }, { severity: "asc" }],
    })

    return { ok: true as const, errors }
  })

  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Sanitised export: only row/field identifiers and error metadata are
  // exposed here — never raw spreadsheet cell values (copilot-instructions.md).
  const format = new URL(request.url).searchParams.get("format")
  if (format === "csv") {
    const rows = result.errors.map((issue) =>
      [
        String(issue.rowNumber ?? ""),
        issue.invoiceNumber ?? "",
        issue.fieldName ?? "",
        issue.errorCode,
        issue.severity,
        issue.message,
      ]
        .map(csvEscape)
        .join(","),
    )
    const csv = [CSV_HEADER.join(","), ...rows].join("\n")

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="invoice-import-${batchId}-errors.csv"`,
      },
    })
  }

  return NextResponse.json({
    batchId,
    errors: result.errors.map((issue) => ({
      rowNumber: issue.rowNumber,
      invoiceNumber: issue.invoiceNumber,
      fieldName: issue.fieldName,
      errorCode: issue.errorCode,
      severity: issue.severity,
      message: issue.message,
    })),
  })
}
