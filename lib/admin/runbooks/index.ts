/**
 * Admin runbook registry.
 *
 * Runbooks are static operator documentation linked from diagnostic issue cards.
 * They live in code (not a CMS) so they are version-controlled alongside the
 * diagnostic checks they document.
 */

export interface Runbook {
  slug: string
  title: string
  /** The diagnostic slug this runbook covers */
  diagnosticSlug: string
  severity: "error" | "warning" | "info"
  /** Plain-text prose (no markdown rendering required) */
  body: string
}

export const RUNBOOKS: Runbook[] = [
  {
    slug: "custom-from-unverified",
    title: "Custom From address — domain not verified",
    diagnosticSlug: "custom-from-unverified",
    severity: "error",
    body: `WHAT IS THIS ISSUE

The tenant has configured a custom "From" email address for their follow-up emails, but the domain has not been verified in Resend. Emails sent from an unverified domain are likely to fail delivery, bounce, or land in the recipient's spam folder.

WHY IT HAPPENS

When a tenant enters a custom From address (e.g. "invoices@mybusiness.com"), they must also add a DNS TXT record to verify their domain with Resend. If they skip this step, or the record has not yet propagated, Resend marks the domain as unverified and PaidSoon cannot use it as a From address.

The tenant may also have changed their custom From address to a new domain after previously verifying a different one. In that case resendVerified reverts to false until the new domain is verified.

HOW TO DIAGNOSE FURTHER

1. Ask the tenant what email address they entered in Settings → Email.
2. Check Resend's domain verification status at https://resend.com/domains.
3. If the domain entry is missing, the tenant needs to add it and follow Resend's verification steps.
4. If the domain entry exists but is unverified, the tenant needs to add the DNS TXT record shown in Resend.

RECOMMENDED RESOLUTION

Option A — Tenant verifies their domain:
  Ask the tenant to complete Resend domain verification. Once verified, they may need to re-save their email settings or contact support to trigger the resendVerified flag to be set.

Option B — Reset to system From address:
  If the tenant cannot verify their domain, use the "Reset to system From" action on this page. This clears the custom From address so PaidSoon will send emails from the system domain. The tenant can re-enter a different From address later.`,
  },
  {
    slug: "trial-lapsed",
    title: "Trial period has lapsed",
    diagnosticSlug: "trial-lapsed",
    severity: "error",
    body: `WHAT IS THIS ISSUE

The tenant's free trial has expired but their subscriptionStatus is still "trialing". This means they are not actively subscribed and may be blocked from sending follow-up emails depending on plan gates.

WHY IT HAPPENS

Trials expire when trialEndsAt passes and the tenant has not entered payment details to upgrade. If Stripe's trial_will_end webhook was not received, or the tenant's subscription was never created in Stripe, the status may not have transitioned automatically.

This can also occur if the trial was manually extended previously and the tenant still did not upgrade.

HOW TO DIAGNOSE FURTHER

1. Check the tenant's Stripe customer record (link in Subscription section above) to see if they have a subscription or payment method on file.
2. If the Stripe customer has no subscription, the trial truly lapsed without payment.
3. If Stripe shows an active subscription but the DB status is still "trialing", there may be a webhook delivery failure — check the Stripe webhook logs and the billing webhook endpoint.

RECOMMENDED RESOLUTION

Option A — Extend trial (short-term support):
  Use the "Extend trial 7 days" action on this page to give the tenant more time. This is appropriate for one-time support exceptions. Note: this only updates the DB date — it does not create a Stripe subscription extension. Document this in the audit log.

Option B — Ask the tenant to upgrade:
  Contact the tenant and ask them to enter payment details to activate their subscription. Direct them to Settings → Billing.

Option C — Manual Stripe intervention:
  If the tenant has been charged but the subscription webhook failed, manually re-trigger the webhook or update the subscription status via the Stripe dashboard.`,
  },
  {
    slug: "stripe-connect-disconnected",
    title: "Stripe Connect not connected",
    diagnosticSlug: "stripe-connect-disconnected",
    severity: "warning",
    body: `WHAT IS THIS ISSUE

The tenant has not completed the Stripe Connect OAuth flow, so PaidSoon cannot read their Stripe invoices. Without this, no invoices will be tracked and no follow-up emails will be sent.

WHY IT HAPPENS

The most common causes:
1. The tenant created an account but did not complete the onboarding step where they connect their Stripe account.
2. The tenant previously connected their Stripe account but then disconnected it (either deliberately or by revoking access in Stripe).
3. The OAuth callback failed silently and the connection was never saved.

HOW TO DIAGNOSE FURTHER

1. Check the tenant's onboardingCompletedAt field in the Identity section. If it is null, they may still be in onboarding.
2. Check whether there is an InvoiceConnection row in the DB for this user (use the admin DB query tool or psql).
3. If a connection row exists but stripeConnectAccountId is null, the OAuth flow started but did not complete.

RECOMMENDED RESOLUTION

Ask the tenant to complete the Stripe Connect step:
1. Log in to PaidSoon.
2. Go to Settings → Connections.
3. Click "Connect Stripe" and follow the OAuth flow.

If the tenant reports they already connected Stripe and it stopped working, check the Stripe Connect dashboard (platform account) to see if the connected account still has the required permissions.`,
  },
  {
    slug: "sync-stale",
    title: "Accounting connection out of sync",
    diagnosticSlug: "sync-stale",
    severity: "warning",
    body: `WHAT IS THIS ISSUE

An accounting connection (Xero or MYOB) is either in an error state or has not synced recently. This means invoice data from the accounting provider may be out of date, and new overdue invoices may not appear for follow-up.

WHY IT HAPPENS

Common causes:
1. The OAuth token for the connection has expired and the automatic refresh failed. Xero tokens expire after 30 days of non-use; MYOB tokens expire after 20 minutes but refresh automatically.
2. The accounting provider's API returned an error (rate limit, maintenance window, or API breaking change).
3. The connection was marked "disconnected" because the user revoked access in their Xero/MYOB dashboard.
4. The connection status is "active" but the cron job has not run recently (check cron logs).

HOW TO DIAGNOSE FURTHER

1. Check the connection status shown in the Connections section above.
2. If status is "error", look at the most recent AccountingSyncRun error_message in the DB.
3. If status is "disconnected", the user must reconnect from Settings → Integrations.
4. If status is "active" but stale, check if the cron job has been running — check Vercel deployment logs and the email-jobs admin page.

RECOMMENDED RESOLUTION

Option A — Trigger a manual resync (status = active or error):
  Use the "Trigger resync" button on this page to initiate an immediate sync. This is appropriate if the stale state appears transient (e.g. cron was delayed, a brief API outage).

Option B — Ask tenant to reconnect (status = disconnected or revoked):
  The tenant must go to Settings → Integrations and reconnect their Xero or MYOB account via OAuth. Resync will occur automatically after reconnection.

Option C — Investigate API errors:
  If the sync repeatedly fails with the same error, escalate to the engineering team with the AccountingSyncRun error_message.`,
  },
  {
    slug: "no-invoices-tracked",
    title: "No invoices tracked",
    diagnosticSlug: "no-invoices-tracked",
    severity: "info",
    body: `WHAT IS THIS ISSUE

The tenant's account is more than 7 days old but they have zero tracked invoices. This is informational — it does not block any functionality — but may indicate the tenant is not getting value from PaidSoon.

WHY IT HAPPENS

1. The tenant has not connected their Stripe account (see stripe-connect-disconnected).
2. The tenant connected Stripe but has no overdue invoices in Stripe, so nothing was imported.
3. The tenant connected an accounting provider (Xero/MYOB) but the first sync has not run yet or failed.
4. The tenant has paid invoices only — PaidSoon only tracks overdue invoices.

HOW TO DIAGNOSE FURTHER

1. Check the Connections section — is Stripe Connect or an accounting provider connected?
2. If connected, check the invoice summary. If all counts are zero, no invoices have been imported at all.
3. Check whether there are any AccountingSyncRun records for this user in the DB to confirm sync has been attempted.
4. If Stripe is connected, ask the tenant whether they have any overdue invoices in their Stripe dashboard.

RECOMMENDED RESOLUTION

This is an informational issue — no corrective action is available from this panel.

1. If the tenant has no connections, prompt them to complete onboarding.
2. If connected but no invoices, verify their Stripe/accounting data has overdue invoices. PaidSoon only tracks invoices with a past due date.
3. If everything looks correct and they have recent overdue invoices, trigger a manual resync if an accounting connection is present.`,
  },
]

/**
 * Find a runbook by slug. Returns null for unknown slugs.
 */
export function getRunbook(slug: string): Runbook | null {
  return RUNBOOKS.find((r) => r.slug === slug) ?? null
}
