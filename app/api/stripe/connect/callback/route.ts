import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { getStripeConnectionLimitForTier } from "@/lib/billing"
import { NextResponse } from "next/server"
import Stripe from "stripe"

export async function GET(request: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-05-27.dahlia",
  })
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state") // should match user.id
  const error = searchParams.get("error")

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings/stripe?error=connect_cancelled`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings/stripe?error=missing_code`
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.id !== state) {
    return NextResponse.redirect(`${appUrl}/sign-in`)
  }

  // Exchange code for access token
  const response = await stripe.oauth.token({
    grant_type: "authorization_code",
    code,
  })

  const stripeConnectAccountId = response.stripe_user_id
  if (!stripeConnectAccountId) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings/stripe?error=no_account_id`
    )
  }

  try {
    await withUserContext(user.id, async (tx) => {
      const [profile, existingForAccount, activeConnections] = await Promise.all([
        tx.userProfile.findUnique({
          where: { userId: user.id },
          select: { subscriptionTier: true },
        }),
        tx.invoiceConnection.findFirst({
          where: {
            userId: user.id,
            provider: "stripe",
            stripeConnectAccountId,
          },
          select: { id: true },
        }),
        tx.invoiceConnection.count({
          where: { userId: user.id, provider: "stripe", isActive: true },
        }),
      ])

      if (existingForAccount) {
        await tx.invoiceConnection.update({
          where: { id: existingForAccount.id },
          data: { isActive: true },
        })
        return
      }

      const maxConnections = getStripeConnectionLimitForTier(
        profile?.subscriptionTier,
      )
      if (activeConnections >= maxConnections) {
        throw new Error("CONNECTION_LIMIT_REACHED")
      }

      await tx.invoiceConnection.create({
        data: {
          userId: user.id,
          provider: "stripe",
          stripeConnectAccountId,
          isActive: true,
        },
      })
    })
  } catch (error) {
    if (error instanceof Error && error.message === "CONNECTION_LIMIT_REACHED") {
      return NextResponse.redirect(
        `${appUrl}/dashboard/settings/stripe?error=connection_limit_reached`,
      )
    }
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings/stripe?error=connection_failed`,
    )
  }

  return NextResponse.redirect(
    `${appUrl}/dashboard/settings/stripe?success=connected`
  )
}
