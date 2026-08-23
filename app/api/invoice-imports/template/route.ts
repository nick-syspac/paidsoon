import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { buildCsvTemplateContent, INVOICE_IMPORT_TEMPLATE_VERSION } from "@/lib/invoiceImport/template"

const QuerySchema = z.object({
  format: z.enum(["csv"]).default("csv"),
})

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = QuerySchema.safeParse({
      format: searchParams.get("format") ?? "csv",
    })

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const body = buildCsvTemplateContent()
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="paidsoon-invoice-import-template.csv"',
        "X-PaidSoon-Import-Schema": INVOICE_IMPORT_TEMPLATE_VERSION,
      },
    })
  } catch (error) {
    console.error("[GET /api/invoice-imports/template] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
