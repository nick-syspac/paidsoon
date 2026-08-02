"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type {
  EmailLog,
  PromiseToPay,
  TrackedInvoice,
} from "@/lib/generated/prisma/client"
import {
  arrangementScopeLabel,
  arrangementTypeLabel,
  deriveArrangementStatus,
  isArrangementHighPriority,
  type ArrangementCoverageWithArrangement,
} from "@/lib/dashboard/arrangements"
import {
  getBrokenPromiseCountForDebtor,
  isPromiseDebtorHighPriority,
} from "@/lib/dashboard/promisePriority"
import { DetailModal } from "./DetailModal"
import { Spinner } from "@/components/ui/Spinner"
import { sanitizeHtml } from "@/lib/email/htmlSanitizer"

type InvoiceWithLogs = TrackedInvoice & {
  emailLogs: EmailLog[]
  promisesToPay: PromiseToPay[]
  arrangementCoverages: ArrangementCoverageWithArrangement[]
}

type ArrangementDetailCoverage = {
  invoiceId: string
  clientName: string
  clientEmail: string
  amountDue: number
  currency: string
  status: string
}

type ArrangementDetail = {
  id: string
  arrangementType: string
  status: string
  promisedPayBy: string | null
  agreedAmount: number | null
  currency: string
  termsNotes: string | null
  coverages: ArrangementDetailCoverage[]
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Active", color: "bg-green-100 text-green-800" },
  paused: { label: "Paused", color: "bg-yellow-100 text-yellow-800" },
  snoozed: { label: "Snoozed", color: "bg-blue-100 text-blue-800" },
  sequence_complete: { label: "Sequence done", color: "bg-gray-100 text-gray-600" },
  paid: { label: "Paid", color: "bg-green-100 text-green-800" },
  manually_resolved: { label: "Resolved", color: "bg-gray-100 text-gray-500" },
}

const STAGE_LABELS: Record<number, string> = {
  0: "Queued",
  1: "1 of 3 sent",
  2: "2 of 3 sent",
  3: "3 of 3 sent",
}

const PROMISE_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  kept: "Kept",
  broken: "Broken",
  superseded: "Superseded",
}

const BULK_ACTION_PAST_TENSE: Record<string, string> = {
  pause: "paused",
  resume: "resumed",
  snooze: "snoozed",
  "cancel-snooze": "un-snoozed",
  resolve: "resolved",
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function formatDate(date: Date | string | null) {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function daysOverdue(dueDate: Date | string) {
  const due = new Date(dueDate)
  const now = new Date()
  return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
}

function getP2PStatus(promises: PromiseToPay[]) {
  const active = promises.find((p) => p.status === "active")
  if (active) return { type: "active" as const, promise: active }
  const broken = promises.find(
    (p) => p.status === "broken" && !promises.some((q) => q.status === "active")
  )
  if (broken) {
    const brokenCount = promises.filter((p) => p.status === "broken").length
    return { type: "broken" as const, promise: broken, brokenCount }
  }
  return null
}

export function InvoiceTable({
  invoices,
  showResolved = false,
  brokenPromiseCountsByDebtor = {},
  escalationThreshold = 2,
  heldInvoiceIds,
}: {
  invoices: InvoiceWithLogs[]
  showResolved?: boolean
  brokenPromiseCountsByDebtor?: Record<string, number>
  escalationThreshold?: number
  /** Invoices due for their first reminder but waiting because the account
   * is at its chase-volume allowance for the current period. */
  heldInvoiceIds?: Set<string>
}) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [bulkActionError, setBulkActionError] = useState<string | null>(null)
  const [confirmBulkResolve, setConfirmBulkResolve] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [arrangementType, setArrangementType] = useState<"full_payment" | "partial_payment">("full_payment")
  const [promisedPayBy, setPromisedPayBy] = useState("")
  const [agreedAmount, setAgreedAmount] = useState("")
  const [arrangementSubmitting, setArrangementSubmitting] = useState(false)
  const [arrangementError, setArrangementError] = useState<string | null>(null)
  const [selectedEmailLog, setSelectedEmailLog] = useState<EmailLog | null>(null)
  const [selectedArrangementId, setSelectedArrangementId] = useState<string | null>(null)
  const [arrangementDetail, setArrangementDetail] = useState<ArrangementDetail | null>(null)
  const [arrangementDetailLoading, setArrangementDetailLoading] = useState(false)
  const [selectedPromiseInvoiceId, setSelectedPromiseInvoiceId] = useState<string | null>(null)
  const [arrangementDetailError, setArrangementDetailError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedArrangementId) return

    let cancelled = false

    fetch(`/api/arrangements/${selectedArrangementId}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.error ?? "Failed to load arrangement detail")
        }
        return response.json()
      })
      .then((body: { arrangement: ArrangementDetail }) => {
        if (!cancelled) setArrangementDetail(body.arrangement)
      })
      .catch((err: Error) => {
        if (!cancelled) setArrangementDetailError(err.message)
      })
      .finally(() => {
        if (!cancelled) setArrangementDetailLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedArrangementId])

  function openArrangementDetail(arrangementId: string) {
    setSelectedArrangementId(arrangementId)
    setArrangementDetail(null)
    setArrangementDetailError(null)
    setArrangementDetailLoading(true)
  }

  function closeArrangementDetail() {
    setSelectedArrangementId(null)
    setArrangementDetail(null)
    setArrangementDetailError(null)
  }

  function openPromiseDetail(invoiceId: string) {
    setSelectedPromiseInvoiceId(invoiceId)
  }

  function closePromiseDetail() {
    setSelectedPromiseInvoiceId(null)
  }

  const selectedPromiseInvoice = selectedPromiseInvoiceId
    ? invoices.find((inv) => inv.id === selectedPromiseInvoiceId) ?? null
    : null

  const selectedInvoices = invoices.filter((inv) => selectedIds.includes(inv.id))
  const canSnooze = selectedInvoices.length > 0 && selectedInvoices.every((inv) => inv.status === "pending")
  const canPause = selectedInvoices.length > 0 && selectedInvoices.every((inv) => inv.status === "pending")
  const canResume = selectedInvoices.length > 0 && selectedInvoices.every((inv) => inv.status === "paused")
  const canCancelSnooze =
    selectedInvoices.length > 0 && selectedInvoices.every((inv) => inv.status === "snoozed")

  async function doBulkAction(action: "pause" | "resume" | "snooze" | "cancel-snooze" | "resolve") {
    if (selectedIds.length === 0) return
    setBulkActionLoading(true)
    setBulkActionError(null)
    const responses = await Promise.all(
      selectedIds.map((id) => fetch(`/api/invoices/${id}/${action}`, { method: "POST" }))
    )
    setBulkActionLoading(false)
    setConfirmBulkResolve(false)
    setSelectedIds([])
    router.refresh()
    if (responses.some((response) => !response.ok)) {
      setBulkActionError(`Some invoices could not be ${BULK_ACTION_PAST_TENSE[action]}. Please try again.`)
    }
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id]
      }
      return current.filter((existing) => existing !== id)
    })
  }

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelectedIds(invoices.map((invoice) => invoice.id))
      return
    }
    setSelectedIds([])
  }

  async function createArrangement(invoiceIds: string[]) {
    setArrangementError(null)
    if (!promisedPayBy) {
      setArrangementError("Select an arrangement date before creating an arrangement.")
      return
    }

    if (arrangementType === "partial_payment" && !agreedAmount) {
      setArrangementError("Enter a partial payment amount in cents.")
      return
    }

    const promisedDate = new Date(promisedPayBy)
    if (promisedDate <= new Date()) {
      setArrangementError("Arrangement date must be in the future.")
      return
    }

    setArrangementSubmitting(true)

    const payload: {
      invoiceIds: string[]
      arrangementType: "full_payment" | "partial_payment"
      promisedPayBy: string
      agreedAmount?: number
    } = {
      invoiceIds,
      arrangementType,
      promisedPayBy: promisedDate.toISOString(),
    }

    if (arrangementType === "partial_payment") {
      payload.agreedAmount = Number(agreedAmount)
    }

    const response = await fetch("/api/arrangements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      setArrangementError(body.error ?? "Failed to create arrangement")
      setArrangementSubmitting(false)
      return
    }

    setSelectedIds([])
    setArrangementSubmitting(false)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {!showResolved && (
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-gray-600 font-medium">
              Selected: {selectedIds.length}
            </span>
            <select
              value={arrangementType}
              onChange={(event) => setArrangementType(event.target.value as "full_payment" | "partial_payment")}
              className="text-xs border border-gray-300 rounded px-2 py-1"
            >
              <option value="full_payment">Full payment</option>
              <option value="partial_payment">Partial payment</option>
            </select>
            <input
              type="date"
              value={promisedPayBy}
              onChange={(event) => setPromisedPayBy(event.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1"
            />
            {arrangementType === "partial_payment" && (
              <input
                type="number"
                min={1}
                step={1}
                placeholder="Amount (cents)"
                value={agreedAmount}
                onChange={(event) => setAgreedAmount(event.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1 w-36"
              />
            )}
            <button
              type="button"
              disabled={selectedIds.length === 0 || arrangementSubmitting}
              onClick={() => createArrangement(selectedIds)}
              className="text-xs bg-gray-900 text-white rounded px-3 py-1.5 disabled:opacity-40"
            >
              {arrangementSubmitting ? "Creating..." : "Create arrangement"}
            </button>
            {arrangementError && <p className="text-xs text-red-600">{arrangementError}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => doBulkAction("snooze")}
              disabled={!canSnooze || bulkActionLoading}
              className="text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded px-3 py-1.5 disabled:opacity-40"
            >
              Snooze
            </button>
            <button
              type="button"
              onClick={() => doBulkAction("pause")}
              disabled={!canPause || bulkActionLoading}
              className="text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded px-3 py-1.5 disabled:opacity-40"
            >
              Pause
            </button>
            <button
              type="button"
              onClick={() => doBulkAction("resume")}
              disabled={!canResume || bulkActionLoading}
              className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-3 py-1.5 disabled:opacity-40"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={() => doBulkAction("cancel-snooze")}
              disabled={!canCancelSnooze || bulkActionLoading}
              className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-3 py-1.5 disabled:opacity-40"
            >
              Cancel snooze
            </button>
            <button
              type="button"
              onClick={() => createArrangement(selectedIds)}
              disabled={selectedIds.length === 0 || arrangementSubmitting}
              className="text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded px-3 py-1.5 disabled:opacity-40"
            >
              Arrange
            </button>
            {confirmBulkResolve ? (
              <>
                <button
                  type="button"
                  onClick={() => doBulkAction("resolve")}
                  disabled={bulkActionLoading}
                  className="text-xs text-green-700 hover:text-green-900 border border-green-200 rounded px-3 py-1.5 font-medium disabled:opacity-40"
                >
                  Confirm resolve
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBulkResolve(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmBulkResolve(true)}
                disabled={selectedIds.length === 0}
                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded px-3 py-1.5 disabled:opacity-40"
              >
                Resolve
              </button>
            )}
          </div>
          {bulkActionError && <p className="text-xs text-red-600 mt-2">{bulkActionError}</p>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {!showResolved && (
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  aria-label="Select all invoices"
                  checked={selectedIds.length > 0 && selectedIds.length === invoices.length}
                  onChange={(event) => toggleAll(event.target.checked)}
                />
              </th>
            )}
            <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Amount</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Overdue</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Next email</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Promise</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Arrangement</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const isHeld = heldInvoiceIds?.has(inv.id) ?? false
            const status = isHeld
              ? { label: "Held — allowance", color: "bg-amber-100 text-amber-800" }
              : STATUS_LABELS[inv.status] ?? { label: inv.status, color: "bg-gray-100 text-gray-600" }
            const isExpanded = expandedId === inv.id
            const p2p = getP2PStatus(inv.promisesToPay)
            const arrangement = deriveArrangementStatus(inv.arrangementCoverages)
            const isBrokenPriority = isArrangementHighPriority(arrangement)
            const brokenPromiseCount = getBrokenPromiseCountForDebtor(
              brokenPromiseCountsByDebtor,
              inv.clientEmail,
            )
            const isPromisePriority = isPromiseDebtorHighPriority(
              brokenPromiseCount,
              escalationThreshold,
            )

            return (
              <React.Fragment key={inv.id}>
                <tr
                  className={`border-b border-gray-100 cursor-pointer ${
                    isBrokenPriority || isPromisePriority
                      ? "bg-red-50 hover:bg-red-100"
                      : "hover:bg-gray-50"
                  }`}
                  onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                >
                  {!showResolved && (
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select invoice ${inv.clientName}`}
                        checked={selectedIds.includes(inv.id)}
                        onChange={(event) => toggleSelected(inv.id, event.target.checked)}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{inv.clientName}</div>
                    <div className="text-xs text-gray-400">{inv.clientEmail}</div>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {formatCurrency(inv.amountDue, inv.currency)}
                  </td>
                  <td className="px-4 py-3 text-red-600 font-medium">
                    {daysOverdue(inv.dueDate)}d
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {STAGE_LABELS[inv.currentStage] ?? inv.currentStage}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {isHeld
                      ? "Waiting for allowance"
                      : inv.status === "snoozed"
                      ? `Snoozed until ${formatDate(inv.snoozedUntil)}`
                      : inv.status === "sequence_complete"
                      ? "—"
                      : formatDate(inv.nextEmailAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-3 ${p2p || brokenPromiseCount > 0 ? "cursor-pointer" : ""}`}
                    onClick={(event) => {
                      if (!p2p && brokenPromiseCount === 0) return
                      event.stopPropagation()
                      openPromiseDetail(inv.id)
                    }}
                  >
                    {p2p?.type === "active" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 hover:underline">
                        🤝 Pays {formatDate(p2p.promise.promisedPayBy)}
                      </span>
                    )}
                    {p2p?.type === "broken" && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100 hover:underline"
                        title={`Promised ${formatDate(p2p.promise.promisedPayBy)} — not paid`}
                      >
                        ⚠️ Missed{p2p.brokenCount > 1 ? ` (${p2p.brokenCount}×)` : ""}
                      </span>
                    )}
                    {brokenPromiseCount > 0 && (
                      <span
                        className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border hover:underline ${
                          isPromisePriority
                            ? "bg-red-50 text-red-700 border-red-100"
                            : "bg-amber-50 text-amber-700 border-amber-100"
                        }`}
                        title="Debtor-level broken promise history"
                      >
                        Broken history: {brokenPromiseCount}
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-4 py-3 ${arrangement ? "cursor-pointer" : ""}`}
                    onClick={(event) => {
                      if (!arrangement) return
                      event.stopPropagation()
                      openArrangementDetail(arrangement.arrangement.id)
                    }}
                  >
                    {arrangement?.type === "active" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100 hover:underline">
                        🧾 Active ({arrangementScopeLabel(arrangement.arrangement)})
                      </span>
                    )}
                    {arrangement?.type === "broken" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100 hover:underline">
                        ⚠️ Broken arrangement
                      </span>
                    )}
                    {arrangement?.type === "fulfilled" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-100 hover:underline">
                        ✓ Fulfilled
                      </span>
                    )}
                  </td>
                </tr>

                {isExpanded && (
                  <tr className="bg-gray-50">
                  <td colSpan={showResolved ? 8 : 9} className="px-4 py-3">
                      {arrangement && (
                        <div className="mb-3 text-xs text-gray-700">
                          <p className="font-medium text-gray-600 mb-1">Arrangement</p>
                          <div
                            className="flex flex-wrap gap-4 cursor-pointer hover:underline"
                            onClick={(event) => {
                              event.stopPropagation()
                              openArrangementDetail(arrangement.arrangement.id)
                            }}
                          >
                            <span>Type: {arrangementTypeLabel(arrangement.arrangement.arrangementType)}</span>
                            <span>Scope: {arrangementScopeLabel(arrangement.arrangement)}</span>
                            <span>Status: {arrangement.arrangement.status}</span>
                            <span>
                              Repayment:
                              {arrangement.arrangement.agreedAmount
                                ? ` ${formatCurrency(arrangement.arrangement.agreedAmount, arrangement.arrangement.currency)}`
                                : " Full balance"}
                            </span>
                            <span>Target date: {formatDate(arrangement.arrangement.promisedPayBy)}</span>
                          </div>
                        </div>
                      )}
                      <p className="text-xs font-medium text-gray-500 mb-2">Email history</p>
                      {inv.emailLogs.length === 0 ? (
                        <p className="text-xs text-gray-400">No emails sent yet.</p>
                      ) : (
                        <div className="space-y-1">
                          {inv.emailLogs.map((log) => (
                            <div
                              key={log.id}
                              className="text-xs text-gray-600 flex gap-4 cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1"
                              onClick={(event) => {
                                event.stopPropagation()
                                setSelectedEmailLog(log)
                              }}
                            >
                              <span className="w-20 shrink-0 text-gray-400">
                                Stage {log.stage}
                              </span>
                              <span>{formatDate(log.sentAt)}</span>
                              <span className="text-gray-400 truncate">{log.subject}</span>
                              <span className="text-gray-400 truncate">from {log.fromAddress}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
        </table>
      </div>

      {selectedEmailLog && (
        <DetailModal
          title={`Stage ${selectedEmailLog.stage} email`}
          onClose={() => setSelectedEmailLog(null)}
        >
          <div className="space-y-1 text-xs text-gray-600 mb-3">
            <div>
              <span className="font-medium text-gray-500">Subject:</span> {selectedEmailLog.subject}
            </div>
            <div>
              <span className="font-medium text-gray-500">From:</span> {selectedEmailLog.fromAddress}
            </div>
            <div>
              <span className="font-medium text-gray-500">Sent:</span> {formatDate(selectedEmailLog.sentAt)}
            </div>
          </div>
          <hr className="border-gray-100 mb-3" />
          {selectedEmailLog.htmlBody ? (
            <div
              className="text-sm text-gray-800 [&_a]:text-blue-600 [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedEmailLog.htmlBody) }}
            />
          ) : selectedEmailLog.textBody ? (
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">
              {selectedEmailLog.textBody}
            </pre>
          ) : (
            <p className="text-xs text-gray-400">
              Content not available for emails sent before this feature was added.
            </p>
          )}
        </DetailModal>
      )}

      {selectedArrangementId && (
        <DetailModal title="Arrangement detail" onClose={closeArrangementDetail}>
          {arrangementDetailLoading && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          {arrangementDetailError && (
            <p className="text-xs text-red-600">{arrangementDetailError}</p>
          )}
          {arrangementDetail && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-4 text-xs text-gray-700">
                <span>Type: {arrangementTypeLabel(arrangementDetail.arrangementType)}</span>
                <span>Status: {arrangementDetail.status}</span>
                <span>
                  Repayment:
                  {arrangementDetail.agreedAmount
                    ? ` ${formatCurrency(arrangementDetail.agreedAmount, arrangementDetail.currency)}`
                    : " Full balance"}
                </span>
                <span>Target date: {formatDate(arrangementDetail.promisedPayBy)}</span>
              </div>
              {arrangementDetail.termsNotes && (
                <div className="text-xs text-gray-700">
                  <p className="font-medium text-gray-500 mb-1">Terms / notes</p>
                  <p className="whitespace-pre-wrap">{arrangementDetail.termsNotes}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">
                  Covered invoices ({arrangementDetail.coverages.length})
                </p>
                <div className="space-y-1">
                  {arrangementDetail.coverages.map((coverage) => (
                    <div key={coverage.invoiceId} className="text-xs text-gray-600 flex gap-4">
                      <span className="truncate">{coverage.clientName}</span>
                      <span>{formatCurrency(coverage.amountDue, coverage.currency)}</span>
                      <span className="text-gray-400">{coverage.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DetailModal>
      )}

      {selectedPromiseInvoice && (
        <DetailModal title="Promise history" onClose={closePromiseDetail}>
          {selectedPromiseInvoice.promisesToPay.length === 0 ? (
            <p className="text-xs text-gray-400">No promise history for this invoice.</p>
          ) : (
            <div className="space-y-3">
              {selectedPromiseInvoice.promisesToPay.map((promise) => (
                <div key={promise.id} className="text-xs text-gray-700 border-b border-gray-100 pb-2 last:border-0">
                  <div className="flex flex-wrap gap-4">
                    <span className="font-medium text-gray-900">
                      {PROMISE_STATUS_LABELS[promise.status] ?? promise.status}
                    </span>
                    <span>Pay by: {formatDate(promise.promisedPayBy)}</span>
                    <span>
                      Amount:
                      {promise.promisedAmount
                        ? ` ${formatCurrency(promise.promisedAmount, selectedPromiseInvoice.currency)}`
                        : " Full balance"}
                    </span>
                    <span className="text-gray-400">Submitted: {formatDate(promise.createdAt)}</span>
                  </div>
                  {promise.clientNotes && (
                    <p className="mt-1 whitespace-pre-wrap text-gray-600">{promise.clientNotes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DetailModal>
      )}
    </div>
  )
}
