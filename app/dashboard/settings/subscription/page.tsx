import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { SubscriptionClient } from "@/components/settings/SubscriptionClient"

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; cancelled?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const params = await searchParams
  const profile = await withUserContext(user.id, (tx) =>
    tx.userProfile.findUnique({
      where: { userId: user.id },
      select: { subscriptionTier: true, subscriptionStatus: true },
    }),
  )

  return (
    <SubscriptionClient
      tier={(profile?.subscriptionTier as "free" | "pro") ?? "free"}
      status={profile?.subscriptionStatus ?? "active"}
      successMessage={params.success === "upgraded" ? "You're now on Pro!" : null}
    />
  )
}
