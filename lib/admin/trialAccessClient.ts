import { z } from "zod"
import type { TrialManagementSnapshot } from "@/lib/admin/trialAccessManagement"
import type { TrialPreviewResult, SafeTrialPreviewSnapshot } from "@/lib/billing/trialAccessPreview"
import { freezeTrialExpiry, trialAccessPreviewSchema, trialAccessTimeZoneSchema, trialAccessExpirySchema, trialAccessPlanSchema,
  validateTrialAccessSource, type TrialAccessPreviewInput } from "@/lib/billing/trialAccessInput"

// Browser-safe only: type imports above are erased; never import owner services.
export type TrialForm = { action: "extend_or_grant" | "revoke_grant"; duration: "7" | "14" | "30" | "explicit";
  expiresAt: string; timeZone: string; plan: string; reason: string; notify: boolean }
export type TrialFields = Partial<Record<keyof TrialForm, string>>
export type DeliveryStatus = "not_requested" | "pending" | "sending" | "sent" | "failed" | "unknown" | "blocked" | "superseded"
export interface TrialClientResult { status: "succeeded" | "superseded" | "failed"; after?: SafeTrialPreviewSnapshot; notificationStatus?: DeliveryStatus }
export interface TrialClientState {
  snapshot: TrialManagementSnapshot | null; busy: boolean; phase: "editing" | "preview" | "preview_unknown" | "uncertain" | "pending" | "complete" | "stale";
  operationId: string | null; preview: TrialPreviewResult | null; result: TrialClientResult | null;
  delivery: DeliveryStatus; canReconcile: boolean; canConfirm: boolean; message: string; pollRun: number;
}
export const TRIAL_STATUS_POLL_LIMIT = 4

export function validateTrialForm(form: TrialForm, snapshot: TrialManagementSnapshot, operationId: string, now: Date):
  { input: TrialAccessPreviewInput; errors?: never } | { input?: never; errors: TrialFields } {
  const errors: TrialFields = {}
  if (!form.reason.trim() || form.reason.trim().length > 1000) errors.reason = "Enter a reason of 1–1000 characters."
  if (!trialAccessTimeZoneSchema.safeParse(form.timeZone).success) errors.timeZone = "Enter a valid named IANA timezone, such as Australia/Melbourne."
  if (form.action === "extend_or_grant" && snapshot.eligibility.source === "admin_grant" && !trialAccessPlanSchema.safeParse(form.plan).success) errors.plan = "Select one of the four public plans."
  if (form.action === "extend_or_grant" && form.duration === "explicit" && !trialAccessExpirySchema.safeParse(form.expiresAt).success) errors.expiresAt = "Enter a valid ISO date/time with explicit Z or UTC offset."
  const raw = { operationId, action: form.action, reason: form.reason, notify: form.notify,
    timeZone: form.timeZone, expectedVersion: snapshot.version,
    ...(form.action === "extend_or_grant" ? {
      ...(form.duration === "explicit" ? { expiresAt: form.expiresAt } : { days: Number(form.duration) }),
      ...(snapshot.eligibility.source === "admin_grant" ? { plan: form.plan } : {}),
    } : {}) }
  const parsed = trialAccessPreviewSchema.safeParse(raw)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (field === "timeZone") errors.timeZone = "Enter a valid named IANA timezone, such as Australia/Melbourne."
      else if (field === "expiresAt") errors.expiresAt = "Enter a valid offset ISO date/time matching this timezone (including DST)."
      else if (field === "plan") errors.plan = "Select one of the four public plans."
    }
    // A union may report only its root; independently validate the visible fields.
    if (!errors.reason && !errors.timeZone && !errors.expiresAt && !errors.plan) errors.expiresAt = "Check the expiry, timezone and public plan."
    return { errors }
  }
  if (Object.keys(errors).length) return { errors }
  if (form.action === "revoke_grant") return snapshot.eligibility.allowedActions.revokeGrant
    ? { input: parsed.data } : { errors: { action: "There is no revocable grant, or another billing operation is in progress." } }
  const source = snapshot.eligibility.source
  if (!snapshot.eligibility.allowedActions.extendOrGrant || !source) return { errors: { action: "Grant / extension is unavailable. Refresh billing eligibility first." } }
  try {
    validateTrialAccessSource(parsed.data, source)
    if (parsed.data.action === "extend_or_grant") freezeTrialExpiry(parsed.data, { now, source,
      currentEffectiveTrialExpiry: snapshot.access.effectiveTrialExpiresAt ? new Date(snapshot.access.effectiveTrialExpiresAt) : null })
  } catch { return { errors: { expiresAt: "Choose a future expiry later than every current trial source, within the 730-day application horizon." } } }
  // Keep the original offset-bearing input for server validation and stable replay.
  return { input: raw as TrialAccessPreviewInput }
}

export function trialClientError(status: number): string {
  if (status === 400) return "Check the required fields and expiry. No replacement request was sent."
  if (status === 401 || status === 403) return "Current owner elevation is required. Confirm previews in their original elevated session. The original actor may check or reconcile an accepted operation after fresh elevation; notification retry still requires the original session."
  if (status === 404) return "This tenant-scoped operation is unavailable to the current owner. No replacement request was sent."
  if (status === 409) return "Billing state, eligibility or preview changed. Refresh and discard this preview, then explicitly create a new preview. Never add days by retrying a new request."
  if (status === 502) return "The provider rejected this request. Check the stored outcome before starting anything new."
  return "The service is unavailable or the response was lost. Retain this request and check its status; do not start another extension."
}

export function remainingTrialAccess(access: SafeTrialPreviewSnapshot): string {
  if (!access.allowAccess) return "No independent gated access remains if this grant is the sole valid source."
  if (access.source === "paid") return "Independent paid subscription access remains unchanged."
  if (access.source === "past_due_grace") return "Independent past-due grace access and its billing warning remain unchanged."
  if (access.source === "stripe_trial") return "Independent Stripe trial access remains unchanged; only the application grant is removed."
  if (access.source === "onboarding_trial") return "Independent onboarding access remains until its recorded expiry."
  if (access.source === "platform_owner") return "Platform owner internal access remains under the existing plan limits. This is not a paid subscription or trial."
  return "Only this application grant is removed. Any still-valid paid, Stripe trial or onboarding access remains; if none exists, gated access stops immediately."
}

const deliverySchema = z.enum(["not_requested", "pending", "sending", "sent", "failed", "unknown", "blocked", "superseded"])
const accessSchema = z.object({ allowAccess: z.boolean(), effectivePlan: z.string().nullable(),
  source: z.enum(["paid", "stripe_trial", "admin_grant", "onboarding_trial", "past_due_grace", "platform_owner", "none"]),
  effectiveAccessExpiresAt: z.string().nullable(), effectiveTrialExpiresAt: z.string().nullable(),
  effectiveExpirySource: z.enum(["stripe_trial", "admin_grant", "onboarding_trial"]).nullable(), effectiveExpiryPlan: z.string().nullable(),
  stripeTrialEndsAt: z.string().nullable(), billingPlan: z.string().nullable(), billingStatus: z.string().nullable(),
  grant: z.object({ plan: z.string().nullable(), startsAt: z.string().nullable(), expiresAt: z.string().nullable(), revokedAt: z.string().nullable() }).nullable(),
  restriction: z.enum(["past_due", "unpaid", "incomplete", "incomplete_expired", "billing_risk", "unknown_billing_risk",
    "unknown_subscription_status", "unknown_billing_tier", "missing_subscription", "missing_profile"]).nullable(), trialTimingPendingReconciliation: z.boolean() })
const managementSchema = z.object({ tenant: z.object({ displayName: z.string(), labelSource: z.enum(["display_name", "tenant_account_fallback"]) }),
  contact: z.object({ email: z.string().nullable(), name: z.string().nullable(), source: z.enum(["stripe_billing", "owner_fallback"]).nullable(), nameMissing: z.boolean() }),
  version: z.number().int().nonnegative(), billing: z.object({ linked: z.boolean(), plan: z.string(), status: z.string(), stripeTrialEndsAt: z.string().nullable(),
    periodEndsAt: z.string().nullable(), cancelAt: z.string().nullable(), cancelAtPeriodEnd: z.boolean().nullable() }), access: accessSchema,
  eligibility: z.object({ available: z.boolean(), eligible: z.boolean(), source: z.enum(["stripe_trial", "admin_grant"]).nullable(), restrictions: z.array(z.string()),
    resolution: z.literal("billing_portal_or_support").nullable(), allowedActions: z.object({ extendOrGrant: z.boolean(), revokeGrant: z.boolean() }) }) })
const previewSchema = z.object({ operationId: z.uuid(), action: z.enum(["extend_or_grant", "revoke_grant"]), source: z.enum(["stripe_trial", "admin_grant"]),
  status: z.literal("previewed"), previewVersion: z.number().int().nonnegative(), previewExpiresAt: z.string(), targetPlan: z.string().nullable(),
  target: z.object({ expiresAt: z.string(), localExpiresAt: z.string(), timeZone: z.string(), offset: z.string() }).nullable(),
  billingEffect: z.enum(["stripe_first_billing_timing", "application_access_only", "grant_removal_only"]), previous: accessSchema })
const resultSchema = z.object({ status: z.enum(["succeeded", "superseded", "failed"]), after: accessSchema.optional(),
  notificationStatus: deliverySchema.optional(), notification: z.object({ status: deliverySchema }).optional() })
const statusSchema = z.object({ operationId: z.uuid(), status: z.enum(["previewed", "expired_preview", "pending", "reconciliation_required", "succeeded", "failed", "conflicted"]),
  result: resultSchema.nullable(), notificationStatus: deliverySchema, canReconcile: z.boolean(), reconciliationRequired: z.boolean() })

export function createTrialAccessClient(options: { tenantId: string; snapshot: TrialManagementSnapshot | null;
  fetch: typeof fetch; changed: (state: TrialClientState) => void; refreshed: () => void;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> }): {
  state: () => TrialClientState; preview: (input: TrialAccessPreviewInput) => Promise<void>; retryPreview: () => Promise<void>;
  confirm: () => Promise<void>; check: () => Promise<void>; reconcile: () => Promise<void>; retryNotification: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  let state: TrialClientState = { snapshot: options.snapshot, busy: false, phase: "editing", operationId: null,
    preview: null, result: null, delivery: "not_requested", canReconcile: false, canConfirm: false, message: "", pollRun: 0 }
  let savedInput: TrialAccessPreviewInput | null = null
  const storageKey = `paidsoon-owner-trial-operation:${options.tenantId}`
  try {
    const restored = z.uuid().safeParse(options.storage?.getItem(storageKey))
    if (restored.success) state = { ...state, operationId: restored.data, phase: "uncertain", pollRun: 1,
      message: "A retained operation needs a read-only status check. Server authorization still requires its original actor with current owner elevation." }
  } catch { /* Memory retention still works when browser storage is unavailable. */ }
  const base = `/api/admin/tenants/${encodeURIComponent(options.tenantId)}/trial-access`
  const change = (patch: Partial<TrialClientState>): void => { state = { ...state, ...patch }; options.changed(state) }
  async function request(path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
    const response = await options.fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", cache: "no-store",
      credentials: "same-origin", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) })
    // Never consume raw server errors, IDs, reasons or provider details for display.
    if (!response.ok && response.status !== 502) return { status: response.status, data: null }
    return { status: response.status, data: await response.json() }
  }
  function failure(status: number, phase: TrialClientState["phase"]): void {
    change({ phase: status === 409 ? "stale" : phase, canConfirm: false, message: trialClientError(status) })
  }
  function result(raw: unknown): boolean {
    const parsed = resultSchema.safeParse(raw)
    if (!parsed.success) return false
    change({ phase: "complete", result: parsed.data, delivery: parsed.data.notification?.status ?? parsed.data.notificationStatus ?? state.delivery,
      canReconcile: false, canConfirm: false, message: parsed.data.status === "succeeded"
        ? "Access change completed. Notification delivery is separate and cannot undo or repeat it."
        : parsed.data.status === "superseded" ? "Newer verified billing state superseded this operation. Current independent access was preserved."
        : "The access operation failed. No success notification is implied." })
    options.refreshed()
    return true
  }
  async function sendPreview(): Promise<void> {
    if (state.busy || !savedInput) return
    change({ busy: true, message: "Saving a 15-minute preview…" })
    try {
      const response = await request("/preview", savedInput)
      if (response.status !== 200) {
        // Preview never changes access. A definitive validation/auth rejection
        // may be discarded explicitly; an unavailable response may have saved it.
        failure(response.status, response.status < 500 ? "stale" : "preview_unknown")
        if (response.status >= 500) change({ pollRun: state.pollRun + 1 })
        return
      }
      const parsed = previewSchema.safeParse(response.data)
      if (!parsed.success || parsed.data.operationId !== state.operationId) throw new Error("Invalid safe preview")
      change({ phase: "preview", preview: parsed.data as TrialPreviewResult, canConfirm: true,
        message: "Saved preview. The absolute expiry is frozen; confirmation must use this original elevated session." })
    } catch { change({ phase: "preview_unknown", message: trialClientError(503), canConfirm: false, pollRun: state.pollRun + 1 }) }
    finally { change({ busy: false }) }
  }
  async function check(): Promise<void> {
    if (state.busy || !state.operationId) return
    change({ busy: true })
    try {
      const response = await request(`/operations/${state.operationId}`)
      const parsed = statusSchema.safeParse(response.data)
      if (![200, 202, 502].includes(response.status) || !parsed.success || parsed.data.operationId !== state.operationId) {
        // A scoped 404 after a lost response is not proof that a new mutation is safe.
        change({ message: trialClientError(response.status), canConfirm: false }); return
      }
      const value = parsed.data
      if (value.result && result(value.result)) change({ delivery: value.notificationStatus })
      else if (value.reconciliationRequired) change({ phase: "pending", canReconcile: value.canReconcile, canConfirm: false,
        message: "Outcome pending reconciliation. Status checks are read-only. Only the original actor with current owner elevation may explicitly reconcile the frozen request." })
      else if (value.status === "previewed") change({ phase: state.preview ? "preview" : savedInput ? "preview_unknown" : "stale", canConfirm: Boolean(state.preview),
        message: state.preview ? "The stored preview is still unconfirmed. Explicit confirmation uses its original expiry and session."
          : savedInput ? "The preview was saved. Explicitly retrieve the identical saved preview; do not create another duration request."
          : "The retained preview was never confirmed. Its original-session form is unavailable. Refresh and discard it before explicitly creating a new preview." })
      else if (["expired_preview", "conflicted"].includes(value.status)) failure(409, "stale")
      else change({ phase: "complete", canConfirm: false, message: "This operation has finished. Refresh verified state before a new preview." })
    } catch { change({ message: trialClientError(503), canConfirm: false }) }
    finally { change({ busy: false }) }
  }
  async function mutate(kind: "confirm" | "reconcile" | "notification"): Promise<void> {
    if (state.busy || !state.operationId) return
    if (kind === "confirm" && (!state.preview || !state.canConfirm)) return
    if (kind === "reconcile" && !state.canReconcile) return
    change({ busy: true, canConfirm: false })
    try {
      const path = kind === "confirm" ? "/operations" : `/operations/${state.operationId}/${kind === "notification" ? "notification/retry" : "reconcile"}`
      const response = await request(path, kind === "confirm" ? { operationId: state.operationId, expectedVersion: state.preview!.previewVersion } : {})
      if (kind === "notification") {
        const parsed = z.object({ notification: z.object({ status: deliverySchema }) }).safeParse(response.data)
        change(parsed.success && response.status === 200 ? { delivery: parsed.data.notification.status,
          message: "Delivery-only retry checked. The completed access change was not repeated." }
          : { message: `Access result unchanged. ${trialClientError(response.status)} Notification retry requires the original elevated session.` })
      } else if (response.status === 202) {
        change({ phase: "pending", canReconcile: true, pollRun: state.pollRun + 1,
          message: "Request accepted; its outcome is pending reconciliation. No extra days will be added by status checks." })
      } else if (![200, 502].includes(response.status) || !result(response.data)) {
        failure(response.status, "uncertain")
        if (response.status >= 500) change({ pollRun: state.pollRun + 1 })
      }
    } catch {
      if (kind === "notification") change({ message: "Access result unchanged. Delivery response was lost; check status before another delivery-only attempt." })
      else change({ phase: "uncertain", pollRun: state.pollRun + 1, message: trialClientError(503) })
    } finally { change({ busy: false }) }
  }
  return {
    state: () => state,
    preview: async (input) => {
      if (state.busy || state.operationId) return
      savedInput = structuredClone(input)
      try { options.storage?.setItem(storageKey, input.operationId) } catch { /* Never store reason, recipient or provider data. */ }
      change({ operationId: input.operationId })
      await sendPreview()
    },
    retryPreview: sendPreview, confirm: () => mutate("confirm"), check, reconcile: () => mutate("reconcile"), retryNotification: () => mutate("notification"),
    refresh: async () => {
      if (state.busy || ["uncertain", "pending", "preview_unknown"].includes(state.phase)) return
      change({ busy: true })
      try {
        const response = await request("")
        // This endpoint is an owner-only allowlisted snapshot, not a profile row.
        const parsed = managementSchema.safeParse(response.data)
        if (response.status !== 200 || !parsed.success) {
          change({ message: trialClientError(response.status) }); return
        }
        const value = parsed.data
        savedInput = null
        try { options.storage?.removeItem(storageKey) } catch { /* No authority comes from storage. */ }
        change({ snapshot: value, phase: "editing", operationId: null, preview: null, result: null,
          delivery: "not_requested", canConfirm: false, canReconcile: false,
          message: "Fresh billing state loaded; the old preview was discarded. Explicitly save a new preview before confirming." })
        options.refreshed()
      } catch { change({ message: trialClientError(503) }) }
      finally { change({ busy: false }) }
    },
  }
}

export async function pollTrialAccessStatus(client: ReturnType<typeof createTrialAccessClient>, signal: AbortSignal,
  wait: (signal: AbortSignal) => Promise<void>): Promise<void> {
  for (let attempt = 0; attempt < TRIAL_STATUS_POLL_LIMIT; attempt++) {
    await wait(signal)
    if (signal.aborted || !["uncertain", "pending", "preview_unknown"].includes(client.state().phase)) return
    await client.check()
  }
}