"use client"

import { useMemo, useState } from "react"

type CommitmentItem = {
  id: string
  name: string
  category: string
  amountCents: number
  frequency: string
  nextDueDate: string | null
  confidence: string
  status: string
}

type DetectedCandidate = {
  id: string
  name: string
  category: string
  frequency: string
  typicalAmountCents: number
  confidence: string
  source: string
  status: string
}

interface CommitGuardWorkspaceProps {
  initialCommitments: CommitmentItem[]
  initialDetectedCandidates: DetectedCandidate[]
  detectionEnabled: boolean
}

const FREQUENCY_OPTIONS = [
  "one_off",
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "six_monthly",
  "annual",
  "custom",
] as const

export function CommitGuardWorkspace({
  initialCommitments,
  initialDetectedCandidates,
  detectionEnabled,
}: CommitGuardWorkspaceProps) {
  const [commitments, setCommitments] = useState<CommitmentItem[]>(initialCommitments)
  const [candidates, setCandidates] = useState<DetectedCandidate[]>(initialDetectedCandidates)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const [editCommitmentId, setEditCommitmentId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editCategory, setEditCategory] = useState("")
  const [editAmountAud, setEditAmountAud] = useState("0")
  const [editFrequency, setEditFrequency] = useState<(typeof FREQUENCY_OPTIONS)[number]>("monthly")
  const [editNextDueDate, setEditNextDueDate] = useState("")

  const commitmentById = useMemo(() => {
    const map = new Map<string, CommitmentItem>()
    for (const commitment of commitments) {
      map.set(commitment.id, commitment)
    }
    return map
  }, [commitments])

  async function refreshData() {
    const [commitmentsResponse, detectionsResponse] = await Promise.all([
      fetch("/api/commitguard/commitments"),
      detectionEnabled ? fetch("/api/commitguard/detections") : Promise.resolve(null),
    ])

    if (!commitmentsResponse.ok) {
      throw new Error("Failed to refresh commitments")
    }

    const commitmentsPayload = await commitmentsResponse.json()
    const normalizedCommitments = (Array.isArray(commitmentsPayload?.commitments)
      ? commitmentsPayload.commitments
      : []) as Array<Record<string, unknown>>

    setCommitments(
      normalizedCommitments.map((item) => ({
        id: String(item.id ?? ""),
        name: String(item.name ?? ""),
        category: String(item.category ?? ""),
        amountCents: Number(item.amountCents ?? 0),
        frequency: String(item.frequency ?? "monthly"),
        nextDueDate: typeof item.nextDueDate === "string" ? item.nextDueDate : null,
        confidence: String(item.confidence ?? "medium"),
        status: String(item.status ?? "active"),
      })),
    )

    if (detectionEnabled && detectionsResponse) {
      if (detectionsResponse.ok) {
        const detectionsPayload = await detectionsResponse.json()
        const normalizedCandidates = (Array.isArray(detectionsPayload?.candidates)
          ? detectionsPayload.candidates
          : []) as Array<Record<string, unknown>>

        setCandidates(
          normalizedCandidates.map((item) => ({
            id: String(item.id ?? ""),
            name: String(item.name ?? ""),
            category: String(item.category ?? "other"),
            frequency: String(item.frequency ?? "custom"),
            typicalAmountCents: Number(item.typicalAmountCents ?? 0),
            confidence: String(item.confidence ?? "medium"),
            source: String(item.source ?? "system_inferred"),
            status: String(item.status ?? "pending"),
          })),
        )
      }
    }
  }

  async function createCommitment(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/commitguard/commitments", {
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
        const payload = await response.json().catch(() => ({ error: "Failed to create commitment" }))
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to create commitment")
      }

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
      setError(err instanceof Error ? err.message : "Failed to create commitment")
    } finally {
      setLoading(false)
    }
  }

  function startEdit(commitmentId: string) {
    const commitment = commitmentById.get(commitmentId)
    if (!commitment) return

    setEditCommitmentId(commitment.id)
    setEditName(commitment.name)
    setEditCategory(commitment.category)
    setEditAmountAud((commitment.amountCents / 100).toString())
    setEditFrequency((FREQUENCY_OPTIONS.includes(commitment.frequency as (typeof FREQUENCY_OPTIONS)[number])
      ? commitment.frequency
      : "monthly") as (typeof FREQUENCY_OPTIONS)[number])
    setEditNextDueDate(
      commitment.nextDueDate ? new Date(commitment.nextDueDate).toISOString().slice(0, 10) : "",
    )
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault()
    if (!editCommitmentId) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/commitguard/commitments/${editCommitmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          category: editCategory,
          amountCents: Math.max(0, Math.round(Number(editAmountAud) * 100)),
          frequency: editFrequency,
          nextDueDate: editNextDueDate ? new Date(editNextDueDate).toISOString() : null,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Failed to save commitment" }))
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to save commitment")
      }

      setEditCommitmentId(null)
      await refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save commitment")
    } finally {
      setLoading(false)
    }
  }

  async function runLifecycleAction(commitmentId: string, action: "pause" | "resume" | "cancel" | "confirm") {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/commitguard/commitments/${commitmentId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Action failed" }))
        throw new Error(typeof payload.error === "string" ? payload.error : "Action failed")
      }

      await refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setLoading(false)
    }
  }

  async function reviewCandidate(candidateId: string, action: "confirm" | "ignore" | "not_a_commitment") {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/commitguard/detections/${candidateId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Review action failed" }))
        throw new Error(typeof payload.error === "string" ? payload.error : "Review action failed")
      }

      await refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review action failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Add commitment</h2>
        <form onSubmit={createCommitment} className="mt-4 space-y-4">
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
              onChange={(event) => setFormFrequency(event.target.value as (typeof FREQUENCY_OPTIONS)[number])}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            >
              {FREQUENCY_OPTIONS.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {frequency.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Next due date</span>
            <input
              type="date"
              value={formNextDueDate}
              onChange={(event) => setFormNextDueDate(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
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

      {editCommitmentId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-900">Edit commitment</h3>
          <form onSubmit={saveEdit} className="mt-3 grid gap-3 md:grid-cols-5">
            <input value={editName} onChange={(event) => setEditName(event.target.value)} className="rounded-md border border-amber-300 px-3 py-2 text-sm text-gray-900 md:col-span-2" />
            <input value={editCategory} onChange={(event) => setEditCategory(event.target.value)} className="rounded-md border border-amber-300 px-3 py-2 text-sm text-gray-900" />
            <input type="number" min={0} step={1} value={editAmountAud} onChange={(event) => setEditAmountAud(event.target.value)} className="rounded-md border border-amber-300 px-3 py-2 text-sm text-gray-900" />
            <select value={editFrequency} onChange={(event) => setEditFrequency(event.target.value as (typeof FREQUENCY_OPTIONS)[number])} className="rounded-md border border-amber-300 px-3 py-2 text-sm text-gray-900">
              {FREQUENCY_OPTIONS.map((frequency) => (
                <option key={frequency} value={frequency}>{frequency.replaceAll("_", " ")}</option>
              ))}
            </select>
            <input type="date" value={editNextDueDate} onChange={(event) => setEditNextDueDate(event.target.value)} className="rounded-md border border-amber-300 px-3 py-2 text-sm text-gray-900" />
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" disabled={loading} className="rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50">Save changes</button>
              <button type="button" onClick={() => setEditCommitmentId(null)} className="rounded-md border border-amber-300 px-3 py-2 text-sm text-amber-900">Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Lifecycle actions</h2>
        <div className="mt-3 space-y-2">
          {commitments.map((commitment) => (
            <div key={commitment.id} className="rounded-md border border-gray-200 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{commitment.name}</p>
                  <p className="text-xs text-gray-600">
                    {commitment.status.replaceAll("_", " ")} · {(commitment.amountCents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => startEdit(commitment.id)} className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700">Edit</button>
                  <button type="button" onClick={() => runLifecycleAction(commitment.id, "pause")} className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700">Pause</button>
                  <button type="button" onClick={() => runLifecycleAction(commitment.id, "resume")} className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700">Resume</button>
                  <button type="button" onClick={() => runLifecycleAction(commitment.id, "cancel")} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700">Cancel</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {detectionEnabled ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Detected commitments review</h2>
          {candidates.filter((candidate) => candidate.status === "pending").length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">No pending detection candidates right now.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {candidates
                .filter((candidate) => candidate.status === "pending")
                .map((candidate) => (
                  <div key={candidate.id} className="rounded-md border border-gray-200 p-3">
                    <p className="text-sm font-medium text-gray-900">{candidate.name}</p>
                    <p className="mt-1 text-xs text-gray-600">
                      {candidate.frequency.replaceAll("_", " ")} · {(candidate.typicalAmountCents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 })} · {candidate.source.replaceAll("_", " ")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => reviewCandidate(candidate.id, "confirm")} className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700">Confirm</button>
                      <button type="button" onClick={() => reviewCandidate(candidate.id, "ignore")} className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700">Ignore</button>
                      <button type="button" onClick={() => reviewCandidate(candidate.id, "not_a_commitment")} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700">Not a commitment</button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  )
}
