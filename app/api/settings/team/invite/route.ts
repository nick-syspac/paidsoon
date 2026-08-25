import { createClient } from "@/lib/supabase/server"
import { getSubscriptionTier, getUserSeatLimitForTier } from "@/lib/billing"
import { isFeatureImplemented } from "@/lib/subscriptionPlans"
import { NextResponse } from "next/server"
import { z } from "zod"

const inviteSchema = z.object({
  email: z.string().email(),
})

const TEAM_SEATS_UNAVAILABLE = {
  error: "Team seats are coming soon",
  code: "feature_not_implemented",
  feature: "team_seats",
} as const

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tier = await getSubscriptionTier(user.id)
  const seatLimit = getUserSeatLimitForTier(tier)
  const currentSeats = 1
  const teamSeatsImplemented = isFeatureImplemented("team_seats")

  return NextResponse.json({
    tier,
    seatLimit,
    currentSeats,
    availableSeats: Math.max(seatLimit - currentSeats, 0),
    featureAvailability: {
      teamSeats: {
        implemented: teamSeatsImplemented,
        actionable: teamSeatsImplemented,
      },
    },
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const tier = await getSubscriptionTier(user.id)
  const seatLimit = getUserSeatLimitForTier(tier)
  const currentSeats = 1

  if (!isFeatureImplemented("team_seats")) {
    return NextResponse.json(
      {
        ...TEAM_SEATS_UNAVAILABLE,
        tier,
        seatLimit,
        currentSeats,
      },
      { status: 409 },
    )
  }

  if (currentSeats >= seatLimit) {
    return NextResponse.json(
      {
        error: "Seat limit reached for your current plan",
        code: "seat_limit_reached",
        tier,
        seatLimit,
        currentSeats,
      },
      { status: 403 },
    )
  }

  return NextResponse.json({
    success: true,
    message: `Seat available for ${parsed.data.email}.`,
    tier,
    seatLimit,
    currentSeats,
    availableSeats: seatLimit - currentSeats,
  })
}
