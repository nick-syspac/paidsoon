"use client"

import { useEffect, useRef, useState } from "react"
import { SUPPORTED_COMMITMENT_FREQUENCIES } from "@/lib/commitguard/commitmentSchedule"
import { WORKSPACE_ESSENTIALITIES, WORKSPACE_SOURCES } from "@/lib/commitguard/workspaceFilters"
import { commitmentEditDraft, commitmentDraftPatch, commitmentMutationErrors, type EditableCommitment } from "@/lib/commitguard/commitmentEditor"
import { useCommitGuardRefresh } from "@/components/dashboard/commitguard/CommitGuardWorkspaceProvider"

const INPUT = "min-w-0 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900"
const labels: Record<string, string> = {
  name: "Name", category: "Category", amountCents: "Amount (source currency)", currency: "Currency (no FX)",
  frequency: "Frequency", nextDueDate: "Next due date (UTC)", startDate: "Start date (UTC)", endDate: "End date (UTC)",
  confidence: "Confidence", essentiality: "Essentiality", source: "Source", renewalDate: "Renewal date (UTC)",
  noticePeriodDays: "Notice period (days)", autoRenew: "Auto-renews", cancellable: "Cancellable",
  description: "Description", supplierName: "Supplier", notes: "Notes",
}

export function CommitGuardCommitmentEditor({ row, blocked, onSaved, onConflict, onCancel }: {
  row: EditableCommitment; blocked: boolean; onSaved: () => Promise<void>; onConflict: () => void; onCancel: () => void
}): React.JSX.Element {
  const { requestMutation } = useCommitGuardRefresh()
  const [draft, setDraft] = useState(() => commitmentEditDraft(row))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const editor = useRef<HTMLElement>(null)
  useEffect(() => { editor.current?.focus() }, [])
  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (saving || blocked || row.archivedAt) return
    const result = commitmentDraftPatch(row, draft)
    setErrors(result.errors); setError(null)
    if (Object.keys(result.errors).length) return
    setSaving(true)
    try {
      const response = await requestMutation(`/api/commitguard/commitments/${encodeURIComponent(row.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.patch),
      })
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null)
        setErrors(commitmentMutationErrors(payload))
        if (response.status === 409) {
          onConflict(); setError("Record changed or is read-only. Reload the workspace before retrying. Your draft is retained.")
        } else setError(response.status === 400 ? "Check the marked fields. Your draft is retained." : "Could not save changes. Your draft is retained.")
        return
      }
      await onSaved()
    } catch { setError("Could not save changes. Your draft is retained.") }
    finally { setSaving(false) }
  }
  const selects: Record<string, readonly string[]> = {
    frequency: SUPPORTED_COMMITMENT_FREQUENCIES, confidence: ["confirmed", "high", "medium", "low"],
    essentiality: WORKSPACE_ESSENTIALITIES, source: WORKSPACE_SOURCES, autoRenew: ["true", "false"], cancellable: ["true", "false"],
  }
  return <section ref={editor} tabIndex={-1} id="commitguard-editor" aria-labelledby="commitguard-editor-heading" className="min-w-0 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <h3 id="commitguard-editor-heading" className="font-semibold">Edit commitment</h3>
    <p className="text-sm">Status: {row.status}. Editing does not reopen cancelled or expired commitments. Amounts retain their source currency; no FX conversion.</p>
    {row.frequency === "custom" ? <p id="commitguard-legacy-frequency-hint" className="text-sm">Custom recurrence is unsupported. Leave unchanged for unrelated edits, or choose a supported frequency to restore forecasting.</p> : null}
    <form onSubmit={save} noValidate className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(labels).map(([field, label]) => {
        const id = `commitguard-edit-${field}`
        const shared = { id, "aria-label": `Edit commitment ${field === "amountCents" ? "amount" : field === "nextDueDate" ? "next due date" : label.toLowerCase()}`,
          "aria-invalid": Boolean(errors[field]), "aria-describedby": errors[field] ? `${id}-error` : undefined,
          value: draft[field], className: INPUT,
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDraft({ ...draft, [field]: event.target.value }) }
        const date = field.endsWith("Date")
        return <label key={field} htmlFor={id} className="min-w-0 text-sm">{label}
          {selects[field] ? <select {...shared}>
            {field === "frequency" && !SUPPORTED_COMMITMENT_FREQUENCIES.includes(draft.frequency as typeof SUPPORTED_COMMITMENT_FREQUENCIES[number]) ? <option value={draft.frequency}>Unsupported {draft.frequency} — unchanged</option> : null}
            {selects[field].map((value) => <option key={value} value={value}>{value === "true" ? "Yes" : value === "false" ? "No" : value.replaceAll("_", " ")}</option>)}
          </select> : field === "notes" || field === "description" ? <textarea {...shared} rows={2} />
            : <input {...shared} type={date ? "date" : "text"} inputMode={field === "amountCents" ? "decimal" : field === "noticePeriodDays" ? "numeric" : undefined} />}
          {errors[field] ? <span id={`${id}-error`} role="alert" className="block text-xs text-red-700">{errors[field]}</span> : null}
        </label>
      })}
      {error ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p> : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" disabled={saving || blocked || Boolean(row.archivedAt)} className="rounded bg-amber-800 px-3 py-2 text-white disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button><button type="button" disabled={saving} onClick={onCancel} className="rounded border px-3 py-2">Cancel edit</button></div>
    </form>
  </section>
}