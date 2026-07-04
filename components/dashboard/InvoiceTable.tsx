"use client"

import React, { useState } from "react"
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

type InvoiceWithLogs = TrackedInvoice & {
  emailLogs: EmailLog[]
  promisesToPay: PromiseToPay[]
  arrangementCoverages: ArrangementCoverageWithArrangement[]
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
}: {
  invoices: InvoiceWithLogs[]
  showResolved?: boolean
  brokenPromiseCountsByDebtor?: Record<string, number>
  escalationThreshold?: number
}) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [confirmResolve, setConfirmResolve] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [arrangementType, setArrangementType] = useState<"full_payment" | "partial_payment">("full_payment")
  const [promisedPayBy, setPromisedPayBy] = useState("")
  const [agreedAmount, setAgreedAmount] = useState("")
  const [arrangementSubmitting, setArrangementSubmitting] = useState(false)
  const [arrangementError, setArrangementError] = useState<string | null>(null)

  async function doAction(id: string, action: "pause" | "resume" | "snooze" | "resolve") {
    setLoadingId(id)
    await fetch(`/api/invoices/${id}/${action}`, { method: "POST" })
    setLoadingId(null)
    setConfirmResolve(null)
    router.refresh()
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
        </div>
      )}
      <table className="w-full text-sm">
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
            {!showResolved && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const status = STATUS_LABELS[inv.status] ?? { label: inv.status, color: "bg-gray-100 text-gray-600" }
            const isExpanded = expandedId === inv.id
            const isLoading = loadingId === inv.id
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
                    {inv.status === "snoozed"
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
                  <td className="px-4 py-3">
                    {p2p?.type === "active" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                        🤝 Pays {formatDate(p2p.promise.promisedPayBy)}
                      </span>
                    )}
                    {p2p?.type === "broken" && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100"
                        title={`Promised ${formatDate(p2p.promise.promisedPayBy)} — not paid`}
                      >
                        ⚠️ Missed{p2p.brokenCount > 1 ? ` (${p2p.brokenCount}×)` : ""}
                      </span>
                    )}
                    {brokenPromiseCount > 0 && (
                      <span
                        className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
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
                  <td className="px-4 py-3">
                    {arrangement?.type === "active" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                        🧾 Active ({arrangementScopeLabel(arrangement.arrangement)})
                      </span>
                    )}
                    {arrangement?.type === "broken" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                        ⚠️ Broken arrangement
                      </span>
                    )}
                    {arrangement?.type === "fulfilled" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                        ✓ Fulfilled
                      </span>
                    )}
                  </td>
                  {!showResolved && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {inv.status === "pending" && (
                        <>
                          <button
                            onClick={() => doAction(inv.id, "snooze")}
                            disabled={isLoading}
                            className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-40"
                          >
                            Snooze
                          </button>
                          <button
                            onClick={() => doAction(inv.id, "pause")}
                            disabled={isLoading}
                            className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-40"
                          >
                            Pause
                          </button>
                          <button
                            onClick={() => createArrangement([inv.id])}
                            disabled={arrangementSubmitting}
                            className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-40"
                          >
                            Arrange
                          </button>
                        </>
                      )}
                      {inv.status === "paused" && (
                        <button
                          onClick={() => doAction(inv.id, "resume")}
                          disabled={isLoading}
                          className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40"
                        >
                          Resume
                        </button>
                      )}
                      {confirmResolve === inv.id ? (
                        <>
                          <button
                            onClick={() => doAction(inv.id, "resolve")}
                            disabled={isLoading}
                            className="text-xs text-green-600 hover:text-green-800 font-medium"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmResolve(null)}
                            className="text-xs text-gray-400"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmResolve(inv.id)}
                          className="text-xs text-gray-400 hover:text-gray-700"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </td>
                  )}
                </tr>

                {isExpanded && (
                  <tr className="bg-gray-50">
                  <td colSpan={showResolved ? 8 : 10} className="px-4 py-3">
                      {arrangement && (
                        <div className="mb-3 text-xs text-gray-700">
                          <p className="font-medium text-gray-600 mb-1">Arrangement</p>
                          <div className="flex flex-wrap gap-4">
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
                            <div key={log.id} className="text-xs text-gray-600 flex gap-4">
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
  )
}
