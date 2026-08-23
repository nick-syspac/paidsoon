"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Spinner } from "@/components/ui/Spinner"
import { INVOICE_IMPORT_CANONICAL_FIELDS } from "@/lib/invoiceImport/template"

type ImportBatchSummary = {
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

type MappingSuggestion = { sourceColumn: string; targetField: string; suggested: boolean }

type PreviewIssue = { field: string; severity: string; code: string; message: string }
type PreviewRow = {
  rowNumber: number
  status: string
  values: Record<string, string>
  issues: PreviewIssue[]
}

type ValidationSummary = {
  rowsTotal: number
  rowsValid: number
  rowsWarning: number
  rowsFailed: number
  previewRows: PreviewRow[]
}

type CommitSummary = { invoicesCreated: number; invoicesUpdated: number; invoicesSkipped: number }

type DuplicateMode = "skip_existing" | "update_eligible"

type WizardStep = "idle" | "mapping" | "validated" | "confirmed"

const IGNORE_VALUE = ""
const LAUNCH_SAFE_IMPORT_ERROR = "Only CSV invoice imports are supported for launch"

const STATUS_BADGES: Record<string, string> = {
  uploaded: "bg-gray-100 text-gray-600",
  mapping: "bg-blue-100 text-blue-800",
  validated: "bg-blue-100 text-blue-800",
  processing: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
}

function humanizeField(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGES[status] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {humanizeField(status)}
    </span>
  )
}

export function InvoiceImportClient({ initialBatches }: { initialBatches: ImportBatchSummary[] }) {
  const router = useRouter()
  const [batches, setBatches] = useState(initialBatches)
  const [step, setStep] = useState<WizardStep>("idle")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [batchId, setBatchId] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [sourceColumns, setSourceColumns] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip_existing")
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [savingMapping, setSavingMapping] = useState(false)

  const [validation, setValidation] = useState<ValidationSummary | null>(null)
  const [committing, setCommitting] = useState(false)
  const [commitResult, setCommitResult] = useState<CommitSummary | null>(null)

  async function refreshHistory() {
    const res = await fetch("/api/invoice-imports")
    if (res.ok) {
      const data = await res.json()
      setBatches(data.batches)
    }
  }

  function resetWizard() {
    setStep("idle")
    setBatchId(null)
    setFileName(null)
    setSourceColumns([])
    setMapping({})
    setDuplicateMode("skip_existing")
    setMissingFields([])
    setValidation(null)
    setCommitResult(null)
    setError(null)
  }

  async function handleFileSelected(file: File) {
    setError(null)
    setUploading(true)
    try {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setError(LAUNCH_SAFE_IMPORT_ERROR)
        return
      }

      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/invoice-imports/upload", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Upload failed")
        return
      }

      const initialMapping: Record<string, string> = {}
      for (const suggestion of data.suggestions as MappingSuggestion[]) {
        initialMapping[suggestion.sourceColumn] = suggestion.targetField
      }

      setBatchId(data.batchId)
      setFileName(data.fileName)
      setSourceColumns(data.sourceColumns)
      setMapping(initialMapping)
      setStep("mapping")
    } finally {
      setUploading(false)
    }
  }

  async function handleContinueToValidation() {
    if (!batchId) return
    setError(null)
    setMissingFields([])
    setSavingMapping(true)
    try {
      const cleanMapping = Object.fromEntries(
        Object.entries(mapping).filter(([, targetField]) => targetField !== IGNORE_VALUE),
      )

      const mappingRes = await fetch(`/api/invoice-imports/${batchId}/mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping: cleanMapping, duplicateMode }),
      })
      const mappingData = await mappingRes.json()
      if (!mappingRes.ok) {
        setError(mappingData.error ?? "Could not save column mapping")
        if (mappingData.missingFields) setMissingFields(mappingData.missingFields)
        return
      }

      const validateRes = await fetch(`/api/invoice-imports/${batchId}/validate`, { method: "POST" })
      const validateData = await validateRes.json()
      if (!validateRes.ok) {
        setError(validateData.error ?? "Validation failed")
        return
      }

      setValidation({
        rowsTotal: validateData.rowsTotal,
        rowsValid: validateData.rowsValid,
        rowsWarning: validateData.rowsWarning,
        rowsFailed: validateData.rowsFailed,
        previewRows: validateData.previewRows,
      })
      setStep("validated")
    } finally {
      setSavingMapping(false)
    }
  }

  async function handleCommit() {
    if (!batchId) return
    setError(null)
    setCommitting(true)
    try {
      const res = await fetch(`/api/invoice-imports/${batchId}/commit`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Import failed")
        return
      }

      setCommitResult({
        invoicesCreated: data.invoicesCreated,
        invoicesUpdated: data.invoicesUpdated,
        invoicesSkipped: data.invoicesSkipped,
      })
      setStep("confirmed")
      await refreshHistory()
      router.refresh()
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Import invoices from CSV</h2>
        <p className="text-sm text-gray-500 mt-1">
          Bring in overdue invoices from a CSV file. Imported invoices enter the normal reminder
          workflow and continue on the same chasing schedule once the import is committed.
        </p>
      </div>

      {step === "idle" && (
        <UploadStep uploading={uploading} error={error} onFileSelected={handleFileSelected} />
      )}

      {step === "mapping" && (
        <MappingStep
          fileName={fileName}
          sourceColumns={sourceColumns}
          mapping={mapping}
          onMappingChange={setMapping}
          duplicateMode={duplicateMode}
          onDuplicateModeChange={setDuplicateMode}
          missingFields={missingFields}
          error={error}
          saving={savingMapping}
          onCancel={resetWizard}
          onContinue={handleContinueToValidation}
        />
      )}

      {step === "validated" && validation && (
        <ValidationStep
          validation={validation}
          error={error}
          committing={committing}
          onBack={() => setStep("mapping")}
          onCommit={handleCommit}
          onDownloadErrors={() => {
            if (batchId) window.open(`/api/invoice-imports/${batchId}/errors?format=csv`, "_blank")
          }}
        />
      )}

      {step === "confirmed" && commitResult && (
        <ConfirmationStep result={commitResult} onStartAnother={resetWizard} />
      )}

      <ImportHistory batches={batches} onRefresh={refreshHistory} />
    </div>
  )
}

function UploadStep({
  uploading,
  error,
  onFileSelected,
}: {
  uploading: boolean
  error: string | null
  onFileSelected: (file: File) => void
}) {
  return (
    <div className="space-y-4">
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-gray-900">1. Download a template</p>
        <p className="text-sm text-gray-500">
          Start from our template so your columns match up automatically. Sample rows use
          fictional data &mdash; delete them before adding your own.
        </p>
        <div className="flex gap-2">
          <Link
            href="/api/invoice-imports/template?format=csv"
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Download CSV template
          </Link>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-gray-900">2. Upload your file</p>
        <p className="text-sm text-gray-500">CSV only, up to 5MB.</p>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onFileSelected(file)
            event.target.value = ""
          }}
          className="block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700"
        />
        {uploading && (
          <p className="flex items-center gap-2 text-xs text-gray-500">
            <Spinner /> Uploading and scanning file&hellip;
          </p>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

function MappingStep({
  fileName,
  sourceColumns,
  mapping,
  onMappingChange,
  duplicateMode,
  onDuplicateModeChange,
  missingFields,
  error,
  saving,
  onCancel,
  onContinue,
}: {
  fileName: string | null
  sourceColumns: string[]
  mapping: Record<string, string>
  onMappingChange: (mapping: Record<string, string>) => void
  duplicateMode: DuplicateMode
  onDuplicateModeChange: (mode: DuplicateMode) => void
  missingFields: string[]
  error: string | null
  saving: boolean
  onCancel: () => void
  onContinue: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">
          3. Review column mapping{fileName ? ` — ${fileName}` : ""}
        </p>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">
          Cancel and start over
        </button>
      </div>

      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {sourceColumns.map((sourceColumn) => (
          <div key={sourceColumn} className="flex items-center justify-between px-4 py-2 gap-4">
            <span className="text-sm text-gray-700 truncate">{sourceColumn}</span>
            <select
              value={mapping[sourceColumn] ?? IGNORE_VALUE}
              onChange={(event) => onMappingChange({ ...mapping, [sourceColumn]: event.target.value })}
              className="text-sm border border-gray-300 rounded-md px-2 py-1"
            >
              <option value={IGNORE_VALUE}>Ignore this column</option>
              {INVOICE_IMPORT_CANONICAL_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {humanizeField(field)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="border border-gray-200 rounded-lg p-4 space-y-2">
        <p className="text-sm font-medium text-gray-900">Duplicate invoices</p>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="radio"
            checked={duplicateMode === "skip_existing"}
            onChange={() => onDuplicateModeChange("skip_existing")}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Skip existing invoices</span> &mdash; rows that match
            an invoice PaidSoon already tracks are left untouched.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="radio"
            checked={duplicateMode === "update_eligible"}
            onChange={() => onDuplicateModeChange("update_eligible")}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Update eligible existing invoices</span> &mdash;
            refresh amount, due date, and contact details for invoices that aren&rsquo;t already
            paid or resolved. Reminder status is never changed.
          </span>
        </label>
      </div>

      {missingFields.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2 text-xs text-yellow-800">
          Please map required fields: {missingFields.map(humanizeField).join(", ")}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={onContinue}
        disabled={saving}
        className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Validating…" : "Continue to validation"}
      </button>
    </div>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${tone ?? "text-gray-900"}`}>{value}</p>
    </div>
  )
}

function ValidationStep({
  validation,
  error,
  committing,
  onBack,
  onCommit,
  onDownloadErrors,
}: {
  validation: ValidationSummary
  error: string | null
  committing: boolean
  onBack: () => void
  onCommit: () => void
  onDownloadErrors: () => void
}) {
  const canCommit = validation.rowsFailed === 0 && validation.rowsTotal > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">4. Review validation results</p>
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-700">
          ← Edit mapping
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryTile label="Total rows" value={validation.rowsTotal} />
        <SummaryTile label="Valid" value={validation.rowsValid} tone="text-green-700" />
        <SummaryTile label="Warnings" value={validation.rowsWarning} tone="text-yellow-700" />
        <SummaryTile label="Blocking errors" value={validation.rowsFailed} tone="text-red-700" />
      </div>

      {validation.rowsFailed > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700 flex items-center justify-between gap-3">
          <span>
            {validation.rowsFailed} row{validation.rowsFailed === 1 ? "" : "s"} have blocking
            errors and must be fixed in your file before you can import. Nothing has been
            imported yet.
          </span>
          <button onClick={onDownloadErrors} className="shrink-0 underline">
            Download error report
          </button>
        </div>
      )}

      {validation.rowsTotal === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2 text-xs text-yellow-800">
          No data rows were found in this file.
        </div>
      )}

      {validation.previewRows.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Row</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Invoice #</th>
                <th className="px-3 py-2 text-left">Amount outstanding</th>
                <th className="px-3 py-2 text-left">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {validation.previewRows.map((row) => (
                <tr key={row.rowNumber}>
                  <td className="px-3 py-2 text-gray-500">{row.rowNumber}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        row.status === "error"
                          ? "text-red-700"
                          : row.status === "warning"
                          ? "text-yellow-700"
                          : "text-green-700"
                      }
                    >
                      {humanizeField(row.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{row.values.customer_name ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{row.values.invoice_number ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{row.values.amount_outstanding ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {row.issues.map((issue) => issue.message).join("; ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-gray-400">
            Showing the first {validation.previewRows.length} rows of {validation.rowsTotal}.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-xs text-blue-700">
        Importing does not send any reminder emails. Every imported invoice is added paused
        &mdash; you decide when (or whether) to resume follow-ups.
      </div>

      <button
        onClick={onCommit}
        disabled={!canCommit || committing}
        className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {committing ? "Importing…" : "Import invoices"}
      </button>
    </div>
  )
}

function ConfirmationStep({
  result,
  onStartAnother,
}: {
  result: CommitSummary
  onStartAnother: () => void
}) {
  return (
    <div className="border border-green-200 bg-green-50 rounded-lg p-5 space-y-3">
      <p className="text-sm font-medium text-green-900">Import complete</p>
      <p className="text-sm text-green-800">
        {result.invoicesCreated} invoice{result.invoicesCreated === 1 ? "" : "s"} created,{" "}
        {result.invoicesUpdated} updated, and {result.invoicesSkipped} skipped.
      </p>
      <div className="bg-white border border-green-200 rounded-md px-3 py-2 text-xs text-gray-700">
        No reminder emails were sent. Imported invoices are paused by default &mdash; visit{" "}
        <a href="/dashboard/invoices" className="text-blue-600 hover:underline">
          Invoices
        </a>{" "}
        to review them and explicitly resume follow-ups when you&rsquo;re ready.
      </div>
      <div className="flex gap-2">
        <a
          href="/dashboard/invoices"
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Go to Invoices
        </a>
        <button
          onClick={onStartAnother}
          className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Import another file
        </button>
      </div>
    </div>
  )
}

function ImportHistory({
  batches,
  onRefresh,
}: {
  batches: ImportBatchSummary[]
  onRefresh: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">Import history</p>
        <button onClick={onRefresh} className="text-xs text-gray-500 hover:text-gray-700">
          Refresh
        </button>
      </div>

      {batches.length === 0 ? (
        <p className="text-sm text-gray-400">No imports yet.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {batches.map((batch) => (
            <div key={batch.id} className="flex items-center justify-between px-4 py-3 gap-4">
              <div className="min-w-0">
                <p className="text-sm text-gray-900 truncate">{batch.fileName}</p>
                <p className="text-xs text-gray-500">
                  {new Date(batch.createdAt).toLocaleString()} · {batch.rowsTotal} row
                  {batch.rowsTotal === 1 ? "" : "s"}
                  {batch.status === "completed" &&
                    ` · ${batch.rowsValid + batch.rowsWarning} imported, ${batch.rowsSkipped} skipped`}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={batch.status} />
                {batch.rowsFailed > 0 && (
                  <a
                    href={`/api/invoice-imports/${batch.id}/errors?format=csv`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Error report
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
