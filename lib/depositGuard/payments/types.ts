export type DepositPaymentProviderName = "manual_external_link" | "stripe_connect"

export type DepositPaymentProviderAvailability = "available" | "unavailable"

export interface DepositPaymentCreateInput {
  userId: string
  jobId: string
  requestId: string
  amountCents: number
  currency: string
  description?: string
  customerName?: string
  customerEmail?: string
  externalPaymentUrl?: string | null
}

export interface DepositPaymentCreateResult {
  provider: DepositPaymentProviderName
  availability: DepositPaymentProviderAvailability
  externalPaymentReference?: string | null
  externalPaymentUrl?: string | null
  reasonCode?: "setup_required" | "provider_unavailable" | "unsupported"
  reasonMessage?: string
}

export interface DepositPaymentWebhookResult {
  acknowledged: boolean
  providerEventId?: string
  eventType?: string
  userId?: string
  jobId?: string
  depositRequestId?: string
  externalPaymentReference?: string
  reasonCode?: "invalid_signature" | "unsupported" | "invalid_payload"
  reasonMessage?: string
}

export interface DepositPaymentProvider {
  readonly name: DepositPaymentProviderName
  createPaymentRequest(input: DepositPaymentCreateInput): Promise<DepositPaymentCreateResult>
  processWebhook(rawBody: string, signature: string | null): Promise<DepositPaymentWebhookResult>
}
