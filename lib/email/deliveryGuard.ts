/**
 * Outbound email delivery guard.
 *
 * Blocks delivery to reserved / undeliverable domains before any request is
 * made to Resend. This exists so development and demo seed data (which uses
 * `.test` addresses exclusively) can never cause a real outbound message, and
 * so a stray seeded row promoted to another environment stays inert.
 *
 * The blocked suffixes are the IANA/RFC 2606 + RFC 6761 reserved names, which
 * are guaranteed never to resolve to a real mailbox. Blocking them is therefore
 * safe in every environment, including production — it can only ever suppress
 * a message that was already undeliverable.
 */

/** RFC 2606 / RFC 6761 reserved TLDs — never routable to a real mailbox. */
const RESERVED_TLDS = [
  ".test",
  ".invalid",
  ".example",
  ".localhost",
] as const

/** RFC 2606 reserved second-level domains. */
const RESERVED_DOMAINS = [
  "example.com",
  "example.net",
  "example.org",
] as const

/**
 * True when the address is in a reserved namespace that can never receive mail.
 * Malformed addresses (no `@`, empty domain) are treated as undeliverable too.
 */
export function isUndeliverableAddress(address: string | null | undefined): boolean {
  if (!address) return true

  const atIndex = address.lastIndexOf("@")
  if (atIndex === -1) return true

  const domain = address.slice(atIndex + 1).trim().toLowerCase()
  if (!domain) return true

  if (domain === "localhost") return true
  if (RESERVED_DOMAINS.includes(domain as (typeof RESERVED_DOMAINS)[number])) return true

  return RESERVED_TLDS.some((tld) => domain.endsWith(tld))
}
