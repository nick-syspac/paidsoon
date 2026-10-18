import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { countActiveInvoiceSources, getInvoiceSourceLimitForTier, getSubscriptionTier } from "@/lib/billing"
import { NO_SUBSCRIPTION_ACCESS } from "@/lib/billing/accessGuard"
import { NextResponse } from "next/server"

import { withSubscriptionAccess } from "@/lib/billing/subscriptionRoute"
export const GET = withSubscriptionAccess(GETHandler)
async function GETHandler() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/sign-in`
    )
  }

  const tier = await getSubscriptionTier(user.id)
  if (tier === null) return NextResponse.json(NO_SUBSCRIPTION_ACCESS, { status: 403 })
  const activeConnections = await withUserContext(
    user.id,
    (tx) => countActiveInvoiceSources(tx, user.id),
  )

  const maxConnections = getInvoiceSourceLimitForTier(tier)
  if (activeConnections >= maxConnections) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/connections?source=stripe&code=connection_limit_reached`,
    )
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.STRIPE_CONNECT_CLIENT_ID!,
    scope: "read_write",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe/connect/callback`,
    state: user.id, // CSRF protection: we verify this matches the session user in callback
  })

  return NextResponse.redirect(
    `https://connect.stripe.com/oauth/authorize?${params.toString()}`
  )
}
