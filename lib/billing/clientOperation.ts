import { z } from "zod"

export type BillingClientProps = { billingAccessVersion: number | null; billingSessionScope: string }
const intentSchema = z.object({
  operationId: z.uuid(), version: z.number().int().nonnegative().safe(),
  path: z.enum(["/api/billing/checkout", "/api/billing/portal", "/api/billing/cancel", "/api/billing/downgrade"]),
  method: z.enum(["POST", "DELETE"]), body: z.object({ tier: z.string() }).strict().nullable(),
}).strict()
export type BillingIntent = z.infer<typeof intentSchema>
export type BillingRequest = Pick<BillingIntent, "path" | "method" | "body">
const resultSchema = z.union([
  z.object({ url: z.string() }).strict(), z.object({ redirectUrl: z.string() }).strict(),
  z.object({ scheduledAt: z.iso.datetime() }).strict(), z.object({ cancelled: z.literal(true) }).strict(),
])
export type BillingResult = z.infer<typeof resultSchema>
export function billingResultNavigation(result: BillingResult, origin: string): string | null {
  const destination = "url" in result ? result.url : "redirectUrl" in result ? result.redirectUrl : null
  if (!destination) return null
  try {
    const url = new URL(destination, origin)
    return url.protocol === "https:" || (url.origin === origin && url.protocol === "http:") ? url.href : null
  } catch { return null }
}
const statusSchema = z.object({
  operationId: z.uuid(), status: z.enum(["pending", "reconciliation_required", "succeeded", "failed", "superseded"]),
  canReconcile: z.boolean(), result: resultSchema.nullable(),
})
export type BillingClientState = {
  intent: BillingIntent | null; busy: boolean; phase: "idle" | "pending" | "conflict" | "succeeded" | "failed" | "superseded";
  canReconcile: boolean; message: string | null;
}
export const BILLING_STORAGE_KEY = "paidsoon.billing-operation.v1"
export const BILLING_POLL_ATTEMPTS = 6
export const BILLING_PENDING_MESSAGE = "We cannot yet confirm this billing request. This does not confirm a charge, plan change, cancellation or access change. Check its status or explicitly reconcile the same request; do not start a replacement."
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">
type Dependencies = {
  scope: string; storage: Storage; fetch: typeof fetch; uuid: () => string;
  changed: (state: BillingClientState) => void; refresh: () => void;
  success: (result: BillingResult) => void;
}
export function billingSafetyHeaders(intent: BillingIntent): Record<string, string> {
  const valid = intentSchema.parse(intent)
  return { "Content-Type": "application/json", "Idempotency-Key": valid.operationId, "X-Billing-Access-Version": String(valid.version) }
}

/** No mutation retries. Persist BEFORE dispatch; never persist results/hosted URLs.
 * One active intent per authenticated tab prevents another UI surface replacing uncertainty.
 */
export function createBillingClientOperation(d: Dependencies): {
  state: () => BillingClientState; start: (request: BillingRequest, version: number | null) => Promise<void>;
  check: (signal?: AbortSignal) => Promise<void>; reconcile: () => Promise<void>; beginNewIntent: () => void;
  clearSession: () => void; dispose: () => void;
} {
  let state: BillingClientState = { intent: null, busy: false, phase: "idle", canReconcile: false, message: null }
  let disabled = false
  const lifetime = new AbortController()
  const emit = (patch: Partial<BillingClientState>): void => { state = { ...state, ...patch }; d.changed(state) }
  let restoredPhase: BillingClientState["phase"] = "pending"
  const restore = (): BillingIntent | null => {
    try {
      const saved: unknown = JSON.parse(d.storage.getItem(BILLING_STORAGE_KEY) ?? "null")
      const parsed = z.object({ scope: z.string(), intent: intentSchema, terminal: z.enum(["succeeded", "failed", "superseded"]).optional() }).strict().safeParse(saved)
      if (parsed.success && parsed.data.scope === d.scope) {
        restoredPhase = parsed.data.terminal ?? "pending"
        return parsed.data.intent
      }
      d.storage.removeItem(BILLING_STORAGE_KEY)
    } catch { /* No usable saved intent. start still requires durable browser storage. */ }
    return null
  }
  state.intent = restore()
  if (state.intent) state = { ...state, phase: restoredPhase, message: restoredPhase === "pending" ? BILLING_PENDING_MESSAGE : "Previous billing request completed. Review current billing details; no subscription change is inferred from hosted session creation." }
  function rememberTerminal(terminal: "succeeded" | "failed" | "superseded"): void {
    try {
      const saved = restore()
      if (saved && saved.operationId !== state.intent?.operationId) return
      d.storage.setItem(BILLING_STORAGE_KEY, JSON.stringify({ scope: d.scope, intent: state.intent, terminal }))
    }
    catch { /* Keep the in-memory identity if storage is subsequently disabled. */ }
  }
  function terminal(result: BillingResult, phase: "succeeded" | "superseded" = "succeeded"): void {
    if (["succeeded", "superseded"].includes(state.phase)) return
    rememberTerminal(phase)
    emit({ phase, canReconcile: false, message: phase === "superseded" ? "This request was superseded. Review refreshed billing details before choosing another action." : "Billing request confirmed. Hosted checkout or portal creation alone does not confirm a subscription change." })
    if (phase === "succeeded") d.success(result)
    else d.refresh()
  }
  async function receive(response: Response, statusRead: boolean): Promise<void> {
    if (disabled) return
    if (response.status === 401) { clearSession(); d.refresh(); return }
    if (response.status === 409) {
      emit({ phase: "conflict", message: "Billing details or another reservation changed. Details have been refreshed. The original request identity is retained; check its status before taking further action.", canReconcile: false })
      d.refresh()
      return
    }
    if (!response.ok) {
      // Even a gateway error may follow durable acceptance. Never mint a new key.
      emit({ phase: "pending", message: response.status === 404 ? "This request is not available yet. Its outcome is not confirmed. Keep this request and contact support if status remains unavailable." : BILLING_PENDING_MESSAGE, canReconcile: false })
      return
    }
    const body: unknown = await response.json()
    if (disabled) return
    if (response.status === 202 || statusRead) {
      const parsed = statusSchema.safeParse(body)
      if (!parsed.success || parsed.data.operationId !== state.intent?.operationId) throw new Error("Invalid operation response")
      const status = parsed.data
      if (status.status === "succeeded" || status.status === "superseded") {
        if (!status.result) throw new Error("Missing operation result")
        terminal(status.result, status.status)
      } else if (status.status === "failed") {
        rememberTerminal("failed")
        emit({ phase: "failed", canReconcile: false, message: "This billing request was rejected. Review refreshed billing details before starting a different request." })
        d.refresh()
      } else emit({ phase: "pending", canReconcile: status.canReconcile, message: BILLING_PENDING_MESSAGE })
      return
    }
    terminal(resultSchema.parse(body))
  }
  async function send(path: string, init: RequestInit, statusRead: boolean): Promise<void> {
    if (disabled || state.busy) return
    emit({ busy: true })
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(10000), ...(init.signal ? [init.signal] : [])])
    try {
      const response = await d.fetch(path, { ...init, signal, credentials: "same-origin", cache: "no-store" })
      if (!signal.aborted) await receive(response, statusRead)
    }
    catch {
      if (!disabled && !init.signal?.aborted) emit({ phase: "pending", message: BILLING_PENDING_MESSAGE })
    } finally { if (!disabled) emit({ busy: false }) }
  }
  async function start(request: BillingRequest, version: number | null): Promise<void> {
    if (disabled || state.busy) return
    const saved = restore()
    if (saved && saved.operationId !== state.intent?.operationId) emit({ intent: saved, phase: restoredPhase, message: BILLING_PENDING_MESSAGE })
    // Existing uncertainty wins even if the caller selects a different plan or receives a new version.
    if (state.intent && !["succeeded", "failed", "superseded"].includes(state.phase)) {
      await check()
      return
    }
    if (state.intent && request.path === state.intent.path && request.method === state.intent.method && request.body?.tier === state.intent.body?.tier) {
      if (state.phase === "succeeded") emit({ phase: "pending" }) // Explicit re-open, never a render-time redirect loop.
      await check()
      return
    }
    const parsed = intentSchema.safeParse({ ...request, operationId: d.uuid(), version })
    if (!parsed.success) { emit({ message: "Billing details are unavailable. Refresh the page before making a request." }); d.refresh(); return }
    const intent = parsed.data
    try { d.storage.setItem(BILLING_STORAGE_KEY, JSON.stringify({ scope: d.scope, intent })) }
    catch { emit({ message: "Browser session storage is unavailable. Enable it before making a billing request." }); return }
    emit({ intent, phase: "pending", canReconcile: false, message: null })
    await send(intent.path, { method: intent.method, headers: billingSafetyHeaders(intent), ...(intent.body ? { body: JSON.stringify(intent.body) } : {}) }, false)
  }
  async function check(signal?: AbortSignal): Promise<void> {
    if (state.intent) await send(`/api/billing/operations/${state.intent.operationId}`, { method: "GET", signal }, true)
  }
  async function reconcile(): Promise<void> {
    if (state.intent && state.canReconcile) await send(`/api/billing/operations/${state.intent.operationId}/reconcile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, false)
  }
  function beginNewIntent(): void {
    if (disabled || state.busy || !["succeeded", "failed", "superseded"].includes(state.phase)) return
    const saved = restore()
    if (saved && saved.operationId !== state.intent?.operationId) {
      emit({ intent: saved, phase: restoredPhase, message: BILLING_PENDING_MESSAGE })
      return
    }
    try { d.storage.removeItem(BILLING_STORAGE_KEY) }
    catch { return }
    // Separate explicit acknowledgement; never dispatch or generate a replacement key here.
    emit({ intent: null, phase: "idle", canReconcile: false, message: "Review current billing details, then choose and confirm a new billing request." })
    d.refresh()
  }
  function clearSession(): void {
    disabled = true
    lifetime.abort()
    try { d.storage.removeItem(BILLING_STORAGE_KEY) } catch { /* Restricted storage. */ }
    emit({ intent: null, busy: false, phase: "idle", message: null, canReconcile: false })
  }
  return { state: () => state, start, check, reconcile, beginNewIntent, clearSession, dispose: () => { disabled = true; lifetime.abort() } }
}

/** Bounded GET-only observation. Abort cancels the request and cadence on unmount. */
export async function pollBillingOperation(
  controller: ReturnType<typeof createBillingClientOperation>, signal: AbortSignal,
  wait: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  for (let attempt = 0; attempt < BILLING_POLL_ATTEMPTS && !signal.aborted; attempt++) {
    if (["idle", "succeeded", "failed", "superseded"].includes(controller.state().phase)) return
    await controller.check(signal)
    if (attempt < BILLING_POLL_ATTEMPTS - 1 && !signal.aborted) await wait(signal)
  }
}