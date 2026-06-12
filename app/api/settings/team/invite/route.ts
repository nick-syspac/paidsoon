import { createClient } from "@/lib/supabase/server"
import { getSubscriptionTier, getUserSeatLimitForTier } from "@/lib/billing"
import { NextResponse } from "next/server"
import { z } from "zod"

const inviteSchema = z.object({
  email: z.string().email(),
})

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

  return NextResponse.json({
    tier,
    seatLimit,
    currentSeats,
    availableSeats: Math.max(seatLimit - currentSeats, 0),
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

  // Scaffold behavior: persistence is intentionally deferred until team-membership model exists.
  return NextResponse.json({
    success: true,
    message: `Seat available for ${parsed.data.email}. Invitation persistence scaffolded and ready for team model integration.`,
    tier,
    seatLimit,
    currentSeats,
    availableSeats: seatLimit - currentSeats,
  })
}
