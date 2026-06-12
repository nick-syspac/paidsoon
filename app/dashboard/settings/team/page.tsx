import { createClient } from "@/lib/supabase/server"
import { getSubscriptionTier, getUserSeatLimitForTier } from "@/lib/billing"
import { redirect } from "next/navigation"
import { TeamInvitesClient } from "@/components/settings/TeamInvitesClient"

export default async function TeamSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  const seatLimit = getUserSeatLimitForTier(tier)
  const currentSeats = 1
  const data = {
    tier,
    seatLimit,
    currentSeats,
    availableSeats: Math.max(seatLimit - currentSeats, 0),
  }

  return <TeamInvitesClient initial={data} />
}
