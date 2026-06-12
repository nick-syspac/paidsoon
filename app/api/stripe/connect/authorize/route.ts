import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { getStripeConnectionLimitForTier } from "@/lib/billing"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/sign-in`
    )
  }

  const { subscriptionTier, activeConnections } = await withUserContext(
    user.id,
    async (tx) => {
      const [profile, activeConnections] = await Promise.all([
        tx.userProfile.findUnique({
          where: { userId: user.id },
          select: { subscriptionTier: true },
        }),
        tx.invoiceConnection.count({
          where: { userId: user.id, provider: "stripe", isActive: true },
        }),
      ])
      return {
        subscriptionTier: profile?.subscriptionTier,
        activeConnections,
      }
    },
  )

  const maxConnections = getStripeConnectionLimitForTier(subscriptionTier)
  if (activeConnections >= maxConnections) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/stripe?error=connection_limit_reached`,
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
