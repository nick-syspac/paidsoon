import { ManualExternalLinkProvider } from "@/lib/depositGuard/payments/manualExternalLinkProvider"
import { StripeConnectDepositPaymentProvider } from "@/lib/depositGuard/payments/stripeConnectProvider"
import type {
  DepositPaymentProvider,
  DepositPaymentProviderName,
} from "@/lib/depositGuard/payments/types"

const providers: Record<DepositPaymentProviderName, DepositPaymentProvider> = {
  manual_external_link: new ManualExternalLinkProvider(),
  stripe_connect: new StripeConnectDepositPaymentProvider(),
}

export function getDepositPaymentProvider(
  providerName: DepositPaymentProviderName,
): DepositPaymentProvider {
  const provider = providers[providerName]
  if (!provider) {
    throw new Error(`Unknown deposit payment provider: ${providerName}`)
  }

  return provider
}

export type {
  DepositPaymentCreateInput,
  DepositPaymentCreateResult,
  DepositPaymentProvider,
  DepositPaymentProviderAvailability,
  DepositPaymentProviderName,
  DepositPaymentWebhookResult,
} from "@/lib/depositGuard/payments/types"
