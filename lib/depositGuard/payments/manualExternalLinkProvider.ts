import type {
  DepositPaymentCreateInput,
  DepositPaymentCreateResult,
  DepositPaymentProvider,
  DepositPaymentWebhookResult,
} from "@/lib/depositGuard/payments/types"

export class ManualExternalLinkProvider implements DepositPaymentProvider {
  readonly name = "manual_external_link" as const

  async createPaymentRequest(
    input: DepositPaymentCreateInput,
  ): Promise<DepositPaymentCreateResult> {
    const externalPaymentUrl = input.externalPaymentUrl?.trim() ?? ""

    if (!externalPaymentUrl) {
      return {
        provider: this.name,
        availability: "unavailable",
        reasonCode: "setup_required",
        reasonMessage: "No external payment URL has been configured for this request.",
      }
    }

    return {
      provider: this.name,
      availability: "available",
      externalPaymentReference: `manual-link:${input.requestId}`,
      externalPaymentUrl,
    }
  }

  async processWebhook(
    _rawBody: string,
    _signature: string | null,
  ): Promise<DepositPaymentWebhookResult> {
    return {
      acknowledged: false,
      reasonCode: "unsupported",
      reasonMessage: "Manual external link provider does not process webhooks.",
    }
  }
}
