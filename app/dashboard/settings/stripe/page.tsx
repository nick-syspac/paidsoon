import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { StripeConnectionClient } from "@/components/settings/StripeConnectionClient"

export default async function StripeSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const params = await searchParams
  const connection = await prisma.invoiceConnection.findFirst({
    where: { userId: user.id, provider: "stripe" },
  })

  return (
    <StripeConnectionClient
      isConnected={!!connection?.isActive}
      accountId={connection?.stripeConnectAccountId ?? null}
      successMessage={params.success === "connected" ? "Stripe account connected successfully!" : null}
      errorMessage={params.error ?? null}
    />
  )
}
