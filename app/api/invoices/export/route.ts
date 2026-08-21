import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { requireFeature } from "@/lib/billing"
import { ACTIVE_INVOICE_STATUSES, RESOLVED_INVOICE_STATUSES } from "@/lib/dashboard/loadDashboardInvoices"
import { parseInvoiceOverviewFilter } from "@/lib/dashboard/overviewCards"
import { loadInvoicesForExport } from "@/lib/invoices/exportQuery"
import {
  ExportRowLimitExceededError,
  buildExportFilename,
  generateExportCsv,
  generateExportXlsx,
} from "@/lib/invoices/export"
import { createServerTraceContext, traceOperation } from "@/lib/diagnostics/server"

const COMPONENT = "app/api/invoices/export/route.ts"

const KNOWN_STATUSES = new Set([...ACTIVE_INVOICE_STATUSES, ...RESOLVED_INVOICE_STATUSES])

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

const QuerySchema = z.object({
  format: z.enum(["csv", "xlsx"]),
  statusBucket: z.enum(["active", "resolved"]).optional(),
  overviewFilter: z.string().optional(),
  statuses: z.string().optional(),
  customerId: z.string().optional(),
  provider: z.string().optional(),
  dateField: z.enum(["due_date", "created_date"]).optional(),
  dateFrom: ISO_DATE.optional(),
  dateTo: ISO_DATE.optional(),
})

export async function GET(request: Request) {
  const traceContext = createServerTraceContext({
    headers: request.headers,
    cookieHeader: request.headers.get("cookie"),
  })

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
    statusBucket: searchParams.get("statusBucket") ?? undefined,
    overviewFilter: searchParams.get("overviewFilter") ?? undefined,
    statuses: searchParams.get("statuses") ?? undefined,
    customerId: searchParams.get("customerId") ?? undefined,
    provider: searchParams.get("provider") ?? undefined,
    dateField: searchParams.get("dateField") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid export request" }, { status: 400 })
  }

  const query = parsed.data

  const statuses = query.statuses
    ?.split(",")
    .map((status) => status.trim())
    .filter(Boolean)
  if (statuses && statuses.some((status) => !KNOWN_STATUSES.has(status))) {
    return NextResponse.json({ error: "Invalid export request" }, { status: 400 })
  }

  const overviewFilter = parseInvoiceOverviewFilter(query.overviewFilter)
  if (query.overviewFilter && !overviewFilter) {
    return NextResponse.json({ error: "Invalid export request" }, { status: 400 })
  }

  const hasFeature = await requireFeature(user.id, "csv_export")
  if (!hasFeature) {
    return NextResponse.json({ error: "Your plan does not include invoice export" }, { status: 403 })
  }

  try {
    const invoices = await traceOperation(
      traceContext,
      {
        traceId: traceContext.traceId,
        stage: "invoices.export.query",
        operation: "export_invoices",
        subsystem: "invoices",
        component: COMPONENT,
        tenant: { context: "user_rls" },
        inputs: {
          format: query.format,
          statusBucket: query.statusBucket ?? null,
          overviewFilter,
          hasCustomerFilter: Boolean(query.customerId),
          provider: query.provider ?? null,
          dateField: query.dateField ?? null,
        },
      },
      () =>
        loadInvoicesForExport({
          userId: user.id,
          statusBucket: query.statusBucket,
          overviewFilter,
          statuses,
          customerId: query.customerId,
          provider: query.provider,
          dateField: query.dateField,
          dateFrom: query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined,
          dateTo: query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined,
        }),
      { success: (result) => ({ outputs: { rowCount: result.length } }) },
    )

    const filename = buildExportFilename(query.format)

    if (query.format === "csv") {
      const body = generateExportCsv(invoices)
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-PaidSoon-Export-Row-Count": String(invoices.length),
        },
      })
    }

    const buffer = generateExportXlsx(invoices)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-PaidSoon-Export-Row-Count": String(invoices.length),
      },
    })
  } catch (error) {
    if (error instanceof ExportRowLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 413 })
    }
    console.error("[GET /api/invoices/export] error:", error)
    return NextResponse.json({ error: "Failed to generate export" }, { status: 500 })
  }
}
