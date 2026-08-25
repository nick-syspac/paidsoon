"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

type ScheduleSummary = {
  email1DaysAfterDue: number
  email2DaysAfterDue: number
  email3DaysAfterDue: number
}

type InvoiceSummary = {
  id: string
  clientName: string
  status: string
  amountDue: number
  currency: string
}

type ActionType =
  | "edit-schedule"
  | "pause-invoices"
  | "resume-invoices"
  | "trigger-email"
  | "mark-invoice-paid"

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

export function CustomerQuickActions({
  userId,
  schedule,
  invoices,
}: {
  userId: string
  schedule: ScheduleSummary
  invoices: InvoiceSummary[]
}) {
  const router = useRouter()
  const [activeModal, setActiveModal] = useState<ActionType | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [reason, setReason] = useState("")
  const [email1, setEmail1] = useState(schedule.email1DaysAfterDue)
  const [email2, setEmail2] = useState(schedule.email2DaysAfterDue)
  const [email3, setEmail3] = useState(schedule.email3DaysAfterDue)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(invoices[0]?.id ?? "")
  const [selectedStage, setSelectedStage] = useState<1 | 2 | 3>(1)

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId],
  )

  async function submitAction() {
    if (reason.trim().length < 10 || !activeModal) {
      setError("Reason must be at least 10 characters.")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      if (activeModal === "edit-schedule") {
        const resp = await fetch(`/api/admin/customers/${userId}/actions/edit-schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email1DaysAfterDue: Number(email1),
            email2DaysAfterDue: Number(email2),
            email3DaysAfterDue: Number(email3),
            reason,
          }),
        })
        if (!resp.ok) throw new Error("Failed to update schedule")
      }

      if (activeModal === "pause-invoices" || activeModal === "resume-invoices") {
        const endpoint = activeModal === "pause-invoices" ? "pause-invoices" : "resume-invoices"
        const resp = await fetch(`/api/admin/customers/${userId}/actions/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        })
        if (!resp.ok) throw new Error(`Failed to ${endpoint.replace("-", " ")}`)
      }

      if (activeModal === "trigger-email") {
        if (!selectedInvoiceId) throw new Error("Select an invoice")
        const resp = await fetch(`/api/admin/customers/${userId}/actions/trigger-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId: selectedInvoiceId,
            stage: selectedStage,
            reason,
          }),
        })
        if (!resp.ok) throw new Error("Failed to send email")
      }

      if (activeModal === "mark-invoice-paid") {
        if (!selectedInvoiceId) throw new Error("Select an invoice")
        const resp = await fetch(`/api/admin/customers/${userId}/actions/mark-invoice-paid`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId: selectedInvoiceId,
            reason,
          }),
        })
        if (!resp.ok) throw new Error("Failed to mark invoice as paid")
      }

      setReason("")
      setActiveModal(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setSubmitting(false)
    }
  }

  function openModal(type: ActionType) {
    setActiveModal(type)
    setReason("")
    setError(null)
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h2>
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => openModal("edit-schedule")}
            className="rounded border border-gray-700 px-3 py-2 text-xs text-gray-200 hover:border-blue-500"
          >
            Edit Schedule
          </button>
          <button
            type="button"
            onClick={() => openModal("pause-invoices")}
            className="rounded border border-gray-700 px-3 py-2 text-xs text-gray-200 hover:border-blue-500"
          >
            Pause All
          </button>
          <button
            type="button"
            onClick={() => openModal("resume-invoices")}
            className="rounded border border-gray-700 px-3 py-2 text-xs text-gray-200 hover:border-blue-500"
          >
            Resume All
          </button>
          <button
            type="button"
            onClick={() => openModal("trigger-email")}
            className="rounded border border-gray-700 px-3 py-2 text-xs text-gray-200 hover:border-blue-500"
          >
            Force Send Email
          </button>
        </div>

        <button
          type="button"
          onClick={() => openModal("mark-invoice-paid")}
          className="w-full rounded border border-gray-700 px-3 py-2 text-xs text-gray-200 hover:border-blue-500"
        >
          Mark Invoice Paid
        </button>

        <p className="text-xs text-gray-500">
          Current schedule: D+{schedule.email1DaysAfterDue}, D+{schedule.email2DaysAfterDue}, D+{schedule.email3DaysAfterDue}
        </p>
      </div>

      {activeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Confirm action</h3>

            {activeModal === "edit-schedule" && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                <label className="text-xs text-gray-300">
                  Email 1
                  <input
                    className="mt-1 w-full rounded bg-gray-950 border border-gray-700 px-2 py-1 text-xs"
                    type="number"
                    value={email1}
                    onChange={(event) => setEmail1(Number(event.target.value))}
                  />
                </label>
                <label className="text-xs text-gray-300">
                  Email 2
                  <input
                    className="mt-1 w-full rounded bg-gray-950 border border-gray-700 px-2 py-1 text-xs"
                    type="number"
                    value={email2}
                    onChange={(event) => setEmail2(Number(event.target.value))}
                  />
                </label>
                <label className="text-xs text-gray-300">
                  Email 3
                  <input
                    className="mt-1 w-full rounded bg-gray-950 border border-gray-700 px-2 py-1 text-xs"
                    type="number"
                    value={email3}
                    onChange={(event) => setEmail3(Number(event.target.value))}
                  />
                </label>
              </div>
            )}

            {(activeModal === "trigger-email" || activeModal === "mark-invoice-paid") && (
              <div className="space-y-2 mb-3">
                <label className="text-xs text-gray-300 block">
                  Invoice
                  <select
                    className="mt-1 w-full rounded bg-gray-950 border border-gray-700 px-2 py-1 text-xs"
                    value={selectedInvoiceId}
                    onChange={(event) => setSelectedInvoiceId(event.target.value)}
                  >
                    {invoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.clientName} - {formatCurrency(invoice.amountDue, invoice.currency)} ({invoice.status})
                      </option>
                    ))}
                  </select>
                </label>

                {activeModal === "trigger-email" && (
                  <label className="text-xs text-gray-300 block">
                    Stage
                    <select
                      className="mt-1 w-full rounded bg-gray-950 border border-gray-700 px-2 py-1 text-xs"
                      value={selectedStage}
                      onChange={(event) => setSelectedStage(Number(event.target.value) as 1 | 2 | 3)}
                    >
                      <option value={1}>Stage 1</option>
                      <option value={2}>Stage 2</option>
                      <option value={3}>Stage 3</option>
                    </select>
                  </label>
                )}

                {selectedInvoice && (
                  <p className="text-xs text-gray-500">
                    Selected: {selectedInvoice.clientName} - {formatCurrency(selectedInvoice.amountDue, selectedInvoice.currency)}
                  </p>
                )}
              </div>
            )}

            <label className="text-xs text-gray-300 block mb-2">
              Reason (required)
              <textarea
                autoFocus
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain why this support action is needed"
                className="mt-1 w-full rounded bg-gray-950 border border-gray-700 px-2 py-1 text-xs"
              />
            </label>

            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-gray-700 px-3 py-1 text-xs text-gray-300"
                onClick={() => setActiveModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                onClick={() => void submitAction()}
              >
                {submitting ? "Applying..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
