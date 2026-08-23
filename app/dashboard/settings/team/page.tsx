import { getAuthenticatedUser } from "@/lib/supabase/server"
import { getSubscriptionTier, getUserSeatLimitForTier } from "@/lib/billing"
import { redirect } from "next/navigation"
import { TeamInvitesClient } from "@/components/settings/TeamInvitesClient"
import { isFeatureImplemented } from "@/lib/subscriptionPlans"

export default async function TeamSettingsPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  const seatLimit = getUserSeatLimitForTier(tier)
  const currentSeats = 1
  const teamSeatsImplemented = isFeatureImplemented("team_seats")
  const data = {
    tier,
    seatLimit,
    currentSeats,
    availableSeats: Math.max(seatLimit - currentSeats, 0),
    teamSeatsImplemented,
  }

  return <TeamInvitesClient initial={data} />
}
