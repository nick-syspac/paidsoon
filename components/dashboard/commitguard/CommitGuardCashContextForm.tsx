"use client"

import { useEffect, useRef, useState, type ReactElement } from "react"
import { Spinner } from "@/components/ui/Spinner"
import { COMMIT_GUARD_CURRENCIES, type CommitGuardCashContextDto } from "@/lib/commitguard/cashContext"
import {
  cashContextDraft, requestCashContext, saveCashContextDraft, validateCashContextDraft,
  type CashContextDraft, type CashContextErrors, type CashContextRequest,
} from "@/lib/commitguard/cashContextClient"

interface CashContextFormProps {
  onRefresh: () => void | Promise<void>
  onMutation?: () => void
  initialContext?: CommitGuardCashContextDto
  mutationBlocked?: boolean
  request?: CashContextRequest
}

const emptyDraft: CashContextDraft = {
  amount: "", currency: "", balanceAsOf: "", weeklyAmount: "", weeklyCurrency: "", weeklyAsOf: "", taxCurrency: "",
}
const inputStyle = "mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
const buttonStyle = "rounded-md border border-gray-300 px-3 py-2 text-sm font-medium disabled:opacity-50"

function SavedInputs({ context }: { context: CommitGuardCashContextDto }): ReactElement {
  const values = cashContextDraft(context)
  return <dl className="mt-2 space-y-1 text-sm">
    <div><dt className="inline font-medium">Saved gross cash: </dt><dd className="inline">{context.amountCents === null ? "Missing" : `${values.amount} ${values.currency.toUpperCase()} as of ${values.balanceAsOf} (UTC) — ${context.freshness}`}</dd></div>
    <div><dt className="inline font-medium">Saved weekly expense basis: </dt><dd className="inline">{context.weeklyOperatingExpensesCents === null ? "Missing" : `${values.weeklyAmount} ${values.weeklyCurrency.toUpperCase()} as of ${values.weeklyAsOf} (UTC) — ${context.weeklyExpensesFreshness}`}</dd></div>
    <div><dt className="inline font-medium">Saved tax-protection currency: </dt><dd className="inline">{values.taxCurrency.toUpperCase() || "Not attested"}</dd></div>
  </dl>
}

/** Financial drafts are never replaced by background reads or revision conflicts. */
export function CommitGuardCashContextForm({ onRefresh, onMutation, initialContext, mutationBlocked = false, request = fetch }: CashContextFormProps): ReactElement {
  const [context, setContext] = useState<CommitGuardCashContextDto | null>(initialContext ?? null)
  const [draft, setDraft] = useState<CashContextDraft>(initialContext ? cashContextDraft(initialContext) : emptyDraft)
  const [errors, setErrors] = useState<CashContextErrors>({})
  const [busy, setBusy] = useState(!initialContext)
  const [conflict, setConflict] = useState(false)
  const [comparison, setComparison] = useState<CommitGuardCashContextDto | null>(null)
  const [message, setMessage] = useState("")
  const [refreshFailed, setRefreshFailed] = useState(false)
  const balanceInput = useRef<HTMLInputElement>(null)
  const expenseInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (initialContext) return
    let active = true
    requestCashContext(request).then((loaded) => {
      if (!active) return
      setContext(loaded)
      setDraft(cashContextDraft(loaded))
    }).catch(() => {
      if (active) setMessage("Cash inputs could not be loaded. Retry loading before editing.")
    }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [initialContext, request])

  function edit(field: keyof CashContextDraft, value: string): void {
    setDraft((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  async function reload(): Promise<void> {
    setBusy(true)
    try {
      const loaded = await requestCashContext(request)
      if (!context) {
        setContext(loaded)
        setDraft(cashContextDraft(loaded))
      } else if (conflict || loaded.revision !== context.revision) {
        setComparison(loaded)
        setConflict(true)
        setMessage("Latest saved inputs loaded below. Your drafts are unchanged. Review before choosing a revision.")
      } else {
        setContext(loaded)
        setMessage("Saved inputs reloaded. Your drafts are unchanged.")
      }
      await onRefresh()
      setRefreshFailed(false)
    } catch {
      setMessage(refreshFailed ? "Save succeeded, but reloading still failed. Retry load; do not save again just to refresh." : "Could not reload saved inputs. Your drafts are unchanged.")
    } finally { setBusy(false) }
  }

  async function save(): Promise<void> {
    if (!context || conflict || busy || mutationBlocked || refreshFailed) return
    const result = validateCashContextDraft(draft, context.revision, new Date())
    if (result.errors) { setErrors(result.errors); setMessage("Check the highlighted cash input fields."); return }
    setBusy(true)
    setMessage("")
    setRefreshFailed(false)
    onMutation?.()
    const outcome = await saveCashContextDraft(request, result.input, (saved) => {
      setContext(saved)
      setDraft(cashContextDraft(saved))
    }, onRefresh)
    if (outcome.kind === "conflict") {
      setConflict(true)
      setComparison(null)
      setMessage("Not saved: cash inputs changed elsewhere (409). Your drafts are safe. Reload saved inputs to review the changes.")
    } else if (outcome.kind === "failed") {
      setMessage("Save was not confirmed. Your drafts are safe. Reload saved inputs before deciding whether to save again.")
      // The response may have been lost after commit; require a read/review, not a blind retry.
      setConflict(true)
      setComparison(null)
    } else {
      setRefreshFailed(outcome.refreshFailed)
      if (outcome.context.revision !== outcome.savedRevision) {
        setConflict(true)
        setComparison(outcome.context)
      } else {
        setContext(outcome.context)
      }
      setMessage(outcome.refreshFailed
        ? "Save succeeded. Saved inputs are shown, but refresh failed. Retry load only; the save will not be repeated."
        : "Cash inputs saved. Saved inputs reloaded and a dashboard refresh requested.")
    }
    setBusy(false)
  }

  function field(key: keyof CashContextDraft, label: string, kind: "amount" | "date" | "currency"): ReactElement {
    const id = `commitguard-cash-${key}`
    const describedBy = `${id}-hint${errors[key] ? ` ${id}-error` : ""}`
    return <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-800">{label}</label>
      {kind === "currency" ? <select id={id} className={inputStyle} value={draft[key]} onChange={(event) => edit(key, event.target.value)} aria-invalid={!!errors[key]} aria-describedby={describedBy}>
        <option value="">{key === "taxCurrency" ? "Not attested" : "Choose currency"}</option>
        {COMMIT_GUARD_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency.toUpperCase()}</option>)}
      </select> : <input id={id} className={inputStyle} type={kind === "date" ? "date" : "text"}
        inputMode={kind === "amount" ? "decimal" : undefined} value={draft[key]}
        ref={key === "amount" ? balanceInput : key === "weeklyAmount" ? expenseInput : undefined}
        onChange={(event) => edit(key, event.target.value)} aria-invalid={!!errors[key]} aria-describedby={describedBy} />}
      <p id={`${id}-hint`} className="mt-1 text-xs text-gray-600">{kind === "date" ? "UTC calendar date; no future dates." : kind === "amount" ? "Major currency units, up to two decimals; no commas or exponents." : "No currency conversion or automatic relabeling."}</p>
      {errors[key] ? <p id={`${id}-error`} className="mt-1 text-sm text-red-700">{errors[key]}</p> : null}
    </div>
  }

  return <section id="cash-inputs" aria-labelledby="commitguard-cash-heading" className="rounded-xl border border-gray-200 bg-white p-5">
    <h2 id="commitguard-cash-heading" className="text-lg font-semibold text-gray-900">Owner-entered cash inputs</h2>
    <p className="mt-2 text-sm text-gray-600">Owner-entered, not bank-verified. Enter gross cash, including reserved cash, not free cash. No bank or provider balance sync is performed.</p>
    <p className="mt-1 text-sm text-gray-600">Cash and weekly expense dates stay fresh through seven elapsed UTC calendar days; day eight is stale. Missing is not zero. These inputs are excluded from settings exports.</p>
    <p className="mt-1 text-sm text-gray-600">Saving refreshes the complete CommitGuard workspace from saved inputs.</p>
    {busy ? <div role="status" className="mt-3 flex items-center gap-2"><Spinner /> Loading or saving cash inputs…</div> : null}
    {message ? <p role="status" className="mt-3 text-sm text-gray-800">{message}</p> : null}
    {context ? <SavedInputs context={initialContext ?? context} /> : <p className="mt-3 text-sm">No cash context loaded yet.</p>}
    {conflict ? <div role="alert" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
      <p>Review required. Saving is blocked to prevent overwriting another edit. Reloading keeps your drafts.</p>
      {comparison ? <><h3 className="mt-2 font-semibold">Latest saved inputs (revision {comparison.revision})</h3><SavedInputs context={comparison} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} className={buttonStyle} onClick={() => { setContext(comparison); setConflict(false); setComparison(null); setMessage("Loaded revision selected. Your drafts are retained; review them and explicitly save to replace the saved inputs.") }}>Keep my drafts and use loaded revision</button>
          <button type="button" disabled={busy} className={buttonStyle} onClick={() => { setContext(comparison); setDraft(cashContextDraft(comparison)); setErrors({}); setConflict(false); setComparison(null); setMessage("Drafts discarded. Latest saved inputs restored.") }}>Discard drafts and use saved inputs</button>
        </div></> : null}
    </div> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={buttonStyle} disabled={busy} onClick={() => void reload()}>{refreshFailed ? "Retry load (do not save again)" : "Reload saved inputs (keep drafts)"}</button>
      {context && context.freshness !== "fresh" ? <button type="button" className={buttonStyle} disabled={busy} onClick={() => balanceInput.current?.focus()}>{context.freshness === "missing" ? "Add missing cash balance" : "Update stale cash balance"}</button> : null}
      {context && context.weeklyExpensesFreshness !== "fresh" ? <button type="button" className={buttonStyle} disabled={busy} onClick={() => expenseInput.current?.focus()}>{context.weeklyExpensesFreshness === "missing" ? "Add weekly expense basis" : "Update stale weekly expense basis"}</button> : null}
    </div>
    <form noValidate onSubmit={(event) => { event.preventDefault(); void save() }} className="mt-5 space-y-5">
      <fieldset disabled={busy || !context} className="space-y-4">
        <legend className="font-semibold">Gross cash balance</legend>
        <p className="text-sm text-gray-600">Zero and negative balances are valid. Supply amount, currency and date together, or clear all three.</p>
        <div className="grid gap-4 sm:grid-cols-3">{field("amount", "Gross cash balance amount", "amount")}{field("currency", "Cash balance currency", "currency")}{field("balanceAsOf", "Balance as of (UTC)", "date")}</div>
        <button type="button" className={buttonStyle} onClick={() => { setDraft((previous) => ({ ...previous, amount: "", currency: "", balanceAsOf: "" })); setErrors({}) }}>Clear balance fields</button>
      </fieldset>
      <fieldset disabled={busy || !context} className="space-y-4">
        <legend className="font-semibold">Weekly operating-expense basis</legend>
        <p className="text-sm text-gray-600">Owner-entered, nonnegative weekly estimate. Its own currency and date are independent of cash. Clearing cash does not clear this basis. Buffer policy remains in settings.</p>
        <div className="grid gap-4 sm:grid-cols-3">{field("weeklyAmount", "Weekly operating expenses amount", "amount")}{field("weeklyCurrency", "Weekly expense currency", "currency")}{field("weeklyAsOf", "Weekly expenses as of (UTC)", "date")}</div>
        <button type="button" className={buttonStyle} onClick={() => { setDraft((previous) => ({ ...previous, weeklyAmount: "", weeklyCurrency: "", weeklyAsOf: "" })); setErrors({}) }}>Clear weekly expense fields</button>
      </fieldset>
      <fieldset disabled={busy || !context} className="space-y-3">
        <legend className="font-semibold">Tax-protection currency attestation</legend>
        <p className="text-sm text-gray-600">Attest the currency of tax protection, not a tax amount. This is owner-entered, not provider-verified; it does not validate reserves or resolve mixed-source tax coverage.</p>
        {field("taxCurrency", "Tax-protection currency", "currency")}
      </fieldset>
      <p className="text-sm text-gray-600">Clear buttons only edit drafts. Select Save cash inputs to persist changes. Changing cash currency never relabels expenses, tax protection or fixed buffers.</p>
      <button type="submit" disabled={busy || !context || conflict || refreshFailed || mutationBlocked} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save cash inputs</button>
    </form>
  </section>
}