/**
 * GET /api/integrations/xero/callback
 *
 * OAuth 2.0 callback from Xero after the user authorises access.
 * - Validates the state nonce against oauth_states (CSRF protection)
 * - Exchanges the code for tokens
 * - Fetches the list of Xero organisations (tenants)
 * - If single org: stores AccountingConnection immediately
 * - If multiple orgs: redirects to org-selection UI with pending state in
 *   a short-lived HTTP-only encrypted cookie (avoids schema changes for
 *   temporary multi-org data)
 */
import { createClient } from "@/lib/supabase/server"
import { prismaAdmin } from "@/lib/db/admin"
import { withUserContext } from "@/lib/db/withUserContext"
import { getAccountingProvider } from "@/lib/providers/accounting"
import { encryptToken } from "@/lib/providers/accounting/crypto"
import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { cookies } from "next/headers"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/integrations?error=xero_cancelled`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/integrations?error=missing_params`
    )
  }

  // Validate CSRF nonce
  const oauthState = await prismaAdmin.oauthState.findUnique({
    where: { nonce: state },
  })

  if (
    !oauthState ||
    oauthState.provider !== "xero" ||
    oauthState.expiresAt < new Date()
  ) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/integrations?error=invalid_state`
    )
  }

  // The session user must match the nonce's userId
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== oauthState.userId) {
    return NextResponse.redirect(`${APP_URL}/sign-in`)
  }

  // Clean up the used nonce (best-effort — don't block on failure)
  prismaAdmin.oauthState.delete({ where: { nonce: state } }).catch(() => {})

  const provider = getAccountingProvider("xero")
  const redirectUri = process.env.XERO_REDIRECT_URI!

  let tokens
  try {
    tokens = await provider.exchangeCodeForTokens({ code, redirectUri })
  } catch (err) {
    console.error("[xero/callback] token exchange failed", err)
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/integrations?error=token_exchange_failed`
    )
  }

  let organisations
  try {
    organisations = await provider.getOrganisations(tokens.accessToken)
  } catch (err) {
    console.error("[xero/callback] getOrganisations failed", err)
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/integrations?error=org_fetch_failed`
    )
  }

  if (organisations.length === 0) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/integrations?error=no_organisations`
    )
  }

  // Encrypt tokens before storage
  const encryptedAccessToken = encryptToken(tokens.accessToken)
  const encryptedRefreshToken = encryptToken(tokens.refreshToken)
  const tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000)
  const scopes = tokens.scope ?? ""

  if (organisations.length === 1) {
    // Single org: store connection directly
    const org = organisations[0]
    await withUserContext(user.id, async (tx) => {
      await tx.accountingConnection.upsert({
        where: {
          userId_provider_organisationId: {
            userId: user.id,
            provider: "xero",
            organisationId: org.id,
          },
        },
        update: {
          organisationName: org.name,
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          scopes,
          status: "active",
          lastSyncedAt: null,
        },
        create: {
          userId: user.id,
          provider: "xero",
          organisationId: org.id,
          organisationName: org.name,
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          scopes,
          status: "active",
        },
      })
    })

    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/integrations?success=xero_connected`
    )
  }

  // Multiple orgs: store pending state in a short-lived HTTP-only server cookie
  // and redirect to org selection UI.
  const pendingKey = randomBytes(16).toString("hex")
  const cookieStore = await cookies()
  cookieStore.set(`xero_pending_${pendingKey}`, JSON.stringify({
    userId: user.id,
    organisations,
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

  const selectUrl = new URL(`${APP_URL}/dashboard/settings/integrations/xero/select-org`)
  selectUrl.searchParams.set("key", pendingKey)
  return NextResponse.redirect(selectUrl.toString())
}

