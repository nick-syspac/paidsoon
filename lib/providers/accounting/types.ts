/**
 * AccountingProvider abstraction types.
 *
 * This interface defines the contract for pull-based accounting integrations
 * (Xero, MYOB). It is separate from the existing InvoiceProvider interface,
 * which is event/webhook-driven (Stripe Connect).
 *
 * All methods that communicate with provider APIs should throw a typed
 * AccountingProviderError so callers can inspect the error kind.
 */

// ---------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------

export interface TokenSet {
  accessToken: string
  refreshToken: string
  expiresIn: number   // seconds until access token expiry
  scope?: string
}

/**
 * An organisation/company file the user has access to in the provider.
 * Maps to a Xero tenant (ORGANISATION type) or a MYOB company file.
 */
export interface Organisation {
  id: string           // tenantId (Xero) or businessId/cf_uri (MYOB)
  name: string
  countryCode?: string // ISO 3166-1 alpha-2 where available
}

/** PaidSoon's normalised invoice type as imported from an accounting provider. */
export interface ProviderInvoice {
  /** Unique identifier within the provider (e.g. Xero InvoiceID, MYOB UID). */
  providerInvoiceId: string
  /** Provider's invoice number / reference shown to the customer. */
  invoiceNumber?: string
  /** Provider contact/customer ID (used for ProviderContactMapping). */
  providerContactId: string
  /** Customer display name. */
  clientName: string
  /** Customer primary email address. May be empty string if not set. */
  clientEmail: string
  /**
   * Total amount still owed (balance due), in the invoice's currency.
   * This is a decimal value — the caller must convert to cents (× 100, round)
   * before storing in TrackedInvoice.amountDue.
   */
  amountDue: number
  /** ISO 4217 currency code. */
  currency: string
  /** Invoice due date. */
  dueDate: Date
  /**
   * Normalised invoice status mapped from provider-specific status values.
   * Callers use this to determine reminder eligibility.
   */
  status: ProviderInvoiceStatus
  /**
   * ISO 8601 timestamp of the last time this invoice was modified in the
   * provider. Used for incremental sync.
   */
  providerUpdatedAt?: Date
  /**
   * Raw provider-specific fields kept for debugging and future features.
   * Must not be logged. Stored in ProviderInvoiceMapping.providerMetadata.
   */
  rawMetadata?: Record<string, unknown>
}

export type ProviderInvoiceStatus =
  | "open"       // unpaid / authorised / partially paid (reminders active)
  | "paid"       // fully paid (cancel reminders)
  | "voided"     // voided or deleted (cancel reminders)
  | "draft"      // draft — do not chase
  | "unknown"    // unrecognised status — treat as open, log a warning

export interface ProviderContact {
  providerContactId: string
  name: string
  email?: string
  rawMetadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type AccountingProviderErrorKind =
  | "unauthorized"     // 401 — token likely revoked or expired
  | "rate_limited"     // 429 — back off and retry
  | "not_found"        // 404
  | "server_error"     // 5xx from provider
  | "validation"       // invalid response shape
  | "unknown"

export class AccountingProviderError extends Error {
  constructor(
    public readonly kind: AccountingProviderErrorKind,
    message: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message)
    this.name = "AccountingProviderError"
  }
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface AccountingProvider {
  /** Build the OAuth 2.0 authorisation redirect URL for the provider. */
  getAuthorizationUrl(params: { state: string; redirectUri: string }): string

  /**
   * Exchange an authorisation code for an access + refresh token set.
   * Throws AccountingProviderError on failure.
   */
  exchangeCodeForTokens(params: {
    code: string
    redirectUri: string
  }): Promise<TokenSet>

  /**
   * Use the refresh token to obtain a new access token.
   * Returns a new TokenSet (including a potentially new refresh token).
   * Throws AccountingProviderError({ kind: 'unauthorized' }) if consent is revoked.
   */
  refreshTokens(refreshToken: string): Promise<TokenSet>

  /**
   * Revoke the user's refresh token at the provider (best-effort on disconnect).
   * Should not throw — log failures and continue.
   */
  revokeToken(refreshToken: string): Promise<void>

  /**
   * Fetch the list of organisations/company files the current access token
   * has been granted access to.
   */
  getOrganisations(accessToken: string): Promise<Organisation[]>

  /**
   * Fetch invoices for a given organisation, optionally filtered to those
   * modified after a given date (incremental sync).
   *
   * Implementations must paginate internally and return all results.
   * Only ACCREC (accounts receivable / sales) invoices are returned.
   */
  getInvoices(params: {
    accessToken: string
    organisationId: string
    modifiedAfter?: Date
  }): Promise<ProviderInvoice[]>

  /**
   * Fetch customer/contact details for a list of provider contact IDs.
   * Used to enrich ProviderContactMapping after invoice sync.
   */
  getContacts(params: {
    accessToken: string
    organisationId: string
    contactIds: string[]
  }): Promise<ProviderContact[]>
}
