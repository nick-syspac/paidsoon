"use client"

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, Clock3, X, ArrowRight, RefreshCw, Mail, AlertTriangle } from "lucide-react"
import type { TrialManagementSnapshot } from "@/lib/admin/trialAccessManagement"
import { createTrialAccessClient, pollTrialAccessStatus, remainingTrialAccess, validateTrialForm,
  type TrialClientState, type TrialFields, type TrialForm } from "@/lib/admin/trialAccessClient"
import { getPublicPlans } from "@/lib/subscriptionPlans"
import { Spinner } from "@/components/ui/Spinner"

interface Props { tenantId: string; initialSnapshot: TrialManagementSnapshot | null }
const inputClass = "w-full rounded-lg border border-gray-600 bg-gray-950 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50"
const buttonClass = "rounded-lg border border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-100 hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
const planName = (plan: string | null | undefined): string => getPublicPlans().find((entry) => entry.id === plan)?.name ?? (plan ? plan.replaceAll("_", " ") : "No plan")
const initialState = (snapshot: TrialManagementSnapshot | null): TrialClientState => ({ snapshot, busy: false, phase: "editing", operationId: null,
  preview: null, result: null, delivery: "not_requested", canReconcile: false, canConfirm: false, message: "", pollRun: 0 })

/** Mounted by the server ONLY after owner authorization. Props contain no profile,
 * provider references, reasons, operation journal or session credentials. */
export function TrialAccessManager({ tenantId, initialSnapshot }: Props): ReactElement {
  const router = useRouter()
  const prefix = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const controller = useRef<ReturnType<typeof createTrialAccessClient> | null>(null)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<TrialClientState>(() => initialState(initialSnapshot))
  const [form, setForm] = useState<TrialForm>({ action: "extend_or_grant", duration: "7", expiresAt: "", timeZone: "UTC",
    plan: "essentials", reason: "", notify: false })
  const [errors, setErrors] = useState<TrialFields>({})
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    const client = createTrialAccessClient({ tenantId, snapshot: initialSnapshot, fetch: (...args) => fetch(...args),
      changed: setState, refreshed: () => router.refresh(), storage: {
        getItem: (key) => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value), removeItem: (key) => sessionStorage.removeItem(key),
      } })
    controller.current = client
    let mounted = true
    queueMicrotask(() => { if (mounted) setState(client.state()) })
    return () => { mounted = false; controller.current = null }
    // The mounted owner flow retains its original snapshot/operation across RSC refresh.
    // A changed tenant remounts this component through its server key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, router])
  useEffect(() => {
    if (!open) return
    dialog.current?.showModal()
    heading.current?.focus()
  }, [open])
  useEffect(() => {
    // Preview/confirmation/recovery can unmount the focused action. Keep
    // keyboard focus inside the modal rather than leaving it on document.body.
    if (open && !dialog.current?.contains(document.activeElement)) heading.current?.focus()
  }, [open, state.phase])
  useEffect(() => {
    if (!state.preview) return
    const update = (): void => setExpired(Date.now() >= Date.parse(state.preview!.previewExpiresAt))
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [state.preview])
  useEffect(() => {
    if (!state.pollRun || !controller.current) return
    const abort = new AbortController()
    void pollTrialAccessStatus(controller.current, abort.signal, (signal) => new Promise<void>((resolve) => {
      const done = (): void => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve() }
      const timer = setTimeout(done, 2000)
      signal.addEventListener("abort", done, { once: true })
    }))
    return () => abort.abort()
  }, [state.pollRun])
  const snapshot = state.snapshot
  const preview = state.preview
  const editing = state.phase === "editing"
  const blocked = !snapshot?.eligibility.allowedActions.extendOrGrant
  const revokeAllowed = Boolean(snapshot?.eligibility.allowedActions.revokeGrant)
  function close(): void { dialog.current?.close(); setOpen(false); trigger.current?.focus() }
  const grantPlan = snapshot?.access.grant?.plan
  const launch = useCallback((): void => {
    if (editing) setForm((current) => ({ ...current, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      plan: grantPlan && getPublicPlans().some((plan) => plan.id === grantPlan) ? grantPlan : "essentials",
      action: blocked && revokeAllowed ? "revoke_grant" : "extend_or_grant" }))
    setOpen(true)
  }, [editing, grantPlan, blocked, revokeAllowed])
  useEffect(() => {
    // The owner-only diagnostics link opens this same manager, including any
    // retained preview/uncertain operation. A fragment never confirms a change.
    const openLinkedManagement = (): void => {
      if (window.location.hash !== "#trial-access") return
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search)
      launch()
    }
    window.addEventListener("hashchange", openLinkedManagement)
    openLinkedManagement()
    return () => window.removeEventListener("hashchange", openLinkedManagement)
  }, [launch])
  async function savePreview(): Promise<void> {
    if (!snapshot || !controller.current) return
    const value = validateTrialForm(form, snapshot, crypto.randomUUID(), new Date())
    setErrors(value.errors ?? {})
    if (value.errors) {
      const field = Object.keys(value.errors)[0]
      document.getElementById(`${prefix}-${field}`)?.focus()
      return
    }
    await controller.current.preview(value.input)
  }
  function fieldError(field: keyof TrialForm): ReactElement | null {
    return errors[field] ? <p id={`${prefix}-${field}-error`} className="mt-1 text-sm text-rose-300">{errors[field]}</p> : null
  }
  const fieldA11y = (field: keyof TrialForm): { "aria-invalid": boolean; "aria-describedby"?: string } => ({
    "aria-invalid": Boolean(errors[field]), "aria-describedby": errors[field] ? `${prefix}-${field}-error` : undefined,
  })
  return <>
    <button ref={trigger} type="button" onClick={launch} className={`${buttonClass} inline-flex items-center gap-2 border-emerald-600 bg-emerald-950/50 text-emerald-200`}>
      <ShieldCheck size={17} aria-hidden="true" /> Manage trial access
    </button>
    <dialog ref={dialog} aria-labelledby={`${prefix}-title`} aria-describedby={`${prefix}-description`}
      onCancel={(event) => { event.preventDefault(); close() }} onClose={() => { setOpen(false); trigger.current?.focus() }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); close(); return }
        if (event.key !== "Tab") return
        const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]") ?? []).filter((node) => node.getClientRects().length > 0)
        const first = nodes[0], last = nodes.at(-1)
        if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-0 text-gray-100 shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4 border-b border-gray-800 p-5 sm:p-6">
        <div><p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-300"><ShieldCheck size={14} aria-hidden="true" /> Owner workspace</p>
          <h2 ref={heading} tabIndex={-1} id={`${prefix}-title`} className="text-xl font-semibold outline-none">Manage trial access</h2>
          <p id={`${prefix}-description`} className="mt-2 text-sm text-gray-400">{snapshot?.tenant.displayName ?? "Tenant account"} · Review a saved preview before changing access.</p></div>
        <button type="button" onClick={close} aria-label="Close trial access dialog" className={`${buttonClass} p-2`}><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        {snapshot && <div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-700 bg-gray-950/60 p-4 text-sm">
          <div><p className="text-xs text-gray-400">Persisted billing</p><p>{planName(snapshot.billing.plan)} · {snapshot.billing.status}</p></div>
          <div><p className="text-xs text-gray-400">Effective access</p><p>{planName(snapshot.access.effectivePlan)} · {snapshot.access.source.replaceAll("_", " ")}</p></div>
          <div className="col-span-2 border-t border-gray-800 pt-3"><p className="text-xs text-gray-400">Billing contact · {snapshot.contact.source === "stripe_billing" ? "Verified Stripe" : "Owner-contact fallback / unavailable"}</p>
            <p className="break-words">{snapshot.contact.email ?? "Email unavailable — optional notification would be blocked; access changes can still proceed."}</p></div>
        </div>}
        {blocked && <div className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
          <p className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle size={16} aria-hidden="true" /> Grant / extension unavailable</p>
          <p>{!snapshot?.eligibility.available ? "Fresh billing eligibility is unavailable. Refresh before proceeding."
            : snapshot.access.source === "paid" ? "Paid subscription access already applies. Trial management cannot change the purchased plan or billing dates."
            : "Billing restrictions or another unresolved billing operation prevent grants and extensions. Grants cannot bypass debt, disputes or billing obligations."}</p>
          <p className="mt-2">Use the tenant’s existing billing portal or the established support resolution workflow. No subscription is resumed or debt forgiven here.</p>
          {revokeAllowed && <p className="mt-2">The existing application grant can still be revoked independently. Other valid access remains unchanged.</p>}
        </div>}
        {editing && snapshot && <form noValidate onSubmit={(event) => { event.preventDefault(); void savePreview() }} className="space-y-5">
          <fieldset disabled={state.busy} className="space-y-4">
            <legend className="mb-3 text-sm font-semibold">1. Choose the access change</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" disabled={blocked} aria-pressed={form.action === "extend_or_grant"} onClick={() => setForm({ ...form, action: "extend_or_grant" })}
                className={`${buttonClass} text-left ${form.action === "extend_or_grant" ? "border-emerald-500 bg-emerald-950/40" : ""}`}>Extend / grant access</button>
              <button type="button" disabled={!revokeAllowed} aria-pressed={form.action === "revoke_grant"} onClick={() => setForm({ ...form, action: "revoke_grant" })}
                className={`${buttonClass} text-left ${form.action === "revoke_grant" ? "border-rose-500 bg-rose-950/40" : ""}`}>Revoke application grant</button>
            </div>
            {fieldError("action")}
            {form.action === "extend_or_grant" ? <>
              <div><label className="mb-2 block text-sm font-medium" htmlFor={`${prefix}-duration`}>Expiry option (required)</label>
                <select id={`${prefix}-duration`} className={inputClass} value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value as TrialForm["duration"] })}>
                  <option value="7">7 elapsed days</option><option value="14">14 elapsed days</option><option value="30">30 elapsed days</option><option value="explicit">Specific date / time with offset</option>
                </select><p className="mt-2 text-xs text-gray-400">Each day is 24 hours, even across DST. Added from the later of server now or the latest effective trial expiry.</p></div>
              {form.duration === "explicit" && <div><label htmlFor={`${prefix}-expiresAt`} className="mb-2 block text-sm font-medium">Expiry ISO date / time with UTC offset (required)</label>
                <input id={`${prefix}-expiresAt`} required className={inputClass} placeholder="2026-11-20T17:00:00+11:00" value={form.expiresAt} {...fieldA11y("expiresAt")}
                  onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} />
                <p className="mt-2 text-xs text-gray-400">Include Z or ±HH:MM; a local offset must match the named timezone. DST gaps are rejected; an overlap needs an explicit matching offset.</p>{fieldError("expiresAt")}</div>}
              {form.duration !== "explicit" && fieldError("expiresAt")}
              {snapshot.eligibility.source === "admin_grant" && <div><label htmlFor={`${prefix}-plan`} className="mb-2 block text-sm font-medium">Application grant plan (required)</label>
                <select id={`${prefix}-plan`} required className={inputClass} value={form.plan} {...fieldA11y("plan")} onChange={(event) => setForm({ ...form, plan: event.target.value })}>
                  {getPublicPlans().map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                </select>{fieldError("plan")}</div>}
              <p className="rounded-lg bg-gray-800/70 p-3 text-sm text-gray-300">{snapshot.eligibility.source === "stripe_trial"
                ? "Stripe trial extension — the server selects this source and retains the Stripe plan. This changes first-billing timing; future charges are not waived."
                : "PaidSoon access only — Stripe billing unchanged. No charge is postponed and no subscription is created, restarted or resumed."}</p>
            </> : <div className="rounded-lg border border-rose-900 bg-rose-950/25 p-3 text-sm text-rose-200">
              <p className="font-medium">Remove only the current application grant</p><p className="mt-1">{remainingTrialAccess(snapshot.access)}</p>
              <p className="mt-1">Revocation does not cancel paid access, shorten a Stripe trial, or remove valid onboarding access.</p></div>}
            <div><label htmlFor={`${prefix}-timeZone`} className="mb-2 block text-sm font-medium">IANA display timezone (required)</label>
              <input id={`${prefix}-timeZone`} required className={inputClass} value={form.timeZone} {...fieldA11y("timeZone")} onChange={(event) => setForm({ ...form, timeZone: event.target.value })} />{fieldError("timeZone")}</div>
            <div><label htmlFor={`${prefix}-reason`} className="mb-2 block text-sm font-medium">Internal reason (required, 1–1000 characters)</label>
              <textarea id={`${prefix}-reason`} required rows={3} className={inputClass} value={form.reason} {...fieldA11y("reason")} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
              <p className="mt-1 text-xs text-gray-400">{form.reason.trim().length}/1000 · Audit only; never included in the customer notification.</p>{fieldError("reason")}</div>
            <label className="flex items-start gap-3 rounded-lg border border-gray-700 p-3 text-sm" htmlFor={`${prefix}-notify`}>
              <input id={`${prefix}-notify`} type="checkbox" checked={form.notify} onChange={(event) => setForm({ ...form, notify: event.target.checked })} className="mt-1 accent-emerald-500" />
              <span><span className="flex items-center gap-2 font-medium"><Mail size={15} aria-hidden="true" /> Notify billing contact (optional)</span><span className="mt-1 block text-gray-400">Off by default. Delivery is separate from the access result; missing email blocks only communication.</span></span>
            </label>
          </fieldset>
          <button type="submit" disabled={state.busy || (form.action === "extend_or_grant" ? blocked : !revokeAllowed)} className={`${buttonClass} flex w-full items-center justify-center gap-2 border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`}>
            Save 15-minute preview <ArrowRight size={16} aria-hidden="true" /></button>
        </form>}
        {preview && state.phase === "preview" && <section aria-label="Saved confirmation preview" className="space-y-4 rounded-xl border border-emerald-800 bg-emerald-950/25 p-4">
          <h3 className="flex items-center gap-2 font-semibold text-emerald-200"><Clock3 size={17} aria-hidden="true" /> 2. Review the frozen change</h3>
          <p className="text-sm">{preview.action === "revoke_grant" ? "Revoke application grant only" : `${planName(preview.targetPlan)} · ${preview.source === "stripe_trial" ? "Stripe trial" : "Application grant"}`}</p>
          {preview.target && <dl className="space-y-2 text-sm"><div><dt className="text-gray-400">Local expiry</dt><dd className="break-words font-mono">{preview.target.localExpiresAt}</dd></div>
            <div><dt className="text-gray-400">Timezone / UTC offset</dt><dd>{preview.target.timeZone} · UTC{preview.target.offset}</dd></div>
            <div><dt className="text-gray-400">Absolute UTC expiry (frozen)</dt><dd className="break-words font-mono">{preview.target.expiresAt}</dd></div></dl>}
          <p className="text-sm text-gray-300">{preview.billingEffect === "stripe_first_billing_timing" ? "Stripe first-billing timing changes. The Stripe plan and unrelated billing settings remain unchanged; no future-charge waiver is promised."
            : preview.billingEffect === "application_access_only" ? "PaidSoon access only — Stripe billing unchanged. This does not postpone a Stripe charge."
            : `${remainingTrialAccess(preview.previous)} Stripe billing is unchanged.`}</p>
          <p className="text-xs text-gray-400">Preview valid until {preview.previewExpiresAt} (UTC). Confirmation uses this operation and version in the original elevated session, never a recalculated duration.</p>
          {expired && <p role="alert" className="text-sm text-amber-300">Preview expired. Refresh and explicitly save a new preview.</p>}
          <button type="button" disabled={state.busy || expired || !state.canConfirm} onClick={() => void controller.current?.confirm()} className={`${buttonClass} w-full border-emerald-600 bg-emerald-600 hover:bg-emerald-700`}>
            {preview.action === "revoke_grant" ? "Confirm grant revocation" : "Confirm frozen access change"}</button>
        </section>}
        <div role="status" aria-live="polite" aria-atomic="true" className="text-sm text-gray-300">
          {state.busy && <span className="mr-2 inline-flex"><Spinner /></span>}{state.message}
        </div>
        {state.result && <section aria-label="Access and notification outcomes" className="space-y-2 rounded-xl border border-gray-700 p-4 text-sm">
          <h3 className="font-semibold">Access: {state.result.status}</h3>
          {state.result.after && <p>{planName(state.result.after.effectivePlan)} · {state.result.after.source.replaceAll("_", " ")} · {state.result.after.effectiveAccessExpiresAt ?? "No trial-derived cutoff"}</p>}
          {state.result.after && preview?.action === "revoke_grant" && <p>{remainingTrialAccess(state.result.after)}</p>}
          <p>Notification delivery: <strong>{state.delivery.replaceAll("_", " ")}</strong></p>
          <p className="text-gray-400">A failed, blocked or unknown email does not undo access. Retry affects delivery only; provider outcome safety is checked by the server.</p>
          {["failed", "unknown", "blocked"].includes(state.delivery) && <button type="button" disabled={state.busy} onClick={() => void controller.current?.retryNotification()} className={buttonClass}>Retry notification only</button>}
        </section>}
        <div className="flex flex-wrap gap-2 border-t border-gray-800 pt-4">
          {state.operationId && <button type="button" disabled={state.busy} onClick={() => void controller.current?.check()} className={buttonClass}>Check operation status</button>}
          {state.phase === "preview_unknown" && <button type="button" disabled={state.busy} onClick={() => void controller.current?.retryPreview()} className={buttonClass}>Retrieve identical saved preview</button>}
          {state.canReconcile && <button type="button" disabled={state.busy} onClick={() => void controller.current?.reconcile()} className={buttonClass}>Reconcile original operation</button>}
          {!["uncertain", "pending", "preview_unknown"].includes(state.phase) && <button type="button" disabled={state.busy} onClick={() => { setErrors({}); setForm((value) => ({ ...value, notify: false })); void controller.current?.refresh() }} className={`${buttonClass} inline-flex items-center gap-2`}>
            <RefreshCw size={14} aria-hidden="true" /> {state.operationId ? "Refresh & discard preview" : "Refresh billing eligibility"}</button>}
        </div>
        {["pending", "uncertain", "preview_unknown"].includes(state.phase) && <p className="text-xs text-gray-400">Up to four automatic read-only status checks, two seconds apart. No automatic POST retries. Keep this page open to retain the request; closing this dialog does not discard it. Re-elevation permits status/recovery only for the original actor, not confirmation of an old preview.</p>}
      </div>
    </dialog>
  </>
}