import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { StripeConnectionClient } from "@/components/settings/StripeConnectionClient"
import { AccountingConnectionsClient } from "@/components/settings/AccountingConnectionsClient"
import { getInvoiceSourceLimitForTier, requireFeature } from "@/lib/billing"
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
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const params = await searchParams
  const hasFeature = await requireFeature(user.id, "accounting_integrations")

  const { profile, stripeConnections, accountingConnections } = await withUserContext(
    user.id,
    async (tx) => {
      // Sequential, not Promise.all: queries on a single interactive
      // transaction's `tx` share one underlying pg connection — firing them
      // concurrently triggers a pg client deprecation warning and is unsafe.
      const profile = await tx.userProfile.findUnique({
        where: { userId: user.id },
        select: { subscriptionTier: true },
      })
      const stripeConnections = await tx.invoiceConnection.findMany({
        where: { userId: user.id, provider: "stripe", isActive: true },
        orderBy: { createdAt: "asc" },
      })
      const accountingConnections = hasFeature
        ? await tx.accountingConnection.findMany({
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
        : []

      return { profile, stripeConnections, accountingConnections }
    }
  )

  const maxConnections = getInvoiceSourceLimitForTier(profile?.subscriptionTier)
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
