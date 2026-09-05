import { InvoiceExportClient } from "@/components/settings/InvoiceExportClient"
import { InvoiceImportClient } from "@/components/settings/InvoiceImportClient"
import { ExpenseImportClient } from "@/components/settings/ExpenseImportClient"
import type { ReactElement } from "react"

type InvoiceImportBatchSummary = {
  id: string
  fileName: string
  fileType: string
  status: string
  duplicateMode: string
  rowsTotal: number
  rowsValid: number
  rowsWarning: number
  rowsFailed: number
  rowsSkipped: number
  createdAt: string
  validatedAt: string | null
  completedAt: string | null
}

type ExportCustomer = { id: string; label: string }

interface ImportExportSettingsViewProps {
  initialBatches: InvoiceImportBatchSummary[]
  canExport: boolean
  exportCustomers: ExportCustomer[]
}

export function ImportExportSettingsView({
  initialBatches,
  canExport,
  exportCustomers,
}: ImportExportSettingsViewProps): ReactElement {
  return (
    <div className="space-y-8">
      <section id="invoice-import" className="scroll-mt-24 space-y-3">
        <InvoiceImportClient initialBatches={initialBatches} />
      </section>

      <section id="expense-import" className="scroll-mt-24 space-y-3">
        <ExpenseImportClient />
      </section>

      <section id="invoice-export" className="scroll-mt-24 space-y-3">
        {canExport ? (
          <InvoiceExportClient customers={exportCustomers} />
        ) : (
          <div className="max-w-lg space-y-4">
            <h2 className="text-base font-medium text-gray-900">Invoice exports</h2>
            <p className="text-sm text-gray-500">
              Export your invoices to CSV or XLSX with custom filters — available on the Small Business plan and above.
            </p>
            <a
              href="/dashboard/settings/subscription"
              className="inline-block bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Upgrade now
            </a>
          </div>
        )}
      </section>
    </div>
  )
}
