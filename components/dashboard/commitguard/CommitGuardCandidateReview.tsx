"use client"

import { useState } from "react"
import { useCommitGuardWorkspace, useCommitGuardRefresh } from "@/components/dashboard/commitguard/CommitGuardWorkspaceProvider"
import { SUPPORTED_COMMITMENT_FREQUENCIES } from "@/lib/commitguard/commitmentSchedule"
import { CandidatePatchSchema, formatCandidateMoney, safeCandidateDate, safeCandidateEvidence, type CandidateDisplay } from "@/lib/commitguard/candidatePresentation"

export type DetectionControls = { enabled: boolean; detectRecurringCommitments: boolean; detectionConfidenceThreshold: string }
type Draft = { name: string; category: string; amount: string; frequency: string; due: string; confidence: string; source: string }
type Props = { candidates: CandidateDisplay[]; settings?: DetectionControls | null }

function failure(payload: unknown, fallback: string): string {
  const error = payload && typeof payload === "object" && "error" in payload ? payload.error : null
  // Server string messages are controlled safe contracts. Never stringify a provider/DB payload.
  return typeof error === "string" ? error : fallback
}

export function CommitGuardCandidateReview({ candidates: initialCandidates, settings: initialSettings }: Props): React.JSX.Element {
  const context = useCommitGuardWorkspace()
  const { refresh, requestMutation } = useCommitGuardRefresh()
  const candidates = context?.workspace.candidates ?? initialCandidates
  const settings = context?.workspace.settings ?? initialSettings
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [needsReload, setNeedsReload] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [linkedCommitment, setLinkedCommitment] = useState<string | null>(null)
  const [view, setView] = useState("pending")
  const pendingCount = candidates.filter((candidate) => candidate.status === "pending").length
  const disabledReason = !settings ? "Reload detection settings before running Detect."
    : !settings.enabled ? "CommitGuard is disabled. Enable it in settings to run detection."
      : !settings.detectRecurringCommitments ? "Recurring detection is disabled. Opt in from settings to run detection."
        : settings.detectionConfidenceThreshold === "confirmed" ? "Legacy confirmed threshold requires review: choose low, medium or high in settings."
          : null

  async function reload(): Promise<void> {
    await refresh()
    setNeedsReload(false)
  }

  async function retryLoad(): Promise<void> {
    setBusy(true); setError(null)
    try { await reload() } catch { setError("Could not reload candidates and settings. Retry load; do not repeat a successful action."); setNeedsReload(true) }
    finally { setBusy(false) }
  }

  async function detect(): Promise<void> {
    if (busy || needsReload || context?.mutating || context?.refreshFailed || context?.refreshing) return
    setBusy(true); setError(null); setResult(null); setLinkedCommitment(null)
    try {
      const response = await requestMutation("/api/commitguard/detections", { method: "POST" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(failure(payload, "Detection failed. No successful result was received."))
        setNeedsReload(true)
        return
      }
      if (!payload?.detection || !Array.isArray(payload.candidates)) throw new Error("Invalid result")
      const { created, updated, skipped, warnings = [] } = payload.detection
      setResult(`Detection completed: ${created} created, ${updated} updated, ${skipped} skipped.${warnings.length ? ` Review warnings: ${warnings.map((warning: string) => warning.replaceAll("_", " ")).join(", ")}.` : ""}`)
      try { await reload() } catch { if (!context) { setNeedsReload(true); setError("Detection succeeded, but figures could not refresh. Retry load only; do not run detection again.") } }
    } catch { setError("Detection result was not received. Reload candidates before deciding whether to run again."); setNeedsReload(true) }
    finally { setBusy(false) }
  }

  async function review(id: string, action: "confirm" | "ignore" | "not_a_commitment" | "edit", patch?: unknown): Promise<void> {
    if (busy || needsReload || context?.mutating || context?.refreshFailed || context?.refreshing) return
    setBusy(true); setError(null); setResult(null); setLinkedCommitment(null)
    try {
      const response = await requestMutation(`/api/commitguard/detections/${encodeURIComponent(id)}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(patch ? { patch } : {}) }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(failure(payload, "Review action failed. Check the fields and reload current candidates."))
        if (typeof payload?.commitmentId === "string") setLinkedCommitment(payload.commitmentId)
        if (response.status === 409 || response.status === 404 || response.status === 403) setNeedsReload(true)
        if (payload?.error?.fieldErrors?.patch) setFieldErrors({ patch: payload.error.fieldErrors.patch.join(" ") })
        return
      }
      setResult("Review saved successfully.")
      if (action === "edit") { setEditing(null); setDraft(null) }
      try { await reload() } catch { if (!context) { setNeedsReload(true); setError("Save succeeded, but candidates could not be reloaded. Retry load; do not save again.") } }
    } catch { setNeedsReload(true); setError("Review result was not received. Reload candidates before retrying; the action may have saved.") }
    finally { setBusy(false) }
  }

  function edit(candidate: CandidateDisplay): void {
    setEditing(candidate.id); setFieldErrors({}); setError(null)
    setDraft({ name: candidate.name, category: candidate.category, amount: (candidate.typicalAmountCents / 100).toFixed(2),
      frequency: SUPPORTED_COMMITMENT_FREQUENCIES.includes(candidate.frequency as typeof SUPPORTED_COMMITMENT_FREQUENCIES[number]) ? candidate.frequency : "",
      due: safeCandidateDate(candidate.suggestedDueDate) ?? "", confidence: candidate.confidence === "confirmed" ? "" : candidate.confidence, source: candidate.source })
  }

  function save(event: React.FormEvent): void {
    event.preventDefault()
    if (!draft || !editing) return
    const amountValid = /^\d+(\.\d{1,2})?$/.test(draft.amount)
    const parsed = CandidatePatchSchema.safeParse({ name: draft.name, category: draft.category,
      typicalAmountCents: amountValid ? Math.round(Number(draft.amount) * 100) : NaN,
      ...(draft.frequency ? { frequency: draft.frequency } : {}),
      ...(draft.due ? { suggestedDueDate: draft.due } : {}), confidence: draft.confidence, source: draft.source })
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])))
      return
    }
    setFieldErrors({})
    void review(editing, "edit", parsed.data)
  }

  function field(key: keyof Draft, label: string, type = "text", errorKey: string = key): React.JSX.Element {
    return <label htmlFor={`candidate-${key}`} className="block text-sm text-gray-700">{label}
      <input id={`candidate-${key}`} type={type} value={draft?.[key] ?? ""}
        onChange={(event) => setDraft((previous) => previous ? { ...previous, [key]: event.target.value } : previous)}
        aria-invalid={Boolean(fieldErrors[errorKey])} aria-describedby={fieldErrors[errorKey] ? `candidate-${key}-error` : undefined}
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
      {fieldErrors[errorKey] ? <span id={`candidate-${key}-error`} className="text-red-700">{fieldErrors[errorKey]}</span> : null}
    </label>
  }

  return <section aria-label="Detected commitments review" className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
    <h2 className="text-base font-semibold text-gray-900">Detected commitments review</h2>
    <p role="status">{pendingCount} pending review</p>
    <p className="text-sm text-gray-600">Detect inspects persisted outgoing spend, not a new provider sync. Partial sources may be incomplete; review source evidence before confirming.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || Boolean(disabledReason) || needsReload} onClick={() => void detect()} aria-describedby="detection-policy" className="rounded-md bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? "Working…" : "Detect now"}</button>
      <button type="button" disabled={busy} onClick={() => void retryLoad()} className="rounded-md border px-3 py-2 text-sm">{needsReload ? "Retry load (do not repeat action)" : "Reload candidates and settings"}</button>
      <a href="/settings/commitguard" className="text-sm underline">Detection settings</a>
    </div>
    <p id="detection-policy" className="text-sm text-amber-800">{disabledReason ?? "Enabled with current saved settings. Access and opt-in are rechecked on the server at execution."}</p>
    {result ? <p role="status" className="text-sm text-green-800">{result}</p> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {linkedCommitment ? <a href={`/dashboard/commitguard#commitment-${encodeURIComponent(linkedCommitment)}`} className="underline">View existing commitment</a> : null}
    <label htmlFor="candidate-view" className="block text-sm">Review queue view
      <select id="candidate-view" value={view} disabled={busy} onChange={(event) => setView(event.target.value)} className="ml-2 rounded-md border p-2">
        <option value="pending">Pending</option><option value="ignored">Ignored</option><option value="not_a_commitment">Not a commitment</option>
      </select>
    </label>
    {candidates.filter((candidate) => candidate.status === view).length === 0 ? <p>No candidates in this review view.</p> : null}
    {candidates.filter((candidate) => candidate.status === view).map((candidate) => {
      const evidence = safeCandidateEvidence(candidate.evidence)
      return <article key={candidate.id} id={`detection-${candidate.id}`} tabIndex={-1} className="scroll-mt-4 rounded-md border border-gray-200 p-3 space-y-2 focus:outline-2 focus:outline-blue-600">
        <h3 className="font-medium text-gray-900">{candidate.name}</h3>
        <p className="text-sm">{formatCandidateMoney(candidate.typicalAmountCents, candidate.currency)} · {candidate.frequency.replaceAll("_", " ")} · {candidate.confidence} · {candidate.source.replaceAll("_", " ")}</p>
        <p className="text-sm">Supplier: {candidate.supplierName ?? "Unknown"} · Source currency: {candidate.currency?.toUpperCase() ?? "Unknown"} (read-only evidence)</p>
        <p className="text-sm">Suggested due (UTC): {safeCandidateDate(candidate.suggestedDueDate) ?? "Needs review"} · Latest observed (UTC): {safeCandidateDate(candidate.latestObservedAt) ?? "Unknown"} · Anchor (UTC): {safeCandidateDate(candidate.recurrenceAnchor) ?? "Unknown"}</p>
        {candidate.evidenceReviewRequired ? <p role="status" className="text-amber-800">Evidence changed since your correction. Your corrections were preserved; compare the new evidence before confirming.</p> : null}
        {candidate.conversionReviewRequired ? <p className="text-amber-800">Conversion requires historical review. No new commitment can be created.</p> : null}
        {candidate.frequency === "custom" ? <p className="text-amber-800">Unsupported custom recurrence — edit to a supported frequency before confirming.</p> : null}
        <details><summary>Source evidence ({evidence.sampleCount} observations, {evidence.sourceKind.replaceAll("_", " ")})</summary>
          <ul className="break-words text-sm">{evidence.observations.map((observation, index) => <li key={index}>{observation.sourceId} · {observation.date ?? "Unknown date"} · {formatCandidateMoney(observation.amountCents, observation.currency)}</li>)}</ul>
        </details>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || needsReload} onClick={() => edit(candidate)} className="rounded-md border px-3 py-2 text-sm">Edit candidate</button>
          {candidate.status === "pending" ? <button type="button" disabled={busy || needsReload} onClick={() => void review(candidate.id, "confirm")} className="rounded-md bg-green-700 px-3 py-2 text-sm text-white">Confirm</button> : null}
          <button type="button" disabled={busy || needsReload} onClick={() => void review(candidate.id, "ignore")} className="rounded-md border px-3 py-2 text-sm">Ignore</button>
          <button type="button" disabled={busy || needsReload} onClick={() => void review(candidate.id, "not_a_commitment")} className="rounded-md border px-3 py-2 text-sm">Not a commitment</button>
        </div>
      </article>
    })}
    {draft ? <form onSubmit={save} aria-label="Edit detected candidate" className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
      <h3 className="font-semibold">Edit detected candidate</h3>
      <p className="text-sm">Currency and supplier remain source evidence; candidate notes are not supported. Saving an ignored/rejected candidate deliberately returns it to pending.</p>
      <div className="grid gap-3 sm:grid-cols-2">{field("name", "Candidate name")}{field("category", "Candidate category")}{field("amount", "Candidate amount (source currency)", "text", "typicalAmountCents")}{field("due", "Candidate suggested due date (UTC)", "date", "suggestedDueDate")}
        <label htmlFor="candidate-frequency" className="text-sm">Candidate frequency<select id="candidate-frequency" value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value })} className="block w-full rounded-md border p-2"><option value="" disabled>Unsupported legacy schedule — unchanged</option>{SUPPORTED_COMMITMENT_FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{frequency.replaceAll("_", " ")}</option>)}</select></label>
        <label htmlFor="candidate-confidence" className="text-sm">Candidate confidence<select id="candidate-confidence" required value={draft.confidence} onChange={(event) => setDraft({ ...draft, confidence: event.target.value })} className="block w-full rounded-md border p-2"><option value="" disabled>Choose review confidence</option>{["low", "medium", "high"].map((confidence) => <option key={confidence}>{confidence}</option>)}</select>{fieldErrors.confidence ? <span className="text-red-700">{fieldErrors.confidence}</span> : null}</label>
        <label htmlFor="candidate-source" className="text-sm">Candidate source classification<select id="candidate-source" value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} className="block w-full rounded-md border p-2">{["manual", "accounting_integration", "bank_transaction_pattern", "spendleak", "costguard", "import", "system_inferred"].map((source) => <option key={source} value={source}>{source.replaceAll("_", " ")}</option>)}</select></label>
      </div>
      {fieldErrors.patch ? <p role="alert">{fieldErrors.patch}</p> : null}
      <button type="submit" disabled={busy || needsReload} className="rounded-md bg-amber-800 px-3 py-2 text-white">Save candidate</button>{" "}
      <button type="button" disabled={busy} onClick={() => { setDraft(null); setEditing(null) }} className="rounded-md border px-3 py-2">Cancel candidate edit</button>
    </form> : null}
  </section>
}