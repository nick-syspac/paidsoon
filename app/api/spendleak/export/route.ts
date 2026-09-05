import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import {
  buildSpendLeakExportFilename,
  generateSpendLeakExportCsv,
  generateSpendLeakExportXlsx,
  SpendLeakExportRowLimitExceededError,
} from "@/lib/spendleak/export"
import {
  loadSpendLeakFindingsForExport,
  parseSpendLeakExportModule,
} from "@/lib/spendleak/exportQuery"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  format: z.enum(["csv", "xlsx"]),
  module: z.string().optional(),
})

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    format: searchParams.get("format") ?? undefined,
    module: searchParams.get("module") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid export request" }, { status: 400 })
  }

  const moduleFilter = parseSpendLeakExportModule(parsed.data.module)
  if (parsed.data.module && !moduleFilter) {
    return NextResponse.json({ error: "Invalid export request" }, { status: 400 })
  }

  const hasFeature = await requireFeature(user.id, "csv_export")
  if (!hasFeature) {
    return NextResponse.json({ error: "Your plan does not include SpendLeak report export" }, { status: 403 })
  }

  try {
    const findings = await loadSpendLeakFindingsForExport({
      userId: user.id,
      module: moduleFilter,
    })

    const filename = buildSpendLeakExportFilename(parsed.data.format)

    if (parsed.data.format === "csv") {
      const body = generateSpendLeakExportCsv(findings)
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-PaidSoon-SpendLeak-Export-Row-Count": String(findings.length),
        },
      })
    }

    const buffer = generateSpendLeakExportXlsx(findings)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-PaidSoon-SpendLeak-Export-Row-Count": String(findings.length),
      },
    })
  } catch (error) {
    if (error instanceof SpendLeakExportRowLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 413 })
    }

    console.error("[GET /api/spendleak/export] error:", error)
    return NextResponse.json({ error: "Failed to generate export" }, { status: 500 })
  }
}
