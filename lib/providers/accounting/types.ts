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

/**
 * PaidSoon's normalised invoice type as imported from an accounting provider.
 *
 * Canonical ingestion contract (openspec/changes/canonical-financial-data-model):
 * adapters return these normalized shapes; the sync orchestrator maps them onto
 * the canonical financial tables via `lib/financial/ingest.ts` using
 * `providerInvoiceId`/`providerContactId` as the provenance `sourceId`. Adapters
 * never write chasing state or feature-specific rows — provider variability stops
 * at this boundary.
 */
export interface ProviderInvoice {
  /** Unique identifier within the provider (e.g. Xero InvoiceID, MYOB UID). Becomes the canonical `sourceId`. */
  providerInvoiceId: string
  /** Provider's invoice number / reference shown to the customer. */
  invoiceNumber?: string
  /** Provider contact/customer ID — becomes the canonical contact's `sourceId`. */
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
// Spend-side normalized value types
// ---------------------------------------------------------------------------

export type ProviderSpendBillStatus = "open" | "paid" | "voided" | "draft" | "unknown"

export interface ProviderSpendBill {
  providerBillId: string
  providerSupplierId?: string
  supplierName: string
  supplierReference?: string
  documentNumber?: string
  expenseAccountCode?: string
  expenseAccountName?: string
  amountTotal: number
  gstAmount?: number
  currency: string
  dueDate?: Date
  paidDate?: Date
  status: ProviderSpendBillStatus
  providerUpdatedAt?: Date
  rawMetadata?: Record<string, unknown>
}

export interface ProviderSpendBankTransaction {
  providerTransactionId: string
  providerSupplierId?: string
  accountName?: string
  accountCode?: string
  description: string
  reference?: string
  counterpartyName?: string
  amount: number
  currency: string
  transactionDate: Date
  providerUpdatedAt?: Date
  rawMetadata?: Record<string, unknown>
}

export interface ProviderSpendSupplier {
  providerSupplierId: string
  supplierName: string
  supplierEmail?: string
  abn?: string
  paymentTerms?: string
  defaultAccountCode?: string
  defaultAccountName?: string
  providerUpdatedAt?: Date
  rawMetadata?: Record<string, unknown>
}

export interface ProviderSpendExpenseAccount {
  providerAccountId: string
  accountCode?: string
  accountName: string
  classification?: string
  providerUpdatedAt?: Date
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
   * Used to enrich the canonical FinancialContact after invoice sync.
   */
  getContacts(params: {
    accessToken: string
    organisationId: string
    contactIds: string[]
  }): Promise<ProviderContact[]>

  /**
   * Fetch spend-side bills/accounts-payable data for SpendLeak analysis.
   * Implementations must paginate internally and return normalized records.
   */
  getSpendBills(params: {
    accessToken: string
    organisationId: string
    modifiedAfter?: Date
  }): Promise<ProviderSpendBill[]>

  /**
   * Fetch spend-side bank transaction rows needed for initial SpendLeak analysis.
   * Implementations must paginate internally and return normalized records.
   */
  getSpendBankTransactions(params: {
    accessToken: string
    organisationId: string
    modifiedAfter?: Date
  }): Promise<ProviderSpendBankTransaction[]>

  /**
   * Fetch supplier/contact records used to enrich spend-side bill and findings data.
   */
  getSpendSuppliers(params: {
    accessToken: string
    organisationId: string
    supplierIds?: string[]
  }): Promise<ProviderSpendSupplier[]>

  /**
   * Fetch expense account metadata to support initial category/account analysis.
   */
  getSpendExpenseAccounts(params: {
    accessToken: string
    organisationId: string
  }): Promise<ProviderSpendExpenseAccount[]>
}
