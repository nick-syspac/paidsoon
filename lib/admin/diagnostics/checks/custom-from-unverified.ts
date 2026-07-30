import type { TenantSnapshot } from "@/lib/admin/tenantSnapshot"
import type { Diagnostic } from "@/lib/admin/diagnostics/types"

/**
 * Check: custom-from-unverified
 *
 * Flags when a tenant has set a custom From address but the domain is not
 * verified in Resend. Emails sent from unverified domains are likely to
 * bounce or land in spam.
 */
export function checkCustomFromUnverified(snapshot: TenantSnapshot): Diagnostic | null {
  const { emailSettings } = snapshot

  if (!emailSettings || !emailSettings.fromEmail) return null
  if (emailSettings.resendVerified) return null

  return {
    slug: "custom-from-unverified",
    severity: "error",
    title: "Custom From address — domain not verified",
    description: `The tenant has set a custom From address (${emailSettings.fromEmail}) but the domain has not been verified in Resend. Follow-up emails are being sent from the system domain or may fail.`,
    runbookSlug: "custom-from-unverified",
    actions: [
      {
        actionSlug: "reset-email-from",
        label: "Reset to system From",
        description: "Clear the custom From address so emails are sent from the system domain.",
      },
    ],
  }
}
