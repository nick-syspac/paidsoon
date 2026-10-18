import type { ReactElement, ReactNode } from "react"
import type { UserProfile } from "@/lib/generated/prisma/client"
import type { SafeTrialPreviewSnapshot } from "@/lib/billing/trialAccessPreview"
import type { TrialManagementSnapshot } from "@/lib/admin/trialAccessManagement"

interface Props {
  profile: Pick<UserProfile, "displayName" | "subscriptionTier" | "subscriptionStatus" |
    "stripeCustomerId" | "stripeSubscriptionId" | "trialEndsAt" | "subscriptionCurrentPeriodEnd" |
    "subscriptionCancelAt" | "subscriptionCancelAtPeriodEnd">
  supabaseEmail?: string
  access?: SafeTrialPreviewSnapshot | null
  /** undefined: staff health; null: owner's fresh snapshot unavailable. */
  management?: TrialManagementSnapshot | null
}

const sources = {
  paid: "Paid Stripe subscription", stripe_trial: "Stripe trial", admin_grant: "Admin grant",
  onboarding_trial: "Onboarding trial (not Stripe)", past_due_grace: "Past-due grace", none: "No access source",
  platform_owner: "Platform owner internal access",
}
function date(value: string | Date | null | undefined): string {
  if (!value) return "Unavailable"
  const instant = new Date(value)
  return Number.isFinite(+instant) ? instant.toISOString().replace("T", " ").replace(".000Z", " UTC") : "Unavailable"
}
function plan(value: string | null | undefined): string {
  return value ? value.replace(/_/g, " ") : "Unavailable"
}
function Fact({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return <div className="min-w-0"><dt className="text-gray-500">{label}</dt>
    <dd className="text-gray-100 break-words">{children}</dd></div>
}

/** Server presentation only. No forms, owner operations or provider IDs. */
export function SubscriptionSection({ profile, supabaseEmail, access, management }: Props): ReactElement {
  const current = management?.access ?? access
  const billing = management?.billing
  const owner = management !== undefined
  const unavailable = owner && (!management || !management.eligibility.available)
  const name = management?.tenant.displayName ?? (profile.displayName?.trim() || "Tenant account")
  const fallbackName = management ? management.tenant.labelSource === "tenant_account_fallback" : !profile.displayName?.trim()
  const contact = management?.contact
  const email = management ? contact?.email : supabaseEmail
  const contactSource = management ? contact?.source : supabaseEmail ? "owner_fallback" : null
  const stripeTrialEnd = current ? current.stripeTrialEndsAt : profile.stripeSubscriptionId ? profile.trialEndsAt : null
  const continuity = current?.allowAccess && current.effectiveExpirySource &&
    (current.effectiveExpirySource !== current.source || current.effectiveExpiryPlan !== current.effectivePlan)

  return (
    <section className="bg-gray-900 rounded-lg p-5 space-y-4" aria-label="Subscription">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Subscription</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Fact label="Organisation / tenant account">{name}{fallbackName && <span className="block text-gray-400">Tenant-account fallback — organisation name unavailable</span>}</Fact>
        <Fact label="Primary billing contact">{email || "Email unavailable"}
          <span className="block text-gray-400">{contactSource === "stripe_billing" ? "Verified Stripe billing contact"
            : contactSource === "owner_fallback" ? "Owner-contact fallback (Supabase auth email)" : "Contact unavailable"}</span>
          <span className="block text-gray-400">{contact?.name || "Contact name unavailable"}</span>
        </Fact>
        <Fact label="Persisted billing plan">{plan(billing?.plan ?? profile.subscriptionTier)}</Fact>
        <Fact label="Persisted billing status">{billing?.status ?? profile.subscriptionStatus ?? "Unavailable"}</Fact>
        <Fact label="Stripe billing link">{(billing?.linked ?? Boolean(profile.stripeCustomerId)) ? "Linked" : "Not linked"}</Fact>
        <Fact label="Stripe trial end">{date(stripeTrialEnd)}</Fact>
        {!profile.stripeSubscriptionId && !current?.stripeTrialEndsAt && profile.trialEndsAt && (
          <Fact label="Recorded onboarding trial end (not Stripe)">{date(profile.trialEndsAt)}</Fact>
        )}
        <Fact label="Billing period end (not an access cutoff)">{date(billing?.periodEndsAt ?? profile.subscriptionCurrentPeriodEnd)}</Fact>
        <Fact label="Billing cancellation">{(billing?.cancelAtPeriodEnd ?? profile.subscriptionCancelAtPeriodEnd)
          ? "Scheduled at period end" : "No period-end cancellation recorded"}
          {(billing?.cancelAt ?? profile.subscriptionCancelAt) && <span className="block">{date(billing?.cancelAt ?? profile.subscriptionCancelAt)}</span>}
        </Fact>
        <Fact label="Admin grant plan">{current?.grant ? plan(current.grant.plan) : current ? "No admin grant" : "Unavailable"}</Fact>
        <Fact label="Admin grant expiry">{date(current?.grant?.expiresAt)}
          {current?.grant?.revokedAt && <span className="block">Revoked: {date(current.grant.revokedAt)}</span>}
        </Fact>
        <Fact label="Current effective plan">{current ? current.allowAccess ? plan(current.effectivePlan) : "No gated access" : "Unavailable"}</Fact>
        <Fact label="Current access source">{current ? sources[current.source] : "Unavailable"}</Fact>
        <Fact label="Effective access expiry">{current?.allowAccess && ["paid", "past_due_grace", "platform_owner"].includes(current.source)
          ? "No trial-derived access cutoff" : date(current?.effectiveAccessExpiresAt)}</Fact>
        <Fact label="Expiry source / applicable plan">{current?.effectiveExpirySource
          ? `${sources[current.effectiveExpirySource]} / ${plan(current.effectiveExpiryPlan)}` : "Not applicable"}</Fact>
      </dl>
      <p className="text-xs text-gray-400">{management && !unavailable
        ? "Effective access uses fresh read-only billing verification. Persisted billing fields remain separate."
        : "Effective access is evaluated from persisted health data, not fresh Stripe verification."} All dates are UTC.</p>
      {continuity && <p className="text-sm text-amber-300">Later continuity uses {plan(current.effectiveExpiryPlan)} via {sources[current.effectiveExpirySource!]}.
        This does not extend the current {plan(current.effectivePlan)} plan or its Stripe trial.</p>}
      {current?.trialTimingPendingReconciliation && <p className="text-sm text-amber-300">Stripe trial timing is pending reconciliation; the displayed expiry is not a confirmed Stripe termination time.</p>}
      {current?.restriction && <p className="text-sm text-amber-300">Billing restriction: {current.restriction.replace(/_/g, " ")}. Resolve billing through the existing billing portal or support; grants cannot bypass billing obligations.</p>}
      {current?.grant && <p className="text-sm text-gray-400">PaidSoon access only — Stripe billing unchanged. A retained grant does not override paid access or billing restrictions.</p>}
      {unavailable && <p role="status" className="text-sm text-amber-300">{management
        ? "Fresh Stripe verification unavailable. Owner management eligibility is unavailable; persisted access is not proof of eligibility."
        : "Owner management snapshot unavailable. Showing persisted health data only; eligibility and billing contact could not be verified."}</p>}
      {management && <p className="text-sm text-gray-400">{!management.contact.email
        ? "Missing email blocks optional notification only, not access changes. " : ""}
        {management.eligibility.available ? management.eligibility.allowedActions.extendOrGrant
          ? management.eligibility.source === "stripe_trial" ? "Eligible for Stripe trial extension; this changes first-billing timing."
            : "Eligible for application-only access; no Stripe charge is postponed."
          : "Grant / extension unavailable for the current billing or in-progress operation state." : ""}
        {management.eligibility.resolution && " Use the existing billing portal or support to resolve billing."}
        {management.eligibility.allowedActions.revokeGrant && " A retained grant can be revoked independently; other valid access remains unchanged."}
      </p>}
      {!owner && <p className="text-xs text-gray-400">Read-only tenant health. Trial management is restricted to the elevated platform owner.</p>}
    </section>
  )
}
