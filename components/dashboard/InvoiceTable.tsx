"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { TrackedInvoice, EmailLog } from "@/lib/generated/prisma/client"

type InvoiceWithLogs = TrackedInvoice & { emailLogs: EmailLog[] }

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

export function InvoiceTable({
  invoices,
  showResolved = false,
}: {
  invoices: InvoiceWithLogs[]
  showResolved?: boolean
}) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [confirmResolve, setConfirmResolve] = useState<string | null>(null)

  async function doAction(id: string, action: "pause" | "resume" | "snooze" | "resolve") {
    setLoadingId(id)
    await fetch(`/api/invoices/${id}/${action}`, { method: "POST" })
    setLoadingId(null)
    setConfirmResolve(null)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Amount</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Overdue</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Next email</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            {!showResolved && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const status = STATUS_LABELS[inv.status] ?? { label: inv.status, color: "bg-gray-100 text-gray-600" }
            const isExpanded = expandedId === inv.id
            const isLoading = loadingId === inv.id

            return (
              <>
                <tr
                  key={inv.id}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                >
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
                  <tr key={`${inv.id}-expanded`} className="bg-gray-50">
                    <td colSpan={7} className="px-4 py-3">
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
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
