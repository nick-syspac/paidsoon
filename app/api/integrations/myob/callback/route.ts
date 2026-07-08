/**
 * GET /api/integrations/myob/callback
 *
 * OAuth 2.0 callback from MYOB after the user authorises access.
 * - Validates the state nonce against oauth_states (CSRF protection)
 * - Exchanges the code for tokens
 * - Reads the `businessId` query param (= company file URI / cf_uri) which
 *   MYOB provides during the OAuth redirect as the selected company file
 * - Stores an AccountingConnection record
 *
 * MYOB handles company file selection as part of its OAuth UI, so there is
 * no multi-org selection step needed (unlike Xero).
 */
import { createClient } from "@/lib/supabase/server"
import { prismaAdmin } from "@/lib/db/admin"
import { withUserContext } from "@/lib/db/withUserContext"
import { getAccountingProvider } from "@/lib/providers/accounting"
import { encryptToken } from "@/lib/providers/accounting/crypto"
import { syncConnection } from "@/lib/providers/accounting/sync"
import { NextResponse } from "next/server"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  // MYOB provides the company file URI as `businessId` on the callback URL
  const businessId = searchParams.get("businessId") ?? searchParams.get("business_id") ?? ""

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

  if (!businessId) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/connections?source=myob&code=missing_company_file`
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

  const encryptedAccessToken = encryptToken(tokens.accessToken)
  const encryptedRefreshToken = encryptToken(tokens.refreshToken)
  const tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000)
  const scopes = tokens.scope ?? "sme-sales sme-contacts-customer"

  // businessId from MYOB is the cf_uri used for all subsequent API calls.
  // Resolve the human-readable company file name by calling the MYOB company
  // file list endpoint. Falls back to a deterministic identifier-derived name
  // (never an empty string) on failure.
  const organisationId = businessId
  const trimmedBusinessId = businessId.replace(/\/$/, "")
  const fallbackSegment = trimmedBusinessId.split("/").filter(Boolean).pop()
  let organisationName = fallbackSegment && fallbackSegment.length > 0 ? fallbackSegment : "MYOB Company File"

  try {
    const orgs = await provider.getOrganisations(tokens.accessToken)
    const match = orgs.find(
      (o) => o.id === businessId || o.id.replace(/\/$/, "") === trimmedBusinessId
    )
    if (match?.name) organisationName = match.name
  } catch {
    // Non-fatal — proceed with the deterministic fallback name
  }

  let connection
  try {
    connection = await withUserContext(user.id, async (tx) => {
      return tx.accountingConnection.upsert({
        where: {
          userId_provider_organisationId: {
            userId: user.id,
            provider: "myob",
            organisationId,
          },
        },
        update: {
          organisationName,
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
          organisationId,
          organisationName,
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
