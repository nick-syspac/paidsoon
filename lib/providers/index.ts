import type { InvoiceProvider } from "./types"
import { StripeInvoiceProvider } from "./stripe"

const providers: Record<string, InvoiceProvider> = {
  stripe: new StripeInvoiceProvider(),
}

export function getProvider(providerName: string): InvoiceProvider {
  const provider = providers[providerName]
  if (!provider) {
    throw new Error(`Unknown invoice provider: ${providerName}`)
  }
  return provider
}

export type { InvoiceProvider, NormalizedInvoice, ParsedWebhookEvent, ProviderCredentials } from "./types"
