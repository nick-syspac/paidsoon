import { NextResponse } from "next/server"
import { z } from "zod"

import { withUserContext } from "@/lib/db/withUserContext"
import { getMissingRequiredMappingFields, isInvoiceImportCanonicalField } from "@/lib/invoiceImport/mapping"
import type { InvoiceImportCanonicalField } from "@/lib/invoiceImport/template"
import { createClient } from "@/lib/supabase/server"

type Params = { params: Promise<{ batchId: string }> }

const MappingRequestSchema = z.object({
  mapping: z.record(z.string().min(1), z.string().min(1)),
  duplicateMode: z.enum(["skip_existing", "update_eligible"]).optional(),
})

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  const { batchId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = MappingRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const invalidField = Object.values(parsed.data.mapping).find((field) => !isInvoiceImportCanonicalField(field))
  if (invalidField) {
    return NextResponse.json({ error: `Unknown target field: ${invalidField}` }, { status: 400 })
  }

  const mapping = parsed.data.mapping as Record<string, InvoiceImportCanonicalField>
  const missingFields = getMissingRequiredMappingFields(mapping)
  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: "Required fields are not mapped", missingFields },
      { status: 400 },
    )
  }

  const result = await withUserContext(user.id, async (tx) => {
    const batch = await tx.invoiceImportBatch.findFirst({
      where: { id: batchId, userId: user.id },
    })
    if (!batch) return { ok: false as const, reason: "not_found" as const }

    if (!["uploaded", "mapping"].includes(batch.status)) {
      return { ok: false as const, reason: "invalid_status" as const }
    }

    await tx.invoiceImportColumnMapping.deleteMany({ where: { batchId } })
    await tx.invoiceImportColumnMapping.createMany({
      data: Object.entries(mapping).map(([sourceColumn, targetField]) => ({
        batchId,
        sourceColumn,
        targetField,
      })),
    })

    const existingMapping =
      batch.mapping && typeof batch.mapping === "object" ? (batch.mapping as Record<string, unknown>) : {}

    const updated = await tx.invoiceImportBatch.update({
      where: { id: batchId },
      data: {
        status: "mapping",
        mapping: { ...existingMapping, mapping },
        ...(parsed.data.duplicateMode ? { duplicateMode: parsed.data.duplicateMode } : {}),
      },
    })

    return { ok: true as const, batch: updated }
  })

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Batch is not in a mappable state" }, { status: 409 })
  }

  return NextResponse.json({
    success: true,
    batchId: result.batch.id,
    status: result.batch.status,
    duplicateMode: result.batch.duplicateMode,
  })
}
