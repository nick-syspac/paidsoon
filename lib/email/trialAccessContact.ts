import "server-only"
import { z } from "zod"

export interface TrialAccessContact {
  email: string | null
  name: string | null
  source: "stripe_billing" | "owner_fallback" | null
  nameMissing: boolean
}

/** Only subscription-customer identity/contact fields, never Connect/debtor data. */
export interface TrialContactCustomer {
  id: string
  deleted?: boolean
  email?: string | null
  name?: string | null
  metadata?: Record<string, string> | null
}
export interface TrialContactOwner {
  id: string
  email?: string | null
  deleted_at?: string | null
}

export function trialContactEmail(value: unknown): string | null {
  // Reject control characters before trimming (including header injection).
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/u.test(value)) return null
  const parsed = z.email().max(254).safeParse(value.trim())
  return parsed.success ? parsed.data : null
}

function name(value: unknown): string | null {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/u.test(value)) return null
  return value.trim() || null
}

export function emptyTrialContact(): TrialAccessContact {
  return { email: null, name: null, source: null, nameMissing: true }
}

/** Read-only contact evidence, NOT eligibility or authorization. Call with a
 * server-scoped profile; provider failures fall back per D8, never imply that
 * billing is debt-free. No contact is cached between fresh resolutions. */
export async function resolveTrialAccessContact(
  profile: { userId: string; stripeCustomerId: string | null },
  readers: {
    customer(id: string): Promise<TrialContactCustomer | null>
    owner(id: string): Promise<TrialContactOwner | null>
  },
): Promise<TrialAccessContact> {
  if (profile.stripeCustomerId) {
    try {
      const customer = await readers.customer(profile.stripeCustomerId)
      const consistent = customer && customer.id === profile.stripeCustomerId && !customer.deleted &&
        ["userId", "user_id"].every((key) => {
          const hint = customer.metadata?.[key]
          return hint == null || hint === "" || hint === profile.userId
        })
      const email = consistent ? trialContactEmail(customer.email) : null
      if (email) {
        const recipientName = name(customer!.name)
        return { email, name: recipientName, source: "stripe_billing", nameMissing: recipientName === null }
      }
    } catch {
      // Deleted/missing/unreadable billing contact: notification-only fallback.
      // Never log provider errors, which may contain email or other PII.
    }
  }
  try {
    const owner = await readers.owner(profile.userId)
    const email = owner?.id === profile.userId && !owner.deleted_at ? trialContactEmail(owner.email) : null
    if (email) return { email, name: null, source: "owner_fallback", nameMissing: true }
  } catch {
    // Missing auth user or unavailable provider is non-fatal to access changes.
  }
  return emptyTrialContact()
}