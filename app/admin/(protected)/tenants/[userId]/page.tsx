import Link from "next/link"
import type { ReactElement } from "react"
import { notFound } from "next/navigation"
import { fetchTenantSnapshot } from "@/lib/admin/tenantSnapshot"
import { runDiagnostics } from "@/lib/admin/diagnostics"
import { IdentitySection } from "@/components/admin/tenant-detail/IdentitySection"
import { SubscriptionSection } from "@/components/admin/tenant-detail/SubscriptionSection"
import { TrialAccessManager } from "@/components/admin/tenant-detail/TrialAccessManager"
import { ConnectionsSection } from "@/components/admin/tenant-detail/ConnectionsSection"
import { ScheduleSection } from "@/components/admin/tenant-detail/ScheduleSection"
import { InvoiceSummarySection } from "@/components/admin/tenant-detail/InvoiceSummarySection"
import { EmailLogSection } from "@/components/admin/tenant-detail/EmailLogSection"
import { EmailSettingsSection } from "@/components/admin/tenant-detail/EmailSettingsSection"
import { DiagnosticsSection } from "@/components/admin/tenant-detail/DiagnosticsSection"
import { AdminGuardError } from "@/lib/admin/guard"
import { requireTrialAccessOwner } from "@/lib/admin/trialAccessAuthority"
import { TrialPreviewError } from "@/lib/billing/trialAccessPreview"
import { readTrialManagementSnapshot, type TrialManagementSnapshot } from "@/lib/admin/trialAccessManagement"

interface Props {
  params: Promise<{ userId: string }>
}

export default async function AdminTenantDetailPage({ params }: Props): Promise<ReactElement> {
  const { userId } = await params
  const snapshot = await fetchTenantSnapshot(userId)

  if (!snapshot) notFound()

  const diagnostics = runDiagnostics(snapshot)
  let canManageTrialAccess = false
  try {
    await requireTrialAccessOwner()
    canManageTrialAccess = true
  } catch (error) {
    // Keep the existing staff health view. Owner authority is required only for
    // the management entry; unexpected infrastructure failures still propagate.
    if (!(error instanceof AdminGuardError) && !(error instanceof TrialPreviewError && error.status === 403)) throw error
  }

  let management: TrialManagementSnapshot | null | undefined
  if (canManageTrialAccess) {
    try {
      // Same safe, fresh, owner-authorized service as GET. Never load the owner
      // endpoint or operation journal for support/admin health views.
      management = await readTrialManagementSnapshot(userId)
    } catch (error) {
      if (error instanceof AdminGuardError || (error instanceof TrialPreviewError && error.status === 403)) {
        canManageTrialAccess = false
      } else {
        // No raw provider/persistence failure reaches the rendered page.
        management = null
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/tenants" className="text-gray-500 hover:text-gray-300 text-sm">
          ← Tenants
        </Link>
        <h1 className="text-2xl font-bold text-white">
          {snapshot.profile.displayName?.trim() || "Tenant account"}
        </h1>
      </div>

      {/* Diagnostics — always first */}
      <DiagnosticsSection diagnostics={diagnostics} tenantUserId={userId} canManageTrialAccess={canManageTrialAccess} />

      <IdentitySection
        profile={snapshot.profile}
        supabaseEmail={snapshot.supabaseEmail}
        supabaseLastSignIn={snapshot.supabaseLastSignIn}
      />
      <div id="trial-access" className="space-y-3">
        <SubscriptionSection profile={snapshot.profile} supabaseEmail={snapshot.supabaseEmail}
          access={snapshot.subscriptionAccess} management={management} />
        {canManageTrialAccess && (
          <TrialAccessManager key={userId} tenantId={userId} initialSnapshot={management ?? null} />
        )}
      </div>
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
