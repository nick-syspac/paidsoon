import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { StripeConnectionClient } from "@/components/settings/StripeConnectionClient"
import { getStripeConnectionLimitForTier } from "@/lib/billing"

export default async function StripeSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const params = await searchParams
  const { profile, connections } = await withUserContext(user.id, async (tx) => {
    const [profile, connections] = await Promise.all([
      tx.userProfile.findUnique({
        where: { userId: user.id },
        select: { subscriptionTier: true },
      }),
      tx.invoiceConnection.findMany({
        where: { userId: user.id, provider: "stripe", isActive: true },
        orderBy: { createdAt: "asc" },
      }),
    ])
    return { profile, connections }
  })

  const maxConnections = getStripeConnectionLimitForTier(profile?.subscriptionTier)

  return (
    <StripeConnectionClient
      connections={connections.map((connection) => ({
        id: connection.id,
        accountId: connection.stripeConnectAccountId,
      }))}
      maxConnections={maxConnections}
      successMessage={params.success === "connected" ? "Stripe account connected successfully!" : null}
      errorMessage={params.error ?? null}
    />
  )
}
