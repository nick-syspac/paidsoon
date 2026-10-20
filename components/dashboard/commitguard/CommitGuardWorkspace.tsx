"use client"

import { useEffect, useRef, useState } from "react"
import { CommitGuardCommitmentEditor } from "@/components/dashboard/commitguard/CommitGuardCommitmentEditor"
import type { EditableCommitment } from "@/lib/commitguard/commitmentEditor"
import { formatCommitGuardMoney } from "@/lib/commitguard/summaryPresentation"
import { SUPPORTED_COMMITMENT_FREQUENCIES } from "@/lib/commitguard/commitmentSchedule"
import { CommitGuardCandidateReview, type DetectionControls } from "@/components/dashboard/commitguard/CommitGuardCandidateReview"
import type { CandidateDisplay } from "@/lib/commitguard/candidatePresentation"
import { useCommitGuardWorkspace, useCommitGuardRefresh } from "@/components/dashboard/commitguard/CommitGuardWorkspaceProvider"

type CommitmentItem = EditableCommitment

type DetectedCandidate = CandidateDisplay

interface CommitGuardWorkspaceProps {
  initialCommitments: CommitmentItem[]
  initialDetectedCandidates: DetectedCandidate[]
  detectionEnabled: boolean
  detectionSettings?: DetectionControls | null
}

const FREQUENCY_OPTIONS = SUPPORTED_COMMITMENT_FREQUENCIES

function mutationFieldErrors(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return {}
  const error = payload.error
  if (!error || typeof error !== "object" || !("fieldErrors" in error) || !error.fieldErrors || typeof error.fieldErrors !== "object") return {}
  return Object.fromEntries(Object.entries(error.fieldErrors).map(([field, messages]) => [
    field, Array.isArray(messages) ? messages.filter((message) => typeof message === "string").join(" ") : "",
  ]))
}

function mutationErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return fallback
  const error = payload.error
  if (typeof error === "string") return error
  return Object.entries(mutationFieldErrors(payload))
    .filter(([, message]) => message)
    .map(([field, message]) => `${field}: ${message}`).join(" ") || fallback
}

export function CommitGuardWorkspace({
  initialCommitments,
  initialDetectedCandidates,
  detectionEnabled,
  detectionSettings,
}: CommitGuardWorkspaceProps) {
  const context = useCommitGuardWorkspace()
  const { refresh, requestMutation } = useCommitGuardRefresh()
  const commitments: CommitmentItem[] = context?.workspace.commitments ?? initialCommitments
  const [needsReload, setNeedsReload] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({})

  const [formName, setFormName] = useState("")
  const [formCategory, setFormCategory] = useState("operations")
  const [formAmountAud, setFormAmountAud] = useState("0")
  const [formFrequency, setFormFrequency] = useState<(typeof FREQUENCY_OPTIONS)[number]>("monthly")
  const [formNextDueDate, setFormNextDueDate] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formSupplierName, setFormSupplierName] = useState("")
  const [formNotes, setFormNotes] = useState("")
  const [formRenewalDate, setFormRenewalDate] = useState("")
  const [formNoticePeriodDays, setFormNoticePeriodDays] = useState("30")
  const [formAutoRenew, setFormAutoRenew] = useState(false)

  // Freeze the opening baseline, not the live refreshed row: GET-only conflict
  // recovery keeps drafts and does not turn untouched fields into writes.
  const [editing, setEditing] = useState<CommitmentItem | null>(null)
  const editTrigger = useRef<HTMLButtonElement | null>(null)
  const restoreEditFocus = useRef(false)
  useEffect(() => {
    if (!editing && !context?.refreshing && !context?.mutating && restoreEditFocus.current) {
      editTrigger.current?.focus()
      restoreEditFocus.current = false
    }
  }, [editing, context?.refreshing, context?.mutating])

  function closeEdit(): void {
    restoreEditFocus.current = true
    setEditing(null)
  }

  async function refreshData() {
    try { await refresh(); setNeedsReload(false) }
    catch {
      // With a provider, its GET-only retry owns this failure state. Do not
      // leave a second local latch blocking actions after that retry succeeds.
      if (!context) { setNeedsReload(true); setError("Save succeeded, but figures could not refresh. Retry workspace refresh only; do not save again.") }
    }
  }

  async function createCommitment(event: React.FormEvent) {
    event.preventDefault()
    if (loading || needsReload || context?.mutating || context?.refreshFailed || context?.refreshing) return
    setLoading(true)
    setError(null)
    setCreateFieldErrors({})
    setSaved(false)

    try {
      const response = await requestMutation("/api/commitguard/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          description: formDescription || null,
          category: formCategory,
          amountCents: Math.max(0, Math.round(Number(formAmountAud) * 100)),
          frequency: formFrequency,
          nextDueDate: formNextDueDate ? new Date(formNextDueDate).toISOString() : null,
          supplierName: formSupplierName || null,
          notes: formNotes || null,
          renewalDate: formRenewalDate ? new Date(formRenewalDate).toISOString() : null,
          noticePeriodDays: Math.max(0, Number(formNoticePeriodDays) || 0),
          autoRenew: formAutoRenew,
          currency: "aud",
        }),
      })

      if (!response.ok) {
        if (response.status === 409) setNeedsReload(true)
        const payload = await response.json().catch(() => ({ error: "Failed to create commitment" }))
        setCreateFieldErrors(mutationFieldErrors(payload))
        throw new Error(mutationErrorMessage(payload, "Failed to create commitment"))
      }

      setSaved(true)
      setFormName("")
      setFormCategory("operations")
      setFormAmountAud("0")
      setFormFrequency("monthly")
      setFormNextDueDate("")
      setFormDescription("")
      setFormSupplierName("")
      setFormNotes("")
      setFormRenewalDate("")
      setFormNoticePeriodDays("30")
      setFormAutoRenew(false)
      await refreshData()
    } catch (err) {
      setNeedsReload(true)
      setError(err instanceof Error ? err.message : "Failed to create commitment")
    } finally {
      setLoading(false)
    }
  }

  function startEdit(commitmentId: string) {
    const commitment = commitments.find((row) => row.id === commitmentId)
    if (!commitment || commitment.archivedAt) return
    setSaved(false)
    setEditing({ ...commitment })
  }

  async function runLifecycleAction(commitmentId: string, action: "pause" | "resume" | "cancel" | "confirm") {
    if (loading || needsReload || context?.mutating || context?.refreshFailed || context?.refreshing) return
    setLoading(true)
    setError(null)

    try {
      setSaved(false)
      const response = await requestMutation(`/api/commitguard/commitments/${commitmentId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })

      if (!response.ok) {
        if (response.status === 409) setNeedsReload(true)
        const payload = await response.json().catch(() => ({ error: "Action failed" }))
        throw new Error(typeof payload.error === "string" ? payload.error : "Action failed")
      }

      setSaved(true)
      await refreshData()
    } catch (err) {
      setNeedsReload(true)
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-6">
      {saved ? <p role="status">Commitment saved successfully.</p> : null}
      {needsReload ? <div role="alert"><p>Reload current workspace before another mutation. Any unsaved edit draft is retained.</p><button type="button" disabled={loading} onClick={() => { void refresh().then(() => { setNeedsReload(false); setError(null) }).catch(() => setError("Could not reload workspace. Drafts retained; retry GET only.")) }}>Reload workspace (keep drafts)</button></div> : null}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Add commitment</h2>
        <form onSubmit={(event) => { if (needsReload || context?.refreshFailed) { event.preventDefault(); return }; void createCommitment(event) }} className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
          <label className="md:col-span-2">
            <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Name</span>
            <input
              required
              value={formName}
              onChange={(event) => setFormName(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Category</span>
            <input
              required
              value={formCategory}
              onChange={(event) => setFormCategory(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Amount (A$)</span>
            <input
              required
              type="number"
              min={0}
              step={1}
              value={formAmountAud}
              onChange={(event) => setFormAmountAud(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Frequency</span>
            <select
              value={formFrequency}
              aria-invalid={Boolean(createFieldErrors.frequency)}
              aria-describedby={createFieldErrors.frequency ? "commitguard-create-frequency-error" : undefined}
              onChange={(event) => setFormFrequency(event.target.value as (typeof FREQUENCY_OPTIONS)[number])}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            >
              {FREQUENCY_OPTIONS.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {frequency.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            {createFieldErrors.frequency ? <span id="commitguard-create-frequency-error" className="text-xs text-red-700">{createFieldErrors.frequency}</span> : null}
          </label>
          <label>
            <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Next due date</span>
            <input
              type="date"
              value={formNextDueDate}
              aria-invalid={Boolean(createFieldErrors.nextDueDate)}
              aria-describedby={createFieldErrors.nextDueDate ? "commitguard-create-due-error" : undefined}
              onChange={(event) => setFormNextDueDate(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
            {createFieldErrors.nextDueDate ? <span id="commitguard-create-due-error" className="text-xs text-red-700">{createFieldErrors.nextDueDate}</span> : null}
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading || needsReload || context?.mutating || context?.refreshing || context?.refreshFailed}
              className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Add commitment"}
            </button>
          </div>

          </div>

          <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-800">Advanced fields</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Description</span>
                <input
                  value={formDescription}
                  onChange={(event) => setFormDescription(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label>
                <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Supplier</span>
                <input
                  value={formSupplierName}
                  onChange={(event) => setFormSupplierName(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label>
                <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Renewal date</span>
                <input
                  type="date"
                  value={formRenewalDate}
                  onChange={(event) => setFormRenewalDate(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label>
                <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Notice period (days)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={formNoticePeriodDays}
                  onChange={(event) => setFormNoticePeriodDays(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label className="md:col-span-2">
                <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Notes</span>
                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={(event) => setFormNotes(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={formAutoRenew}
                  onChange={(event) => setFormAutoRenew(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Auto-renews
              </label>
            </div>
          </details>
        </form>
      </div>

      {editing ? <CommitGuardCommitmentEditor key={editing.id} row={editing}
        blocked={Boolean(loading || needsReload || context?.mutating || context?.refreshing || context?.refreshFailed)}
        onConflict={() => setNeedsReload(true)} onCancel={closeEdit}
        onSaved={async () => { setSaved(true); closeEdit(); await refreshData() }} /> : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Lifecycle actions</h2>
        <div className="mt-3 space-y-2">
          {commitments.map((commitment) => (
            <div key={commitment.id} id={`commitment-${commitment.id}`} tabIndex={-1} className="rounded-md border border-gray-200 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{commitment.name}</p>
                  {commitment.frequency === "custom" ? <p className="text-xs text-amber-800">Unsupported custom recurrence — edit to choose a supported frequency.</p> : null}
                  <p className="text-xs text-gray-600">
                    {commitment.status.replaceAll("_", " ")} · {formatCommitGuardMoney(commitment.amountCents, commitment.currency ?? "aud")}
                  </p>
                </div>
                {commitment.archivedAt ? <p className="text-sm">Archived (read-only)</p> : <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={loading || context?.mutating || context?.refreshing} onClick={(event) => { editTrigger.current = event.currentTarget; startEdit(commitment.id) }} className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700">Edit</button>
                  {["active", "upcoming", "ending", "review"].includes(commitment.status) ? <button type="button" disabled={loading || needsReload || context?.mutating || context?.refreshing || context?.refreshFailed} onClick={() => runLifecycleAction(commitment.id, "pause")} className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700">Pause</button> : null}
                  {commitment.status === "paused" ? <button type="button" disabled={loading || needsReload || context?.mutating || context?.refreshing || context?.refreshFailed} onClick={() => runLifecycleAction(commitment.id, "resume")} className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700">Resume</button> : null}
                  {!["cancelled", "expired"].includes(commitment.status) ? <button type="button" disabled={loading || needsReload || context?.mutating || context?.refreshing || context?.refreshFailed} onClick={() => runLifecycleAction(commitment.id, "cancel")} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700">Cancel</button> : null}
                </div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {detectionEnabled ? (
        <CommitGuardCandidateReview candidates={initialDetectedCandidates} settings={detectionSettings} />
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  )
}
