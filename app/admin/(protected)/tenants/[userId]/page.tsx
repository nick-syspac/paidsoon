import { notFound } from "next/navigation"
import { fetchTenantSnapshot } from "@/lib/admin/tenantSnapshot"
import { runDiagnostics } from "@/lib/admin/diagnostics"
import { IdentitySection } from "@/components/admin/tenant-detail/IdentitySection"
import { SubscriptionSection } from "@/components/admin/tenant-detail/SubscriptionSection"
import { ConnectionsSection } from "@/components/admin/tenant-detail/ConnectionsSection"
import { ScheduleSection } from "@/components/admin/tenant-detail/ScheduleSection"
import { InvoiceSummarySection } from "@/components/admin/tenant-detail/InvoiceSummarySection"
import { EmailLogSection } from "@/components/admin/tenant-detail/EmailLogSection"
import { EmailSettingsSection } from "@/components/admin/tenant-detail/EmailSettingsSection"
import { DiagnosticsSection } from "@/components/admin/tenant-detail/DiagnosticsSection"

interface Props {
  params: Promise<{ userId: string }>
}

export default async function AdminTenantDetailPage({ params }: Props) {
  const { userId } = await params
  const snapshot = await fetchTenantSnapshot(userId)

  if (!snapshot) notFound()

  const diagnostics = runDiagnostics(snapshot)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <a href="/admin/tenants" className="text-gray-500 hover:text-gray-300 text-sm">
          ← Tenants
        </a>
        <h1 className="text-2xl font-bold text-white">
          {snapshot.profile.displayName ?? (snapshot.supabaseEmail || userId)}
        </h1>
      </div>

      {/* Diagnostics — always first */}
      <DiagnosticsSection diagnostics={diagnostics} tenantUserId={userId} />

      <IdentitySection
        profile={snapshot.profile}
        supabaseEmail={snapshot.supabaseEmail}
        supabaseLastSignIn={snapshot.supabaseLastSignIn}
      />
      <SubscriptionSection profile={snapshot.profile} />
      <ConnectionsSection
        stripeInvoiceConn={snapshot.stripeInvoiceConn}
        accountingConns={snapshot.accountingConns}
      />
      <ScheduleSection schedule={snapshot.schedule} />
      <InvoiceSummarySection invoiceCounts={snapshot.invoiceCounts} />
      <EmailLogSection logs={snapshot.recentEmailLogs} />
      <EmailSettingsSection emailSettings={snapshot.emailSettings} />
    </div>
  )
}
