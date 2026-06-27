/**
 * MYOB Business accounting provider implementation.
 *
 * Uses the MYOB OAuth 2.0 API (AccountRight / Business shared endpoint).
 * Pull-based polling only — MYOB has no webhook support (confirmed OQ-3).
 *
 * Environment variables required:
 *   MYOB_CLIENT_ID     — MYOB developer app API key
 *   MYOB_CLIENT_SECRET — MYOB developer app API secret (server-side only)
 *   MYOB_REDIRECT_URI  — OAuth callback URL registered in MYOB developer portal
 *
 * OAuth scopes used (granular, from design decision D9):
 *   sme-sales sme-contacts-customer
 *
 * MYOB invoice types covered (all represent accounts-receivable sales):
 *   Sale/Invoice/Service, Sale/Invoice/Item, Sale/Invoice/Professional,
 *   Sale/Invoice/TimeBilling, Sale/Invoice/Miscellaneous
 *
 * Incremental sync uses OData filter:
 *   $filter=LastModified gt datetime'YYYY-MM-DDTHH:mm:ss'
 *
 * Pagination: default page size 400, max 1000 ($top/$skip params).
 */

import {
  AccountingProvider,
  AccountingProviderError,
  Organisation,
  ProviderContact,
  ProviderInvoice,
  ProviderInvoiceStatus,
  TokenSet,
} from "./types"

const MYOB_AUTH_URL = "https://secure.myob.com/oauth2/account/authorize"
const MYOB_TOKEN_URL = "https://secure.myob.com/oauth2/v1/authorize"

// MYOB OData page size (max 1000, MYOB default 400)
const PAGE_SIZE = 400

const MYOB_SCOPES = ["sme-sales", "sme-contacts-customer"].join(" ")

const MYOB_INVOICE_TYPES = [
  "Service",
  "Item",
  "Professional",
  "TimeBilling",
  "Miscellaneous",
] as const

function getConfig() {
  const clientId = process.env.MYOB_CLIENT_ID
  const clientSecret = process.env.MYOB_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error("MYOB_CLIENT_ID and MYOB_CLIENT_SECRET must be set")
  }
  return { clientId, clientSecret }
}

async function handleProviderResponse(res: Response): Promise<unknown> {
  if (res.ok) return res.json()

  const text = await res.text().catch(() => "")
  if (res.status === 401) {
    throw new AccountingProviderError("unauthorized", `MYOB 401: ${text}`)
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? 60)
    throw new AccountingProviderError("rate_limited", `MYOB 429 rate limited`, retryAfter)
  }
  if (res.status === 404) {
    throw new AccountingProviderError("not_found", `MYOB 404: ${text}`)
  }
  if (res.status >= 500) {
    throw new AccountingProviderError("server_error", `MYOB ${res.status}: ${text}`)
  }
  throw new AccountingProviderError("unknown", `MYOB ${res.status}: ${text}`)
}

function normaliseMYOBStatus(status: string): ProviderInvoiceStatus {
  switch (status) {
    case "Open":
    case "CreditNote": // partial credit applied but still has balance
      return "open"
    case "Closed":
      return "paid"
    default:
      return "unknown"
  }
}

/**
 * Extract MYOB date string to JS Date.
 * MYOB returns dates as ISO 8601 strings e.g. "2024-06-01T00:00:00"
 */
function parseMYOBDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return isNaN(d.getTime()) ? undefined : d
}

export class MyobProvider implements AccountingProvider {
  getAuthorizationUrl(params: { state: string; redirectUri: string }): string {
    const { clientId } = getConfig()
    const url = new URL(MYOB_AUTH_URL)
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("redirect_uri", params.redirectUri)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", MYOB_SCOPES)
    url.searchParams.set("state", params.state)
    return url.toString()
  }

  async exchangeCodeForTokens(params: {
    code: string
    redirectUri: string
  }): Promise<TokenSet> {
    const { clientId, clientSecret } = getConfig()

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      code: params.code,
      grant_type: "authorization_code",
    })

    const res = await fetch(MYOB_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })

    const data = (await handleProviderResponse(res)) as {
      access_token: string
      refresh_token: string
      expires_in: number
      scope?: string
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope,
    }
  }

  async refreshTokens(refreshToken: string): Promise<TokenSet> {
    const { clientId, clientSecret } = getConfig()

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })

    const res = await fetch(MYOB_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })

    const data = (await handleProviderResponse(res)) as {
      access_token: string
      refresh_token: string
      expires_in: number
      scope?: string
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope,
    }
  }

  async revokeToken(_refreshToken: string): Promise<void> {
    // MYOB does not provide a revocation endpoint. The token will naturally
    // expire (20 minutes for access, ~12 months for refresh). On disconnect we
    // simply delete the local connection record.
  }

  /**
   * In MYOB the "organisation" corresponds to a company file (cf_uri).
   * The cf_uri is returned as the `businessId` query param in the OAuth callback
   * and must be stored as AccountingConnection.organisationId.
   *
   * MYOB's token endpoint does not return a company file list directly. The
   * company file URI is provided during the OAuth callback by MYOB. This method
   * returns an empty array because the organisation selection is handled at the
   * callback level (see: app/api/integrations/myob/callback/route.ts).
   *
   * NOTE: For multi-file MYOB accounts, MYOB redirects the user to select a
   * company file as part of the OAuth flow. The selected file's URI is returned
   * in the `businessId` query parameter on the callback URL.
   */
  async getOrganisations(_accessToken: string): Promise<Organisation[]> {
    // MYOB company file selection happens during the OAuth redirect flow.
    // The selected file's URI is returned as the `businessId` query parameter
    // on the callback URL. There is no separate API call required to discover
    // company files at the getOrganisations step.
    return []
  }

  async getInvoices(params: {
    accessToken: string
    organisationId: string  // cf_uri (company file URI)
    modifiedAfter?: Date
  }): Promise<ProviderInvoice[]> {
    const allInvoices: ProviderInvoice[] = []
    const cfUri = params.organisationId

    for (const invoiceType of MYOB_INVOICE_TYPES) {
      const typeInvoices = await this._fetchInvoiceType({
        accessToken: params.accessToken,
        cfUri,
        invoiceType,
        modifiedAfter: params.modifiedAfter,
      })
      allInvoices.push(...typeInvoices)
    }

    return allInvoices
  }

  private async _fetchInvoiceType(params: {
    accessToken: string
    cfUri: string
    invoiceType: typeof MYOB_INVOICE_TYPES[number]
    modifiedAfter?: Date
  }): Promise<ProviderInvoice[]> {
    const results: ProviderInvoice[] = []
    let skip = 0

    while (true) {
      const baseUrl = `${params.cfUri}/Sale/Invoice/${params.invoiceType}`
      const url = new URL(baseUrl)
      url.searchParams.set("$top", String(PAGE_SIZE))
      url.searchParams.set("$skip", String(skip))

      if (params.modifiedAfter) {
        const iso = params.modifiedAfter.toISOString().replace("Z", "").split(".")[0]
        url.searchParams.set("$filter", `LastModified gt datetime'${iso}'`)
      }

      const { clientId } = getConfig()
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          // x-myobapi-cftoken: empty string is correct for MYOB Business online/cloud
          // company files — ownership is established via OAuth Bearer token.
          // Desktop/AccountRight Live files require Base64(username:password) but are
          // out of scope for PaidSoon (cloud-only target).
          "x-myobapi-cftoken": "",
          "x-myobapi-key": clientId,
          "x-myobapi-version": "v2",
          Accept: "application/json",
        },
      })

      const data = (await handleProviderResponse(res)) as {
        Items?: Array<{
          UID: string
          Number?: string
          Status?: string
          BalanceDue?: number
          TotalAmount?: number
          TotalTax?: number
          Customer?: { UID?: string; DisplayID?: string; Name?: string; Addresses?: Array<{ Email?: string }> }
          Terms?: { DueDate?: string }
          Date?: string
          LastModified?: string
          CurrencyCode?: string
        }>
      }

      const items = data.Items ?? []
      for (const inv of items) {
        results.push({
          providerInvoiceId: inv.UID,
          invoiceNumber: inv.Number,
          providerContactId: inv.Customer?.UID ?? "",
          clientName: inv.Customer?.Name ?? "",
          clientEmail: inv.Customer?.Addresses?.[0]?.Email ?? "",
          amountDue: inv.BalanceDue ?? 0,
          currency: inv.CurrencyCode ?? "AUD",
          dueDate: parseMYOBDate(inv.Terms?.DueDate) ?? new Date(),
          status: normaliseMYOBStatus(inv.Status ?? ""),
          providerUpdatedAt: parseMYOBDate(inv.LastModified),
          rawMetadata: inv as unknown as Record<string, unknown>,
        })
      }

      if (items.length < PAGE_SIZE) break
      skip += PAGE_SIZE
    }

    return results
  }

  async getContacts(params: {
    accessToken: string
    organisationId: string  // cf_uri
    contactIds: string[]
  }): Promise<ProviderContact[]> {
    if (params.contactIds.length === 0) return []

    // MYOB supports $filter with UID in list via OR — batch by 50 to stay under URL limits
    const BATCH = 50
    const results: ProviderContact[] = []

    for (let i = 0; i < params.contactIds.length; i += BATCH) {
      const batch = params.contactIds.slice(i, i + BATCH)
      const filterExpr = batch.map((id) => `UID eq guid'${id}'`).join(" or ")

      const url = new URL(`${params.organisationId}/Contact/Customer`)
      url.searchParams.set("$filter", filterExpr)

      const { clientId } = getConfig()
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "x-myobapi-key": clientId,
          "x-myobapi-version": "v2",
          Accept: "application/json",
        },
      })

      const data = (await handleProviderResponse(res)) as {
        Items?: Array<{
          UID: string
          DisplayName?: string
          CompanyName?: string
          Addresses?: Array<{ Email?: string }>
        }>
      }

      for (const c of data.Items ?? []) {
        results.push({
          providerContactId: c.UID,
          name: c.CompanyName ?? c.DisplayName ?? "",
          email: c.Addresses?.[0]?.Email,
          rawMetadata: c as unknown as Record<string, unknown>,
        })
      }
    }

    return results
  }
}
