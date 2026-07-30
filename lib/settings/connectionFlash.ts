type LooseSearchParams = {
  success?: string
  error?: string
  source?: string
  code?: string
}

export interface ConnectionsFlashState {
  stripeSuccessMessage: string | null
  stripeErrorCode: string | null
  accountingSuccessCode: string | null
  accountingErrorCode: string | null
}

const ACCOUNTING_ERROR_CODES = new Set([
  "upgrade_required",
  "no_organisations",
  "invalid_state",
  "token_exchange_failed",
  "org_fetch_failed",
  "connection_save_failed",
  "selection_expired",
  "invalid_selection",
])

function isAccountingLegacyCode(value: string): boolean {
  return (
    value.startsWith("xero_") ||
    value.startsWith("myob_") ||
    ACCOUNTING_ERROR_CODES.has(value)
  )
}

function encodeQueryParam(value: string): string {
  return encodeURIComponent(value)
}

export function buildConnectionsSearch(params: LooseSearchParams): string {
  const entries: string[] = []
  if (params.source) entries.push(`source=${encodeQueryParam(params.source)}`)
  if (params.code) entries.push(`code=${encodeQueryParam(params.code)}`)
  if (params.success) entries.push(`success=${encodeQueryParam(params.success)}`)
  if (params.error) entries.push(`error=${encodeQueryParam(params.error)}`)
  return entries.join("&")
}

export function parseConnectionsFlash(params: LooseSearchParams): ConnectionsFlashState {
  let stripeSuccessMessage: string | null = null
  let stripeErrorCode: string | null = null
  let accountingSuccessCode: string | null = null
  let accountingErrorCode: string | null = null

  if (params.source && params.code) {
    const source = params.source
    const code = params.code

    if (source === "stripe") {
      if (code === "connected") {
        stripeSuccessMessage = "Stripe account connected successfully!"
      } else {
        stripeErrorCode = code === "cancelled" ? "connect_cancelled" : code
      }
    }

    if (source === "xero" || source === "myob") {
      if (code === "connected") {
        accountingSuccessCode = source === "xero" ? "xero_connected" : "myob_connected"
      } else if (code === "cancelled") {
        accountingErrorCode = source === "xero" ? "xero_cancelled" : "myob_cancelled"
      } else {
        accountingErrorCode = code
      }
    }

    return {
      stripeSuccessMessage,
      stripeErrorCode,
      accountingSuccessCode,
      accountingErrorCode,
    }
  }

  // Backward compatibility for legacy success/error query parameters.
  if (params.success) {
    if (params.success === "connected") {
      stripeSuccessMessage = "Stripe account connected successfully!"
    } else if (params.success === "xero_connected" || params.success === "myob_connected") {
      accountingSuccessCode = params.success
    }
  }

  if (params.error) {
    if (isAccountingLegacyCode(params.error)) {
      accountingErrorCode = params.error
    } else {
      stripeErrorCode = params.error
    }
  }

  return {
    stripeSuccessMessage,
    stripeErrorCode,
    accountingSuccessCode,
    accountingErrorCode,
  }
}
