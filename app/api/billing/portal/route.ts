import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { prismaAdmin } from "@/lib/db/admin"
import { NextResponse } from "next/server"
import Stripe from "stripe"

export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-05-27.dahlia",
  })
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const profile = await withUserContext(user.id, (tx) =>
    tx.userProfile.findUnique({ where: { userId: user.id } }),
  )

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  // Get or create the Stripe customer
  let customerId = profile.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    })
    customerId = customer.id
    // prismaAdmin used here: billing context, RLS bypass documented
    await prismaAdmin.userProfile.update({
      where: { userId: user.id },
      data: { stripeCustomerId: customerId },
    })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/subscription`,
  })

  return NextResponse.json({ url: session.url })
}
