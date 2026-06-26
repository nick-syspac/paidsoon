import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { AccountingConnectionsClient } from "@/components/settings/AccountingConnectionsClient"
import { requireFeature } from "@/lib/billing"

export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const params = await searchParams
  const hasFeature = await requireFeature(user.id, "accounting_integrations")

  const connections = hasFeature
    ? await withUserContext(user.id, async (tx) => {
        return tx.accountingConnection.findMany({
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
      })
    : []

  return (
    <AccountingConnectionsClient
      connections={connections.map((c) => ({
        id: c.id,
        provider: c.provider as "xero" | "myob",
        organisationName: c.organisationName,
        status: c.status,
        lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
        recentRuns: c.syncRuns.map((r) => ({
          id: r.id,
          startedAt: r.startedAt.toISOString(),
          completedAt: r.completedAt?.toISOString() ?? null,
          status: r.status,
          invoicesCreated: r.invoicesCreated,
          invoicesUpdated: r.invoicesUpdated,
          errorMessage: r.errorMessage ?? null,
        })),
      }))}
      hasFeature={hasFeature}
      successMessage={params.success ?? null}
      errorMessage={params.error ?? null}
    />
  )
}
