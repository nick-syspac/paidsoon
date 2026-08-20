/**
 * GET /api/cron/invoice-import-cleanup
 *
 * Vercel Cron job: enforces the spreadsheet-import retention policy
 * (openspec change add-csv-xlsx-invoice-import, "Tenant-safe import
 * lifecycle" requirement). Runs daily (see vercel.json).
 *
 * - Batches that reached a terminal state (completed/failed/cancelled) more
 *   than INVOICE_IMPORT_TERMINAL_CLEANUP_HOURS ago have their staging rows
 *   and error rows purged. Batch metadata is kept for audit history.
 * - Batches abandoned before ever reaching a terminal state (no activity for
 *   INVOICE_IMPORT_ABANDONED_HOURS) are marked "cancelled" and purged the
 *   same way.
 *
 * Security: authenticated via CRON_SECRET Bearer token.
 * Uses prismaAdmin (cron context — RLS bypass is intentional).
 */
import { NextResponse } from "next/server"

import { prismaAdmin } from "@/lib/db/admin"
import {
  INVOICE_IMPORT_ABANDONED_HOURS,
  INVOICE_IMPORT_TERMINAL_CLEANUP_HOURS,
  INVOICE_IMPORT_TERMINAL_STATUSES,
  planInvoiceImportRetention,
} from "@/lib/invoiceImport/retention"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const terminalThreshold = new Date(now.getTime() - INVOICE_IMPORT_TERMINAL_CLEANUP_HOURS * 3_600_000)
  const abandonedThreshold = new Date(now.getTime() - INVOICE_IMPORT_ABANDONED_HOURS * 3_600_000)

  // Bounded by staging rows still existing (once purged, a batch drops out
  // of this query on future runs) and by the older of the two thresholds.
  const candidates = await prismaAdmin.invoiceImportBatch.findMany({
    where: {
      stagingRows: { some: {} },
      OR: [
        { status: { in: [...INVOICE_IMPORT_TERMINAL_STATUSES] }, updatedAt: { lte: terminalThreshold } },
        { status: { notIn: [...INVOICE_IMPORT_TERMINAL_STATUSES] }, updatedAt: { lte: abandonedThreshold } },
      ],
    },
    select: { id: true, status: true, completedAt: true, updatedAt: true },
  })

  const actions = planInvoiceImportRetention(candidates, now)

  let purged = 0
  let markedAbandoned = 0

  for (const action of actions) {
    if (action.action === "mark_abandoned_and_purge") {
      await prismaAdmin.invoiceImportBatch.update({
        where: { id: action.batchId },
        data: { status: "cancelled", failureReason: "abandoned_no_activity" },
      })
      markedAbandoned += 1
    }

    await prismaAdmin.invoiceImportStagingRow.deleteMany({ where: { batchId: action.batchId } })
    await prismaAdmin.invoiceImportError.deleteMany({ where: { batchId: action.batchId } })
    purged += 1
  }

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    candidates: candidates.length,
    purged,
    markedAbandoned,
  })
}
