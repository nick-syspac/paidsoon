/**
 * Xero accounting provider implementation.
 *
 * Uses the Xero OAuth 2.0 + Accounting API v2 with PKCE.
 * Raw fetch is used (no xero-node SDK) per design decision OQ-4.
 *
 * Environment variables required:
 *   XERO_CLIENT_ID     — Xero developer app client ID
 *   XERO_CLIENT_SECRET — Xero developer app client secret (server-side only)
 *   XERO_REDIRECT_URI  — OAuth callback URL registered in Xero developer portal
 *
 * Scopes used (new granular scopes from Xero March 2026 API):
 *   openid profile email offline_access
 *   accounting.invoices.read accounting.contacts.read accounting.payments.read
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

const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize"
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token"
const XERO_REVOKE_URL = "https://identity.xero.com/connect/revocation"
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections"
const XERO_API_BASE = "https://api.xero.com/api.xro/2.0"

const XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.invoices.read",
  "accounting.contacts.read",
  "accounting.payments.read",
].join(" ")

const PAGE_SIZE = 250

function getConfig() {
  const clientId = process.env.XERO_CLIENT_ID
  const clientSecret = process.env.XERO_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error("XERO_CLIENT_ID and XERO_CLIENT_SECRET must be set")
  }
  return { clientId, clientSecret }
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
}

async function handleProviderResponse(res: Response): Promise<unknown> {
  if (res.ok) return res.json()

  const text = await res.text().catch(() => "")
  if (res.status === 401) {
    throw new AccountingProviderError("unauthorized", `Xero 401: ${text}`)
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? 60)
    throw new AccountingProviderError("rate_limited", `Xero 429 rate limited`, retryAfter)
  }
  if (res.status === 404) {
    throw new AccountingProviderError("not_found", `Xero 404: ${text}`)
  }
  if (res.status >= 500) {
    throw new AccountingProviderError("server_error", `Xero ${res.status}: ${text}`)
  }
  throw new AccountingProviderError("unknown", `Xero ${res.status}: ${text}`)
}

function normaliseXeroStatus(status: string): ProviderInvoiceStatus {
  switch (status) {
    case "AUTHORISED":
    case "SUBMITTED":
      return "open"
    case "PAID":
      return "paid"
    case "VOIDED":
    case "DELETED":
      return "voided"
    case "DRAFT":
      return "draft"
    default:
      return "unknown"
  }
}

function parseXeroDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  // Xero dates in JSON are encoded as "/Date(ms_since_epoch)/"
  const match = value.match(/\/Date\((-?\d+)(?:[+-]\d+)?\)\//)
  if (match) {
    return new Date(parseInt(match[1], 10))
  }
  // ISO fallback
  const d = new Date(value)
  return isNaN(d.getTime()) ? undefined : d
}

export class XeroProvider implements AccountingProvider {
  getAuthorizationUrl(params: { state: string; redirectUri: string }): string {
    const { clientId } = getConfig()
    const url = new URL(XERO_AUTH_URL)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("redirect_uri", params.redirectUri)
    url.searchParams.set("scope", XERO_SCOPES)
    url.searchParams.set("state", params.state)
    return url.toString()
  }

  async exchangeCodeForTokens(params: {
    code: string
    redirectUri: string
  }): Promise<TokenSet> {
    const { clientId, clientSecret } = getConfig()

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
    })

    const res = await fetch(XERO_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    })

    const data = (await handleProviderResponse(res)) as {
      access_token: string
      refresh_token: string
      expires_in: number
      scope: string
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
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })

    const res = await fetch(XERO_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    })

    const data = (await handleProviderResponse(res)) as {
      access_token: string
      refresh_token: string
      expires_in: number
      scope: string
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope,
    }
  }

  async revokeToken(refreshToken: string): Promise<void> {
    const { clientId, clientSecret } = getConfig()
    try {
      await fetch(XERO_REVOKE_URL, {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(clientId, clientSecret),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token: refreshToken }).toString(),
      })
    } catch {
      // Best-effort: log but do not throw (caller proceeds with local disconnect)
      console.warn("[xero] revokeToken failed — token may already be expired")
    }
  }

  async getOrganisations(accessToken: string): Promise<Organisation[]> {
    const res = await fetch(XERO_CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const data = (await handleProviderResponse(res)) as Array<{
      id: string
      tenantId: string
      tenantName: string
      tenantType: string
    }>

    // Only return organisations (not projects/other types)
    return data
      .filter((c) => c.tenantType === "ORGANISATION")
      .map((c) => ({
        id: c.tenantId,
        name: c.tenantName,
      }))
  }

  async getInvoices(params: {
    accessToken: string
    organisationId: string
    modifiedAfter?: Date
  }): Promise<ProviderInvoice[]> {
    const allInvoices: ProviderInvoice[] = []
    let page = 1

    while (true) {
      const url = new URL(`${XERO_API_BASE}/Invoices`)
      url.searchParams.set("page", String(page))
      url.searchParams.set("pageSize", String(PAGE_SIZE))
      url.searchParams.set("Type", "ACCREC")
      url.searchParams.set("Statuses", "AUTHORISED,SUBMITTED,PAID,VOIDED,DELETED")

      const headers: Record<string, string> = {
        Authorization: `Bearer ${params.accessToken}`,
        "Xero-tenant-id": params.organisationId,
        Accept: "application/json",
      }

      if (params.modifiedAfter) {
        // Format: "yyyy-MM-ddTHH:mm:ss" in UTC — Xero accepts this format
        const iso = params.modifiedAfter.toISOString().replace("Z", "").split(".")[0]
        headers["If-Modified-Since"] = iso
      }

      const res = await fetch(url.toString(), { headers })

      // 304 Not Modified means nothing changed since modifiedAfter
      if (res.status === 304) break

      const data = (await handleProviderResponse(res)) as {
        Invoices?: Array<{
          InvoiceID: string
          InvoiceNumber?: string
          Contact?: { ContactID: string; Name?: string; EmailAddress?: string }
          AmountDue?: number
          CurrencyCode?: string
          DueDate?: string
          Status?: string
          UpdatedDateUTC?: string
        }>
      }

      const invoices = data.Invoices ?? []
      for (const inv of invoices) {
        allInvoices.push({
          providerInvoiceId: inv.InvoiceID,
          invoiceNumber: inv.InvoiceNumber,
          providerContactId: inv.Contact?.ContactID ?? "",
          clientName: inv.Contact?.Name ?? "",
          clientEmail: inv.Contact?.EmailAddress ?? "",
          amountDue: inv.AmountDue ?? 0,
          currency: inv.CurrencyCode ?? "AUD",
          dueDate: parseXeroDate(inv.DueDate) ?? new Date(),
          status: normaliseXeroStatus(inv.Status ?? ""),
          providerUpdatedAt: parseXeroDate(inv.UpdatedDateUTC),
          rawMetadata: inv as unknown as Record<string, unknown>,
        })
      }

      // Xero returns fewer than pageSize items on the last page
      if (invoices.length < PAGE_SIZE) break
      page++
    }

    return allInvoices
  }

  async getContacts(params: {
    accessToken: string
    organisationId: string
    contactIds: string[]
  }): Promise<ProviderContact[]> {
    if (params.contactIds.length === 0) return []

    // Xero accepts up to 100 IDs per request via ContactIDs filter
    const BATCH = 100
    const results: ProviderContact[] = []

    for (let i = 0; i < params.contactIds.length; i += BATCH) {
      const batch = params.contactIds.slice(i, i + BATCH)
      const url = new URL(`${XERO_API_BASE}/Contacts`)
      url.searchParams.set("IDs", batch.join(","))

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Xero-tenant-id": params.organisationId,
          Accept: "application/json",
        },
      })

      const data = (await handleProviderResponse(res)) as {
        Contacts?: Array<{
          ContactID: string
          Name?: string
          EmailAddress?: string
        }>
      }

      for (const c of data.Contacts ?? []) {
        results.push({
          providerContactId: c.ContactID,
          name: c.Name ?? "",
          email: c.EmailAddress,
          rawMetadata: c as unknown as Record<string, unknown>,
        })
      }
    }

    return results
  }
}
