import type { AccountingProvider } from "./types"
import { XeroProvider } from "./xero"
import { MyobProvider } from "./myob"

const providers: Record<string, AccountingProvider> = {
  xero: new XeroProvider(),
  myob: new MyobProvider(),
}

/**
 * Returns the AccountingProvider implementation for the given provider name.
 * Throws if the provider name is not recognised.
 */
export function getAccountingProvider(providerName: string): AccountingProvider {
  const provider = providers[providerName]
  if (!provider) {
    throw new Error(`Unknown accounting provider: ${providerName}`)
  }
  return provider
}

export type {
  AccountingProvider,
  TokenSet,
  Organisation,
  ProviderInvoice,
  ProviderContact,
  ProviderSpendBill,
  ProviderSpendBillStatus,
  ProviderSpendBankTransaction,
  ProviderSpendSupplier,
  ProviderSpendExpenseAccount,
  ProviderInvoiceStatus,
  AccountingProviderError,
  AccountingProviderErrorKind,
} from "./types"
