import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { createClient } from "@/lib/supabase/server"
import {
  buildMarginGuardExportFilename,
  generateMarginGuardExportCsv,
  generateMarginGuardExportXlsx,
  loadMarginGuardExport,
  MarginGuardExportRowLimitExceededError,
  type MarginGuardExportDataset,
} from "@/lib/marginguard/export"
import { requireMarginGuardCoreAccess } from "@/lib/marginguard/entitlements"

const QuerySchema = z.object({
  format: z.enum(["csv", "xlsx"]),
  dataset: z.enum(["summary", "customers", "alerts", "opportunities"]),
  period: z.enum(["30d", "3m", "6m", "12m", "fy"]).optional(),
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
    dataset: searchParams.get("dataset") ?? undefined,
    period: searchParams.get("period") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid export request" }, { status: 400 })
  }

  const hasFeature = await requireFeature(user.id, "csv_export")
  if (!hasFeature) {
    return NextResponse.json({ error: "Your plan does not include MarginGuard export" }, { status: 403 })
  }

  try {
    await requireMarginGuardCoreAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  try {
    const query = parsed.data
    const payload = await loadMarginGuardExport({
      userId: user.id,
      dataset: query.dataset as MarginGuardExportDataset,
      period: query.period,
    })

    const filename = buildMarginGuardExportFilename(query.dataset, query.format)

    if (query.format === "csv") {
      const body = generateMarginGuardExportCsv(payload)
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"${filename}\"`,
          "X-PaidSoon-MarginGuard-Export-Row-Count": String(payload.rows.length),
        },
      })
    }

    const buffer = generateMarginGuardExportXlsx(payload, query.dataset)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "X-PaidSoon-MarginGuard-Export-Row-Count": String(payload.rows.length),
      },
    })
  } catch (error) {
    if (error instanceof MarginGuardExportRowLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 413 })
    }

    console.error("[GET /api/margin-guard/export] error:", error)
    return NextResponse.json({ error: "Failed to generate export" }, { status: 500 })
  }
}
