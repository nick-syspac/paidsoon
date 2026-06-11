import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
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

  await withUserContext(user.id, async (tx) => {
    const existing = await tx.invoiceConnection.findFirst({
      where: { userId: user.id, provider: "stripe" },
      select: { id: true },
    })

    if (existing) {
      await tx.invoiceConnection.update({
        where: { id: existing.id },
        data: { stripeConnectAccountId, isActive: true },
      })
    } else {
      await tx.invoiceConnection.create({
        data: {
          userId: user.id,
          provider: "stripe",
          stripeConnectAccountId,
          isActive: true,
        },
      })
    }
  })

  return NextResponse.redirect(
    `${appUrl}/dashboard/settings/stripe?success=connected`
  )
}
