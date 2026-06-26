/**
 * GET /api/integrations/myob/connect
 *
 * Initiates the MYOB OAuth 2.0 authorisation flow.
 * - Verifies the user is authenticated
 * - Checks the accountingIntegrations feature flag (Solo+ required)
 * - Generates a CSRF nonce and stores it in oauth_states (10 min TTL)
 * - Redirects the user to the MYOB authorisation URL
 *
 * Note: MYOB's OAuth flow includes company file selection. The selected
 * company file's URI is returned as the `businessId` query param in the
 * callback, which becomes the organisationId for this connection.
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
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/integrations?error=upgrade_required`
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
