/**
 * GET /api/integrations/myob/callback
 *
 * OAuth 2.0 callback from MYOB after the user authorises access.
 * - Validates the state nonce against oauth_states (CSRF protection)
 * - Exchanges the code for tokens
 * - Fetches the list of company files reachable by the resulting access
 *   token (MYOB's authorise screen does NOT let the user pick a company
 *   file — selection only becomes possible after we have a token)
 * - If exactly one company file is reachable: stores the AccountingConnection
 *   immediately
 * - If multiple company files are reachable: stores the pending tokens in a
 *   short-lived HTTP-only cookie and redirects to a selection UI, mirroring
 *   the Xero multi-organisation flow
 *
 * Note: the company-file list call is retried a couple of times on a 401,
 * because MYOB access tokens can take a moment to propagate through their
 * backend right after issuance — calling any API with a brand-new token
 * immediately can return a transient "OAuthTokenIsInvalid" 401.
 */
import { createClient } from "@/lib/supabase/server"
import { prismaAdmin } from "@/lib/db/admin"
import { withUserContext } from "@/lib/db/withUserContext"
import { getAccountingProvider } from "@/lib/providers/accounting"
import { encryptToken } from "@/lib/providers/accounting/crypto"
import { syncConnection } from "@/lib/providers/accounting/sync"
import { AccountingProviderError, type AccountingProvider, type Organisation } from "@/lib/providers/accounting/types"
import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { cookies } from "next/headers"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

// Token exchange + the 401-retry window below + an inline first sync (paginated
// invoice/contact fetches against MYOB) can comfortably exceed Vercel's default
// serverless function duration. Raise the cap so a slow-but-successful run isn't
// killed mid-request.
export const maxDuration = 60

// MYOB access tokens can take a moment to propagate through their backend
// after issuance — calling an API with a brand-new token immediately after
// token exchange can return a transient 401 (OAuthTokenIsInvalid) even though
// the token is valid. Retry a few times with a short delay before giving up.
// Widened from [1500, 3000] after observing propagation delays that
// outlasted the previous ~4.5s retry budget in production; maxDuration=60
// on this route leaves plenty of headroom for the extra wait.
const TOKEN_PROPAGATION_RETRY_DELAYS_MS = [1500, 3000, 6000, 10000]

async function getOrganisationsWithRetry(
  provider: AccountingProvider,
  accessToken: string
): Promise<Organisation[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await provider.getOrganisations(accessToken)
    } catch (err) {
      const isUnauthorized = err instanceof AccountingProviderError && err.kind === "unauthorized"
      if (!isUnauthorized || attempt >= TOKEN_PROPAGATION_RETRY_DELAYS_MS.length) throw err
      console.warn(
        `[myob/callback] getOrganisations got 401, retrying in ${TOKEN_PROPAGATION_RETRY_DELAYS_MS[attempt]}ms (attempt ${attempt + 1})`
      )
      await new Promise((resolve) => setTimeout(resolve, TOKEN_PROPAGATION_RETRY_DELAYS_MS[attempt]))
    }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/connections?source=myob&code=cancelled`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/connections?source=myob&code=missing_params`
    )
  }

  // Validate CSRF nonce
  const oauthState = await prismaAdmin.oauthState.findUnique({
    where: { nonce: state },
  })

  if (
    !oauthState ||
    oauthState.provider !== "myob" ||
    oauthState.expiresAt < new Date()
  ) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/connections?source=myob&code=invalid_state`
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== oauthState.userId) {
    return NextResponse.redirect(`${APP_URL}/sign-in`)
  }

  // Clean up the used nonce
  prismaAdmin.oauthState.delete({ where: { nonce: state } }).catch(() => {})

  const provider = getAccountingProvider("myob")
  const redirectUri = process.env.MYOB_REDIRECT_URI!

  let tokens
  try {
    tokens = await provider.exchangeCodeForTokens({ code, redirectUri })
  } catch (err) {
    console.error("[myob/callback] token exchange failed", err)
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/connections?source=myob&code=token_exchange_failed`
    )
  }

  let companyFiles
  try {
    companyFiles = await getOrganisationsWithRetry(provider, tokens.accessToken)
  } catch (err) {
    console.error("[myob/callback] getOrganisations failed", err)
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/connections?source=myob&code=org_fetch_failed`
    )
  }

  if (companyFiles.length === 0) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/connections?source=myob&code=no_organisations`
    )
  }

  const encryptedAccessToken = encryptToken(tokens.accessToken)
  const encryptedRefreshToken = encryptToken(tokens.refreshToken)
  const tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000)
  const scopes = tokens.scope ?? "sme-sales sme-contacts-customer"

  if (companyFiles.length === 1) {
    // Single company file: store the connection directly.
    const companyFile = companyFiles[0]
    let connection
    try {
      connection = await withUserContext(user.id, async (tx) => {
        return tx.accountingConnection.upsert({
          where: {
            userId_provider_organisationId: {
              userId: user.id,
              provider: "myob",
              organisationId: companyFile.id,
            },
          },
          update: {
            organisationName: companyFile.name,
            encryptedAccessToken,
            encryptedRefreshToken,
            tokenExpiresAt,
            scopes,
            // Reconnecting warrants a fresh first-sync validation rather than
            // implying the previous sync history still reflects current data.
            status: "pending_first_sync",
            lastSyncedAt: null,
          },
          create: {
            userId: user.id,
            provider: "myob",
            organisationId: companyFile.id,
            organisationName: companyFile.name,
            encryptedAccessToken,
            encryptedRefreshToken,
            tokenExpiresAt,
            scopes,
            status: "pending_first_sync",
          },
        })
      })
    } catch (err) {
      console.error("[myob/callback] failed to store connection", err)
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings/connections?source=myob&code=connection_save_failed`
      )
    }

    // Trigger the first sync inline so a "connected" connection does not sit in
    // pending_first_sync indefinitely until the next cron pass. syncConnection
    // handles its own errors internally and updates the connection status
    // (active on success, error on a first-sync failure) — this call is
    // best-effort and must not block the redirect on an unexpected throw.
    try {
      await syncConnection(connection.id)
    } catch (err) {
      console.error("[myob/callback] initial sync failed to run", err)
    }

    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/connections?source=myob&code=connected`
    )
  }

  // Multiple company files: store pending state in a short-lived HTTP-only
  // server cookie and redirect to the company-file selection UI.
  const pendingKey = randomBytes(16).toString("hex")
  const cookieStore = await cookies()
  cookieStore.set(`myob_pending_${pendingKey}`, JSON.stringify({
    userId: user.id,
    organisations: companyFiles,
    encryptedAccessToken,
    encryptedRefreshToken,
    tokenExpiresAt: tokenExpiresAt.toISOString(),
    scopes,
  }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 60, // 30 minutes
    path: "/",
  })

  const selectUrl = new URL(`${APP_URL}/dashboard/settings/connections/myob/select-org`)
  selectUrl.searchParams.set("key", pendingKey)
  return NextResponse.redirect(selectUrl.toString())
}

