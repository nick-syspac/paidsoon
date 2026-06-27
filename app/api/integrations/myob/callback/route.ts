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
      `${APP_URL}/dashboard/settings/integrations?error=myob_cancelled`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/integrations?error=missing_params`
    )
  }

  if (!businessId) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/integrations?error=missing_company_file`
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
      `${APP_URL}/dashboard/settings/integrations?error=invalid_state`
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
      `${APP_URL}/dashboard/settings/integrations?error=token_exchange_failed`
    )
  }

  const encryptedAccessToken = encryptToken(tokens.accessToken)
  const encryptedRefreshToken = encryptToken(tokens.refreshToken)
  const tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000)
  const scopes = tokens.scope ?? "sme-sales sme-contacts-customer"

  // businessId from MYOB is the cf_uri used for all subsequent API calls.
  // Resolve the human-readable company file name by calling the MYOB company
  // file list endpoint. Falls back to the GUID segment of the URI on failure.
  const organisationId = businessId
  let organisationName = businessId.replace(/\/$/, "").split("/").pop() ?? "MYOB Company File"

  try {
    const orgs = await provider.getOrganisations(tokens.accessToken)
    const match = orgs.find(
      (o) => o.id === businessId || o.id.replace(/\/$/, "") === businessId.replace(/\/$/, "")
    )
    if (match?.name) organisationName = match.name
  } catch {
    // Non-fatal — proceed with GUID-based name
  }

  try {
    await withUserContext(user.id, async (tx) => {
      await tx.accountingConnection.upsert({
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
          status: "active",
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
          status: "active",
        },
      })
    })
  } catch (err) {
    console.error("[myob/callback] failed to store connection", err)
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/integrations?error=connection_save_failed`
    )
  }

  return NextResponse.redirect(
    `${APP_URL}/dashboard/settings/integrations?success=myob_connected`
  )
}
