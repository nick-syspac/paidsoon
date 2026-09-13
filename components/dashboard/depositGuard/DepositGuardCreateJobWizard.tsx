"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import type {
  DepositGuardJobCreateInput,
  DepositGuardJobPreviewResult,
} from "@/lib/depositGuard/jobForms"

type StepId = 1 | 2 | 3 | 4

interface WizardFormState {
  customerId: string
  externalQuoteId: string
  externalQuoteNumber: string
  accountingProvider: string
  name: string
  description: string
  reference: string
  currency: string
  quotedAmountCents: string
  sourceAmountCents: string
  taxAmountCents: string
  sourceTaxMode: "inclusive" | "exclusive"
  depositType: "none" | "percentage" | "fixed"
  depositPercentage: string
  depositFixedAmountCents: string
  roundingMode: "nearest" | "up" | "down"
  expectedStartDate: string
  expectedCompletionDate: string
  requestDueDate: string
  sendInitialRequest: boolean
}

function buildDefaultRequestDueDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  return date.toISOString().slice(0, 16)
}

const INITIAL_FORM: WizardFormState = {
  customerId: "",
  externalQuoteId: "",
  externalQuoteNumber: "",
  accountingProvider: "",
  name: "",
  description: "",
  reference: "",
  currency: "aud",
  quotedAmountCents: "",
  sourceAmountCents: "0",
  taxAmountCents: "",
  sourceTaxMode: "exclusive",
  depositType: "percentage",
  depositPercentage: "20",
  depositFixedAmountCents: "",
  roundingMode: "nearest",
  expectedStartDate: "",
  expectedCompletionDate: "",
  requestDueDate: buildDefaultRequestDueDate(),
  sendInitialRequest: true,
}

function centsFromInput(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.round(parsed * 100))
}

function isoFromDateInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function toPayload(form: WizardFormState, includeName: boolean): DepositGuardJobCreateInput | Record<string, unknown> {
  return {
    ...(includeName ? { name: form.name.trim() } : {}),
    customerId: form.customerId.trim() || null,
    externalQuoteId: form.externalQuoteId.trim() || null,
    externalQuoteNumber: form.externalQuoteNumber.trim() || null,
    accountingProvider: form.accountingProvider.trim() || null,
    description: form.description.trim() || null,
    reference: form.reference.trim() || null,
    currency: form.currency.trim().toLowerCase(),
    quotedAmountCents: centsFromInput(form.quotedAmountCents),
    sourceAmountCents: centsFromInput(form.sourceAmountCents) ?? 0,
    taxAmountCents: centsFromInput(form.taxAmountCents),
    sourceTaxMode: form.sourceTaxMode,
    depositType: form.depositType,
    depositPercentage: form.depositType === "percentage" ? Number(form.depositPercentage || 0) : null,
    depositFixedAmountCents:
      form.depositType === "fixed" ? centsFromInput(form.depositFixedAmountCents) : null,
    roundingMode: form.roundingMode,
    expectedStartDate: isoFromDateInput(form.expectedStartDate),
    expectedCompletionDate: isoFromDateInput(form.expectedCompletionDate),
  }
}

function formatAudCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fieldClassName(): string {
  return "mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
}

function stepLabel(step: StepId): string {
  switch (step) {
    case 1:
      return "Customer"
    case 2:
      return "Job"
    case 3:
      return "Deposit"
    case 4:
      return "Review"
  }
}

export function DepositGuardCreateJobWizard({
  canSubmit,
}: {
  canSubmit: boolean
}) {
  const router = useRouter()
  const [step, setStep] = useState<StepId>(1)
  const [form, setForm] = useState<WizardFormState>(INITIAL_FORM)
  const [preview, setPreview] = useState<DepositGuardJobPreviewResult | null>(null)
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setPreviewStatus("loading")
      setPreviewError(null)

      const response = await fetch("/api/deposit-guard/jobs/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form, false)),
        signal: controller.signal,
      }).catch(() => null)

      if (!response) {
        if (!controller.signal.aborted) {
          setPreviewStatus("error")
          setPreviewError("Preview unavailable right now.")
        }
        return
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        if (!controller.signal.aborted) {
          setPreviewStatus("error")
          setPreviewError(typeof payload?.error === "string" ? payload.error : "Preview unavailable right now.")
        }
        return
      }

      const payload = (await response.json().catch(() => null)) as { preview?: DepositGuardJobPreviewResult } | null
      if (!controller.signal.aborted) {
        setPreviewStatus("ready")
        setPreview(payload?.preview ?? null)
      }
    }, 350)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [form])

  function updateField<K extends keyof WizardFormState>(key: K, value: WizardFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setSaveError(null)

    if (form.sendInitialRequest && !form.requestDueDate) {
      setSaving(false)
      setSaveError("Add a due date for the first request or disable sending it now.")
      return
    }

    if (form.sendInitialRequest && !previewReady) {
      setSaving(false)
      setSaveError("Wait for the server preview to finish loading before sending the first request.")
      return
    }

    const response = await fetch("/api/deposit-guard/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(form, true)),
    })

    setSaving(false)

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setSaveError(typeof payload?.error === "string" ? payload.error : "Failed to create DepositGuard job.")
      return
    }

    const payload = (await response.json().catch(() => null)) as { job?: { id: string } } | null
    if (payload?.job?.id) {
      if (form.sendInitialRequest && previewReady && preview.requiredDepositAmountCents > 0) {
        const requestResponse = await fetch("/api/deposit-guard/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: payload.job.id,
            requestType: "deposit",
            description: form.description.trim() || form.name.trim(),
            amountCents: preview.requiredDepositAmountCents,
            taxAmountCents: 0,
            totalAmountCents: preview.requiredDepositAmountCents,
            currency: form.currency.trim().toLowerCase(),
            dueDate: new Date(form.requestDueDate).toISOString(),
          }),
        })

        if (!requestResponse.ok) {
          const requestPayload = await requestResponse.json().catch(() => null)
          setSaveError(typeof requestPayload?.error === "string" ? requestPayload.error : "The job was created, but the first request could not be sent.")
          router.push(`/dashboard/deposit-guard/${payload.job.id}`)
          router.refresh()
          return
        }

        const requestPayload = await requestResponse.json().catch(() => null)
        if (requestPayload?.request?.id) {
          const sendResponse = await fetch(`/api/deposit-guard/requests/${requestPayload.request.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "send" }),
          })

          if (!sendResponse.ok) {
            setSaveError("The job was created, but the first request could not be sent.")
          }
        }
      }

      router.push(`/dashboard/deposit-guard/${payload.job.id}`)
      router.refresh()
    }
  }

  const previewReady = previewStatus === "ready" && preview !== null

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Create workflow</p>
            <h1 className="mt-1 text-xl font-semibold text-gray-900">New DepositGuard job</h1>
            <p className="mt-1 text-sm text-gray-600">
              Follow the customer, job, deposit, and review steps. Totals are always recalculated on the server before submit.
            </p>
          </div>
          <div className="flex gap-2 text-xs font-medium text-gray-500">
            {[1, 2, 3, 4].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStep(item as StepId)}
                className={`rounded-full px-3 py-1 ${step === item ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-700"}`}
              >
                {item}. {stepLabel(item as StepId)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
        <div className="space-y-4">
          <section className={`rounded-xl border ${step === 1 ? "border-blue-300 bg-blue-50/40" : "border-gray-200 bg-white"} p-5`}>
            <h2 className="text-base font-semibold text-gray-900">1. Customer</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label>
                <span className="text-sm font-medium text-gray-700">Customer ID</span>
                <input value={form.customerId} onChange={(event) => updateField("customerId", event.target.value)} className={fieldClassName()} placeholder="Optional internal customer ID" />
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700">Accounting provider</span>
                <input value={form.accountingProvider} onChange={(event) => updateField("accountingProvider", event.target.value)} className={fieldClassName()} placeholder="Xero, QuickBooks, etc." />
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700">External quote ID</span>
                <input value={form.externalQuoteId} onChange={(event) => updateField("externalQuoteId", event.target.value)} className={fieldClassName()} placeholder="Quote identifier from source system" />
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700">External quote number</span>
                <input value={form.externalQuoteNumber} onChange={(event) => updateField("externalQuoteNumber", event.target.value)} className={fieldClassName()} placeholder="Q-1007" />
              </label>
            </div>
          </section>

          <section className={`rounded-xl border ${step === 2 ? "border-blue-300 bg-blue-50/40" : "border-gray-200 bg-white"} p-5`}>
            <h2 className="text-base font-semibold text-gray-900">2. Quote / job</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="text-sm font-medium text-gray-700">Job name</span>
                <input value={form.name} onChange={(event) => updateField("name", event.target.value)} className={fieldClassName()} placeholder="Website redesign for Acme" required />
              </label>
              <label className="md:col-span-2">
                <span className="text-sm font-medium text-gray-700">Description</span>
                <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} className={fieldClassName()} rows={4} placeholder="Short description of the work" />
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700">Reference</span>
                <input value={form.reference} onChange={(event) => updateField("reference", event.target.value)} className={fieldClassName()} placeholder="Internal reference or PO" />
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700">Currency</span>
                <input value={form.currency} onChange={(event) => updateField("currency", event.target.value)} className={fieldClassName()} placeholder="AUD" />
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700">Quoted amount</span>
                <input value={form.quotedAmountCents} onChange={(event) => updateField("quotedAmountCents", event.target.value)} className={fieldClassName()} placeholder="2500" inputMode="decimal" />
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700">Source amount</span>
                <input value={form.sourceAmountCents} onChange={(event) => updateField("sourceAmountCents", event.target.value)} className={fieldClassName()} placeholder="2500" inputMode="decimal" required />
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700">Tax amount</span>
                <input value={form.taxAmountCents} onChange={(event) => updateField("taxAmountCents", event.target.value)} className={fieldClassName()} placeholder="250" inputMode="decimal" />
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700">Tax mode</span>
                <select value={form.sourceTaxMode} onChange={(event) => updateField("sourceTaxMode", event.target.value as WizardFormState["sourceTaxMode"])} className={fieldClassName()}>
                  <option value="exclusive">Exclusive</option>
                  <option value="inclusive">Inclusive</option>
                </select>
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700">Expected start date</span>
                <input type="datetime-local" value={form.expectedStartDate} onChange={(event) => updateField("expectedStartDate", event.target.value)} className={fieldClassName()} />
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700">Expected completion date</span>
                <input type="datetime-local" value={form.expectedCompletionDate} onChange={(event) => updateField("expectedCompletionDate", event.target.value)} className={fieldClassName()} />
              </label>
            </div>
          </section>

          <section className={`rounded-xl border ${step === 3 ? "border-blue-300 bg-blue-50/40" : "border-gray-200 bg-white"} p-5`}>
            <h2 className="text-base font-semibold text-gray-900">3. Deposit</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label>
                <span className="text-sm font-medium text-gray-700">Deposit type</span>
                <select value={form.depositType} onChange={(event) => updateField("depositType", event.target.value as WizardFormState["depositType"])} className={fieldClassName()}>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                  <option value="none">No deposit</option>
                </select>
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700">Rounding mode</span>
                <select value={form.roundingMode} onChange={(event) => updateField("roundingMode", event.target.value as WizardFormState["roundingMode"])} className={fieldClassName()}>
                  <option value="nearest">Nearest</option>
                  <option value="up">Round up</option>
                  <option value="down">Round down</option>
                </select>
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700">Send first request now</span>
                <select
                  value={form.sendInitialRequest ? "yes" : "no"}
                  onChange={(event) => updateField("sendInitialRequest", event.target.value === "yes")}
                  className={fieldClassName()}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              {form.sendInitialRequest ? (
                <label>
                  <span className="text-sm font-medium text-gray-700">First request due date</span>
                  <input
                    type="datetime-local"
                    value={form.requestDueDate}
                    onChange={(event) => updateField("requestDueDate", event.target.value)}
                    className={fieldClassName()}
                  />
                </label>
              ) : null}
              {form.depositType === "percentage" ? (
                <label>
                  <span className="text-sm font-medium text-gray-700">Deposit percentage</span>
                  <input value={form.depositPercentage} onChange={(event) => updateField("depositPercentage", event.target.value)} className={fieldClassName()} placeholder="20" inputMode="decimal" />
                </label>
              ) : null}
              {form.depositType === "fixed" ? (
                <label>
                  <span className="text-sm font-medium text-gray-700">Fixed deposit amount</span>
                  <input value={form.depositFixedAmountCents} onChange={(event) => updateField("depositFixedAmountCents", event.target.value)} className={fieldClassName()} placeholder="500" inputMode="decimal" />
                </label>
              ) : null}
            </div>
          </section>

          <section className={`rounded-xl border ${step === 4 ? "border-blue-300 bg-blue-50/40" : "border-gray-200 bg-white"} p-5`}>
            <h2 className="text-base font-semibold text-gray-900">4. Review & send</h2>
            <p className="mt-2 text-sm text-gray-600">
              Review the server-calculated totals below, then create the job. You can create and send the first deposit request in the same step.
            </p>

            {saveError ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{saveError}</div> : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1) as StepId)} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50" disabled={step === 1}>
                Back
              </button>
              <button type="button" onClick={() => setStep((current) => Math.min(4, current + 1) as StepId)} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50" disabled={step === 4}>
                Next
              </button>
              <button type="submit" disabled={!canSubmit || saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300">
                {saving ? "Creating..." : form.sendInitialRequest ? "Create job & send request" : "Create job"}
              </button>
              {!canSubmit ? <span className="self-center text-sm text-amber-700">This tier can preview deposits, but job creation is not enabled yet.</span> : null}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-base font-semibold text-gray-900">Server preview</h2>
            {previewStatus === "loading" ? <p className="mt-3 text-sm text-gray-600">Refreshing totals from the server...</p> : null}
            {previewStatus === "error" ? <p className="mt-3 text-sm text-red-700">{previewError ?? "Preview unavailable."}</p> : null}

            {previewReady ? (
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-600">Source amount</dt>
                  <dd className="font-medium text-gray-900">{formatAudCents(preview.sourceAmountCents)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-600">Tax amount</dt>
                  <dd className="font-medium text-gray-900">{formatAudCents(preview.taxAmountCents)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-600">Total amount</dt>
                  <dd className="font-medium text-gray-900">{formatAudCents(preview.totalAmountCents)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-600">Required deposit</dt>
                  <dd className="font-medium text-gray-900">{formatAudCents(preview.requiredDepositAmountCents)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-600">Outstanding balance</dt>
                  <dd className="font-medium text-gray-900">{formatAudCents(preview.outstandingAmountCents)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-600">Commencement blocked</dt>
                  <dd className="font-medium text-gray-900">{preview.commencementBlocked ? "Yes" : "No"}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-gray-600">Fill in the deposit fields to see the current server calculation.</p>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-base font-semibold text-gray-900">Workflow summary</h2>
            <ol className="mt-3 space-y-2 text-sm text-gray-700">
              <li>1. Capture customer and source details.</li>
              <li>2. Enter the quote or job totals.</li>
              <li>3. Choose the deposit type and rounding.</li>
              <li>4. Review the server preview and create the job.</li>
            </ol>
          </section>
        </aside>
      </div>
    </form>
  )
}