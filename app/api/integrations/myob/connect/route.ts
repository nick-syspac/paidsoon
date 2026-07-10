/**
 * GET /api/integrations/myob/connect
 *
 * Initiates the MYOB OAuth 2.0 authorisation flow.
 * - Verifies the user is authenticated
 * - Checks the accountingIntegrations feature flag (Solo+ required)
 * - Generates a CSRF nonce and stores it in oauth_states (10 min TTL)
 * - Redirects the user to the MYOB authorisation URL
 *
 * Note: MYOB's hosted authorisation screen does NOT let the user pick a
 * company file — it only covers login/consent. Company-file selection
 * happens in the callback after token exchange, once the resulting access
 * token can be used to list reachable company files (single file: connect
 * immediately; multiple files: user is redirected to a selection UI).
 */
import { createClient } from "@/lib/supabase/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireFeature } from "@/lib/billing"
import { getAccountingProvider } from "@/lib/providers/accounting"
import { NextResponse } from "next/server"
import { randomBytes } from "crypto"

const NONCE_TTL_MINUTES = 10

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/sign-in`)
  }

  const hasFeature = await requireFeature(user.id, "accounting_integrations")
  if (!hasFeature) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/connections?source=myob&code=upgrade_required`
    )
  }

  const nonce = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + NONCE_TTL_MINUTES * 60 * 1000)

  await prismaAdmin.oauthState.create({
    data: {
      nonce,
      userId: user.id,
      provider: "myob",
      expiresAt,
    },
  })

  const redirectUri = process.env.MYOB_REDIRECT_URI!
  const provider = getAccountingProvider("myob")
  const authUrl = provider.getAuthorizationUrl({ state: nonce, redirectUri })

  return NextResponse.redirect(authUrl)
}
