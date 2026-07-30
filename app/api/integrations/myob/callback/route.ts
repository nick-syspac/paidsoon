/**
 * GET /api/integrations/myob/callback
 *
 * OAuth 2.0 callback from MYOB after the user authorises access.
 * - Validates the state nonce against oauth_states (CSRF protection)
 * - Exchanges the code for tokens
 * - Identifies the connected company file directly from the callback's
 *   `businessId`/`businessName` query params (confirmed via production
 *   logs and MYOB's docs: MYOB Business online OAuth authorises exactly one
 *   company file per grant and returns its id/name directly — there is
 *   nothing to discover via a separate API call, and no picker is needed)
 * - Stores the AccountingConnection and triggers an inline first sync
 *
 * `businessId` is a bare company-file id (a GUID), not a callable URL —
 * the callable company-file URI (cf_uri) is built by appending it to the
 * shared online API host (see `MYOB_COMPANY_FILE_LIST_URL`).
 */
import { createClient } from "@/lib/supabase/server"
import { prismaAdmin } from "@/lib/db/admin"
import { withUserContext } from "@/lib/db/withUserContext"
import { countActiveInvoiceSources, getInvoiceSourceLimitForTier } from "@/lib/billing"
import { getAccountingProvider } from "@/lib/providers/accounting"
import { encryptToken } from "@/lib/providers/accounting/crypto"
import { syncConnection } from "@/lib/providers/accounting/sync"
import { MYOB_COMPANY_FILE_LIST_URL } from "@/lib/providers/accounting/myob"
import { NextResponse } from "next/server"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

// Token exchange + an inline first sync (paginated invoice/contact fetches
// against MYOB) can comfortably exceed Vercel's default serverless function
// duration. Raise the cap so a slow-but-successful run isn't killed mid-request.
export const maxDuration = 60

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const businessId = searchParams.get("businessId")
  const businessName = searchParams.get("businessName")

  if (error) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/connections?source=myob&code=cancelled`
    )
  }

  if (!code || !state || !businessId) {
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

  // cf_uri: `businessId` is a bare company-file id, not a URL — build the
  // callable URI by appending it to the shared online API host. This must
  // match the shape getInvoices()/getContacts() in lib/providers/accounting/myob.ts
  // already expect for `organisationId` (they append paths like
  // `/Sale/Invoice/{type}` directly to it).
  const organisationId = `${MYOB_COMPANY_FILE_LIST_URL}${businessId}`
  // `businessName` is not documented by MYOB (only empirically observed on
  // production callbacks) — treat it as optional and fall back to a
  // deterministic, support-recognizable label rather than an extra API call.
  const organisationName = businessName?.trim()
    ? businessName.trim()
    : `MYOB Company File ${businessId}`

  console.info("[myob/callback] company identity returned", {
    businessId,
    businessName: businessName?.trim() || null,
    organisationId,
    organisationName,
    usedFallbackName: organisationName !== businessName?.trim(),
  })

  const encryptedAccessToken = encryptToken(tokens.accessToken)
  const encryptedRefreshToken = encryptToken(tokens.refreshToken)
  const tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000)
  const scopes = tokens.scope ?? "sme-sales sme-contacts-customer sme-company-settings sme-company-file"

  let connection
  try {
    connection = await withUserContext(user.id, async (tx) => {
      const existing = await tx.accountingConnection.findUnique({
        where: {
          userId_provider_organisationId: {
            userId: user.id,
            provider: "myob",
            organisationId,
          },
        },
        select: { id: true },
      })

      if (!existing) {
        const profile = await tx.userProfile.findUnique({
          where: { userId: user.id },
          select: { subscriptionTier: true },
        })
        const maxConnections = getInvoiceSourceLimitForTier(profile?.subscriptionTier)
        const activeConnections = await countActiveInvoiceSources(tx, user.id)
        if (activeConnections >= maxConnections) {
          throw new Error("CONNECTION_LIMIT_REACHED")
        }
      }

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
    if (err instanceof Error && err.message === "CONNECTION_LIMIT_REACHED") {
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings/connections?source=myob&code=connection_limit_reached`
      )
    }
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

