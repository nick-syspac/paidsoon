export interface NormalizedInvoice {
  externalId: string
  provider: string
  clientEmail: string
  clientName: string
  amountDue: number // in smallest currency unit (cents)
  currency: string
  dueDate: Date
  paymentUrl?: string
  invoiceNumber?: string
}

export type WebhookEventType = "invoice.overdue" | "invoice.paid" | "unknown"

export interface ParsedWebhookEvent {
  type: WebhookEventType
  invoice?: NormalizedInvoice
  externalId?: string
  connectedAccountId?: string
}

export interface InvoiceProvider {
  /**
   * Fetch all currently overdue invoices for a given connected account.
   */
  getOverdueInvoices(credentials: ProviderCredentials): Promise<NormalizedInvoice[]>

  /**
   * Fetch details of a single invoice by its external ID.
   */
  getInvoiceDetails(
    credentials: ProviderCredentials,
    externalId: string
  ): Promise<NormalizedInvoice | null>

  /**
   * Verify the webhook request signature. Returns true if valid.
   */
  verifyWebhookSignature(
    payload: string,
    headers: Record<string, string>,
    secret: string
  ): boolean

  /**
   * Parse a verified webhook payload into a normalized event.
   */
  parseWebhookEvent(payload: string): ParsedWebhookEvent
}

export interface ProviderCredentials {
  stripeConnectAccountId?: string
  // Future providers will add their own credential fields here
}
