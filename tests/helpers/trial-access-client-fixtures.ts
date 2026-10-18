import type { TrialManagementSnapshot } from "@/lib/admin/trialAccessManagement"
import type { TrialPreviewResult } from "@/lib/billing/trialAccessPreview"
import type { TrialForm } from "@/lib/admin/trialAccessClient"

export const trialTenantId = "11111111-1111-4111-8111-111111111111"
export const trialOperationId = "22222222-2222-4222-8222-222222222222"
export function trialClientSnapshot(): TrialManagementSnapshot {
  return {
    tenant: { displayName: "Acacia Studio", labelSource: "display_name" },
    contact: { name: "Billing owner", email: "billing@example.test", source: "owner_fallback", nameMissing: false },
    version: 4,
    billing: { linked: false, plan: "essentials", status: "canceled", stripeTrialEndsAt: null, periodEndsAt: null, cancelAt: null, cancelAtPeriodEnd: false },
    access: { allowAccess: false, effectivePlan: null, source: "none", effectiveAccessExpiresAt: null, effectiveTrialExpiresAt: null,
      effectiveExpirySource: null, effectiveExpiryPlan: null, stripeTrialEndsAt: null, billingPlan: "essentials", billingStatus: "canceled",
      grant: null, restriction: null, trialTimingPendingReconciliation: false },
    eligibility: { available: true, eligible: true, source: "admin_grant", restrictions: [], resolution: null, allowedActions: { extendOrGrant: true, revokeGrant: false } },
  }
}
export function trialClientForm(): TrialForm {
  return { action: "extend_or_grant", duration: "7", expiresAt: "", timeZone: "Australia/Melbourne", plan: "small_business", reason: "Evaluation follow-up", notify: false }
}
export function trialClientPreview(snapshot = trialClientSnapshot()): TrialPreviewResult {
  return { operationId: trialOperationId, action: "extend_or_grant", source: snapshot.eligibility.source ?? "admin_grant", status: "previewed",
    previewVersion: snapshot.version, previewExpiresAt: "2026-10-17T00:15:00.000Z", targetPlan: "small_business",
    target: { expiresAt: "2026-10-24T00:00:00.000Z", localExpiresAt: "2026-10-24T11:00:00+11:00", timeZone: "Australia/Melbourne", offset: "+11:00" },
    billingEffect: "application_access_only", previous: snapshot.access }
}