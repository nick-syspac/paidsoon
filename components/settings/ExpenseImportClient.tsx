"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import type { ReactElement } from "react"

import { Spinner } from "@/components/ui/Spinner"
import { SPEND_IMPORT_CANONICAL_FIELDS } from "@/lib/spendImport/template"

type MappingSuggestion = { sourceColumn: string; targetField: string }

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

type CommitSummary = { recordsUpserted: number; findingsUpserted: number; recordsSkipped: number }

type DuplicateMode = "skip_existing" | "update_existing"
type WizardStep = "idle" | "mapping" | "validated" | "confirmed"

const IGNORE_VALUE = ""
const UPLOAD_ERROR = "Only CSV and XLSX expense imports are supported"

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

function StatusBadge({ status }: { status: string }): ReactElement {
  const cls = STATUS_BADGES[status] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {humanizeField(status)}
    </span>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: string }): ReactElement {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${tone ?? "text-gray-900"}`}>{value}</p>
    </div>
  )
}

export function ExpenseImportClient({ initialBatches }: { initialBatches: ImportBatchSummary[] }): ReactElement {
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

  async function refreshHistory(): Promise<void> {
    const res = await fetch("/api/spend-imports")
    if (res.ok) {
      const data: { batches: ImportBatchSummary[] } = await res.json()
      setBatches(data.batches)
    }
  }

  function resetWizard(): void {
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

  async function handleFileSelected(file: File): Promise<void> {
    setError(null)
    setUploading(true)
    try {
      const name = file.name.toLowerCase()
      if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
        setError(UPLOAD_ERROR)
        return
      }

      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/spend-imports/upload", { method: "POST", body: formData })
      const data: {
        batchId?: string
        fileName?: string
        sourceColumns?: string[]
        suggestions?: Record<string, string>
        error?: string
      } = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error ?? "Upload failed")
        return
      }

      const initialMapping: Record<string, string> = {}
      for (const [sourceColumn, targetField] of Object.entries(data.suggestions ?? {})) {
        initialMapping[sourceColumn] = targetField
      }

      setBatchId(data.batchId ?? null)
      setFileName(data.fileName ?? null)
      setSourceColumns(data.sourceColumns ?? [])
      setMapping(initialMapping)
      setStep("mapping")
    } finally {
      setUploading(false)
    }
  }

  async function handleContinueToValidation(): Promise<void> {
    if (!batchId) return
    setError(null)
    setMissingFields([])
    setSavingMapping(true)
    try {
      const cleanMapping = Object.fromEntries(
        Object.entries(mapping).filter(([, targetField]) => targetField !== IGNORE_VALUE),
      )

      const mappingRes = await fetch(`/api/spend-imports/${batchId}/mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping: cleanMapping, duplicateMode }),
      })
      const mappingData: { error?: string; missingFields?: string[] } = await mappingRes.json().catch(() => ({}))
      if (!mappingRes.ok) {
        setError(mappingData.error ?? "Could not save column mapping")
        if (mappingData.missingFields) setMissingFields(mappingData.missingFields)
        return
      }

      const validateRes = await fetch(`/api/spend-imports/${batchId}/validate`, { method: "POST" })
      const validateData: ValidationSummary & { error?: string } = await validateRes.json().catch(() => ({} as ValidationSummary))
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

  async function handleCommit(): Promise<void> {
    if (!batchId) return
    setError(null)
    setCommitting(true)
    try {
      const res = await fetch(`/api/spend-imports/${batchId}/commit`, { method: "POST" })
      const data: CommitSummary & { error?: string } = await res.json().catch(() => ({} as CommitSummary))
      if (!res.ok) {
        setError(data.error ?? "Import failed")
        return
      }

      setCommitResult({
        recordsUpserted: data.recordsUpserted,
        findingsUpserted: data.findingsUpserted,
        recordsSkipped: data.recordsSkipped,
      })
      setStep("confirmed")
      await refreshHistory()
      router.refresh()
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Expense import</h2>
        <p className="text-sm text-gray-500 mt-1">
          Bring in CSV or XLSX expense data for SpendLeak analysis. Imported rows are validated before they are committed into the spend workflow.
        </p>
      </div>

      {step === "idle" && <UploadStep uploading={uploading} error={error} onFileSelected={handleFileSelected} />}

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
        />
      )}

      {step === "confirmed" && commitResult && <ConfirmationStep result={commitResult} onStartAnother={resetWizard} />}

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
}): ReactElement {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-gray-900">1. Download a template</p>
        <p className="text-sm text-gray-500">
          Start from our template so your columns match up automatically. Sample rows use
          fictional data &mdash; delete them before adding your own.
        </p>
        <div className="flex gap-2">
          <Link
            href="/api/spend-imports/template?format=csv"
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Download CSV template
          </Link>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-gray-900">2. Upload your file</p>
        <p className="text-sm text-gray-500">CSV or XLSX only, up to 5MB.</p>
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
          <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">{error}</div>
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
}): ReactElement {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">2. Review column mapping{fileName ? ` — ${fileName}` : ""}</p>
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
              {SPEND_IMPORT_CANONICAL_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {humanizeField(field)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="border border-gray-200 rounded-lg p-4 space-y-2">
        <p className="text-sm font-medium text-gray-900">Duplicate expenses</p>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="radio"
            checked={duplicateMode === "skip_existing"}
            onChange={() => onDuplicateModeChange("skip_existing")}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Skip existing expenses</span> &mdash; rows that match rows already tracked by SpendLeak are left untouched.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="radio"
            checked={duplicateMode === "update_existing"}
            onChange={() => onDuplicateModeChange("update_existing")}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Update matching expenses</span> &mdash; refresh normalized fields for matching rows while preserving their workflow history.
          </span>
        </label>
      </div>

      {missingFields.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2 text-xs text-yellow-800">
          Please map required fields: {missingFields.map(humanizeField).join(", ")}
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">{error}</div>}

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

function ValidationStep({
  validation,
  error,
  committing,
  onBack,
  onCommit,
}: {
  validation: ValidationSummary
  error: string | null
  committing: boolean
  onBack: () => void
  onCommit: () => void
}): ReactElement {
  const canCommit = validation.rowsFailed === 0 && validation.rowsTotal > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">3. Review validation results</p>
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
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">
          {validation.rowsFailed} row{validation.rowsFailed === 1 ? "" : "s"} have blocking errors and must be fixed in your file before you can import. Nothing has been imported yet.
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
                <th className="px-3 py-2 text-left">Supplier</th>
                <th className="px-3 py-2 text-left">Amount</th>
                <th className="px-3 py-2 text-left">Transaction date</th>
                <th className="px-3 py-2 text-left">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {validation.previewRows.map((row) => (
                <tr key={row.rowNumber}>
                  <td className="px-3 py-2 text-gray-500">{row.rowNumber}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2 text-gray-700">{row.values.supplier_name ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{row.values.amount ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{row.values.transaction_date ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-500">{row.issues.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">{error}</div>}

      <button
        onClick={onCommit}
        disabled={committing || !canCommit}
        className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {committing ? "Committing…" : "Commit import"}
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
}): ReactElement {
  return (
    <div className="space-y-4 border border-green-200 bg-green-50 rounded-lg p-4">
      <div>
        <h3 className="text-sm font-semibold text-green-900">Import completed</h3>
        <p className="text-sm text-green-800 mt-1">
          {result.recordsUpserted} expense record{result.recordsUpserted === 1 ? "" : "s"} upserted, {result.findingsUpserted} finding{result.findingsUpserted === 1 ? "" : "s"} updated, {result.recordsSkipped} row{result.recordsSkipped === 1 ? "" : "s"} skipped.
        </p>
      </div>
      <button
        type="button"
        onClick={onStartAnother}
        className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
      >
        Start another import
      </button>
    </div>
  )
}

function ImportHistory({
  batches,
  onRefresh,
}: {
  batches: ImportBatchSummary[]
  onRefresh: () => void
}): ReactElement {
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}