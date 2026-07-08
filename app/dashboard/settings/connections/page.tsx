import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { StripeConnectionClient } from "@/components/settings/StripeConnectionClient"
import { AccountingConnectionsClient } from "@/components/settings/AccountingConnectionsClient"
import { getStripeConnectionLimitForTier, requireFeature } from "@/lib/billing"
import { parseConnectionsFlash } from "@/lib/settings/connectionFlash"

type SearchParams = {
  success?: string
  error?: string
  source?: string
  code?: string
}

export default async function ConnectionsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const params = await searchParams
  const hasFeature = await requireFeature(user.id, "accounting_integrations")

  const { profile, stripeConnections, accountingConnections } = await withUserContext(
    user.id,
    async (tx) => {
      const [profile, stripeConnections, accountingConnections] = await Promise.all([
        tx.userProfile.findUnique({
          where: { userId: user.id },
          select: { subscriptionTier: true },
        }),
        tx.invoiceConnection.findMany({
          where: { userId: user.id, provider: "stripe", isActive: true },
          orderBy: { createdAt: "asc" },
        }),
        hasFeature
          ? tx.accountingConnection.findMany({
              where: { userId: user.id },
              orderBy: { createdAt: "asc" },
              include: {
                syncRuns: {
                  orderBy: { startedAt: "desc" },
                  take: 5,
                  select: {
                    id: true,
                    startedAt: true,
                    completedAt: true,
                    status: true,
                    invoicesCreated: true,
                    invoicesUpdated: true,
                    errorMessage: true,
                  },
                },
              },
            })
          : Promise.resolve([]),
      ])

      return { profile, stripeConnections, accountingConnections }
    }
  )

  const maxConnections = getStripeConnectionLimitForTier(profile?.subscriptionTier)
  const flash = parseConnectionsFlash(params)

  return (
    <div className="space-y-8">
      <StripeConnectionClient
        connections={stripeConnections.map((connection) => ({
          id: connection.id,
          accountId: connection.stripeConnectAccountId,
        }))}
        maxConnections={maxConnections}
        successMessage={flash.stripeSuccessMessage}
        errorMessage={flash.stripeErrorCode}
      />

      <AccountingConnectionsClient
        connections={accountingConnections.map((connection) => ({
          id: connection.id,
          provider: connection.provider as "xero" | "myob",
          organisationName: connection.organisationName,
          status: connection.status,
          lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
          recentRuns: connection.syncRuns.map((run) => ({
            id: run.id,
            startedAt: run.startedAt.toISOString(),
            completedAt: run.completedAt?.toISOString() ?? null,
            status: run.status,
            invoicesCreated: run.invoicesCreated,
            invoicesUpdated: run.invoicesUpdated,
            errorMessage: run.errorMessage ?? null,
          })),
        }))}
        hasFeature={hasFeature}
        successMessage={flash.accountingSuccessCode}
        errorMessage={flash.accountingErrorCode}
      />
    </div>
  )
}
