import { InvoiceExportClient } from "@/components/settings/InvoiceExportClient"
import { InvoiceImportClient } from "@/components/settings/InvoiceImportClient"
import { ExpenseImportClient } from "@/components/settings/ExpenseImportClient"
import { CommitGuardSettingsTransferClient } from "@/components/settings/CommitGuardSettingsTransferClient"
import { MarginGuardExportClient } from "@/components/settings/MarginGuardExportClient"
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

type SpendImportBatchSummary = {
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
  initialSpendBatches: SpendImportBatchSummary[]
  canExport: boolean
  canManageMarginGuard: boolean
  canManageCommitGuard: boolean
  exportCustomers: ExportCustomer[]
}

export function ImportExportSettingsView({
  initialBatches,
  initialSpendBatches,
  canExport,
  canManageMarginGuard,
  canManageCommitGuard,
  exportCustomers,
}: ImportExportSettingsViewProps): ReactElement {
  return (
    <div className="space-y-8">
      <section id="invoice-import" className="scroll-mt-24 space-y-3">
        <InvoiceImportClient initialBatches={initialBatches} />
      </section>

      <section id="expense-import" className="scroll-mt-24 space-y-3">
        <ExpenseImportClient initialBatches={initialSpendBatches} />
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

      {canManageMarginGuard && canExport ? (
        <section id="marginguard-export" className="scroll-mt-24 space-y-3">
          <MarginGuardExportClient />
        </section>
      ) : canManageMarginGuard ? (
        <section id="marginguard-export" className="scroll-mt-24 space-y-3">
          <div className="max-w-lg space-y-4">
            <h2 className="text-base font-medium text-gray-900">MarginGuard exports</h2>
            <p className="text-sm text-gray-500">
              MarginGuard CSV/XLSX exports are available on plans that include export entitlement.
            </p>
            <a
              href="/dashboard/settings/subscription"
              className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Upgrade now
            </a>
          </div>
        </section>
      ) : null}

      {canManageCommitGuard ? (
        <section id="commitguard-settings" className="scroll-mt-24 space-y-3">
          <CommitGuardSettingsTransferClient />
        </section>
      ) : null}
    </div>
  )
}
