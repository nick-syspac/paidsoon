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
 *   sme-sales sme-contacts-customer sme-company-file
 *
 * sme-company-file is required for the company-file list endpoint
 * (GET https://api.myob.com/accountright/, used by getOrganisations) — this is
 * a granular scope introduced by MYOB's March 2025 scope changes and is
 * distinct from the deprecated broad `CompanyFile` scope. Omitting it causes
 * every call to the company-file list endpoint to fail with a persistent
 * 401 OAuthTokenIsInvalid, even with a valid, Admin-authorised token.
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
// The shared host for MYOB's online/cloud (Business/Essentials) API. Exported
// so the OAuth callback can construct a directly-callable company-file URI
// (cf_uri) by appending the `businessId` the callback already receives —
// `MYOB_COMPANY_FILE_LIST_URL + businessId` — instead of calling
// getOrganisations() (below), which MYOB's docs mark "Not available online"
// for cloud company files and cannot be used to discover them.
export const MYOB_COMPANY_FILE_LIST_URL = "https://api.myob.com/accountright/"

// MYOB OData page size (max 1000, MYOB default 400)
const PAGE_SIZE = 400

const MYOB_SCOPES = ["sme-sales", "sme-contacts-customer", "sme-company-file"].join(" ")

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

/**
 * MYOB error responses are a JSON envelope of the shape:
 *   { Errors: [{ Message, Name?, ErrorCode? }, ...], Information: "..." }
 * Extract a short, log-friendly summary instead of dumping the raw body —
 * console/log viewers otherwise collapse the nested `Errors` array to `[…]`,
 * hiding the actual MYOB error code/message that's needed for diagnosis
 * (e.g. distinguishing a transient `OAuthTokenIsInvalid` 401 from an
 * actually-revoked token or a client-key mismatch).
 */
function summariseMYOBErrorBody(text: string): string {
  if (!text) return "(empty body)"
  try {
    const parsed = JSON.parse(text) as { Errors?: Array<{ Message?: string; Name?: string; ErrorCode?: string | number }> }
    if (Array.isArray(parsed.Errors) && parsed.Errors.length > 0) {
      return parsed.Errors
        .map((e) => [e.ErrorCode, e.Name, e.Message].filter(Boolean).join(" "))
        .join("; ")
    }
  } catch {
    // Not JSON — fall through to raw text below.
  }
  return text
}

async function handleProviderResponse(res: Response): Promise<unknown> {
  if (res.ok) return res.json()

  const text = await res.text().catch(() => "")
  const summary = summariseMYOBErrorBody(text)
  if (res.status === 401) {
    throw new AccountingProviderError("unauthorized", `MYOB 401: ${summary}`)
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? 60)
    throw new AccountingProviderError("rate_limited", `MYOB 429 rate limited`, retryAfter)
  }
  if (res.status === 404) {
    throw new AccountingProviderError("not_found", `MYOB 404: ${summary}`)
  }
  if (res.status >= 500) {
    throw new AccountingProviderError("server_error", `MYOB ${res.status}: ${summary}`)
  }
  throw new AccountingProviderError("unknown", `MYOB ${res.status}: ${summary}`)
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
    // MYOB's docs describe two authorize URL variants: a "silent" one (no
    // prompt param) that reuses an existing session/grant without
    // re-presenting the consent screen, and one with `prompt=consent` that
    // always forces MYOB's full login+consent+company-file screen. Diagnostic
    // testing (openspec/changes/harden-myob-business-go-live, task 4.1)
    // observed a real callback returning only `code`/`scope`/`state` — no
    // `businessId` — which matches the silent-reuse path skipping the
    // consent step entirely rather than the granular-scope docs' documented
    // `?code=&businessId=` callback shape. Forcing `prompt=consent` ensures
    // the company-file consent screen (and therefore `businessId`) is always
    // presented, even for a MYOB login that has authorised this app before.
    url.searchParams.set("prompt", "consent")
    return url.toString()
  }

  async exchangeCodeForTokens(params: {
    code: string
    redirectUri: string
  }): Promise<TokenSet> {
    const { clientId, clientSecret } = getConfig()

    // MYOB's token-exchange docs list `scope` as a required POST parameter
    // alongside client_id/client_secret/code/redirect_uri/grant_type. Omitting
    // it (as this call previously did) doesn't fail the exchange itself — MYOB
    // still returns a 200 with an access_token — but for granular-scope apps
    // the resulting token isn't properly bound to the sme-* scopes the user
    // consented to, and every subsequent API call is rejected with a 401
    // "OAuthTokenIsInvalid" regardless of how long you wait for propagation.
    // Must match the scope requested in getAuthorizationUrl().
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      code: params.code,
      scope: MYOB_SCOPES,
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
   *
   * NOT called from the MYOB connect path. MYOB Business (online/cloud) OAuth
   * returns `businessId` (and `businessName`) directly on the callback query
   * string — one company file per grant, nothing to discover — so
   * `app/api/integrations/myob/callback/route.ts` builds the cf_uri directly
   * from `businessId` (see `MYOB_COMPANY_FILE_LIST_URL` above) instead of
   * calling this method. This endpoint (`GET https://api.myob.com/accountright/`)
   * is also documented "Not available online" for cloud company files, which
   * is why calling it from the connect path used to fail. It's retained here
   * only to satisfy the shared `AccountingProvider` interface (Xero's
   * genuinely multi-tenant implementation still needs and calls it).
   */
  async getOrganisations(accessToken: string): Promise<Organisation[]> {
    const { clientId } = getConfig()
    const res = await fetch(MYOB_COMPANY_FILE_LIST_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // x-myobapi-cftoken: required on every online/OAuth API call per MYOB's
        // header docs, even calls (like this one) that aren't scoped to a
        // specific company file yet. Empty string is correct for MYOB Business
        // online/cloud company files — ownership is established via the OAuth
        // Bearer token, not company-file credentials. Omitting this header
        // causes MYOB to reject the otherwise-valid Bearer token with a 401
        // "OAuthTokenIsInvalid".
        "x-myobapi-cftoken": "",
        "x-myobapi-key": clientId,
        "x-myobapi-version": "v2",
        Accept: "application/json",
      },
    })

    const data = (await handleProviderResponse(res)) as Array<{
      Id?: string
      Name?: string
      Uri?: string
    }>

    if (!Array.isArray(data)) return []

    return data
      .filter((cf) => typeof cf.Uri === "string" && cf.Uri.length > 0)
      .map((cf) => ({
        id: cf.Uri as string,
        name: cf.Name && cf.Name.trim().length > 0 ? cf.Name : (cf.Id ?? (cf.Uri as string)),
      }))
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
          // x-myobapi-cftoken: empty string is correct for MYOB Business online/cloud
          // company files — ownership is established via OAuth Bearer token.
          "x-myobapi-cftoken": "",
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
