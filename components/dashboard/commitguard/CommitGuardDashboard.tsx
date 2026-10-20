"use client"

import Link from "next/link"
import { CommitGuardWorkspaceProvider, useCommitGuardWorkspace } from "@/components/dashboard/commitguard/CommitGuardWorkspaceProvider"
import { CommitGuardCashContextPanel } from "@/components/dashboard/commitguard/CommitGuardCashContextPanel"
import { CommitGuardCashSummary } from "@/components/dashboard/commitguard/CommitGuardCashSummary"
import { CommitGuardWorkspace } from "@/components/dashboard/commitguard/CommitGuardWorkspace"
import { CommitGuardAlertHistory } from "@/components/dashboard/commitguard/CommitGuardAlertHistory"
import { CommitGuardUpcoming } from "@/components/dashboard/commitguard/CommitGuardUpcoming"
import { CommitGuardRenewals } from "@/components/dashboard/commitguard/CommitGuardRenewals"
import { workspaceQueryString } from "@/lib/commitguard/workspaceFilters"
import { workspaceSummaryForDisplay, type CommitGuardWorkspaceDTO, type WorkspaceQuery } from "@/lib/commitguard/workspace"

export function CommitGuardDashboard({ initial, params }: { initial: CommitGuardWorkspaceDTO; params: WorkspaceQuery }): React.JSX.Element {
  const query = workspaceQueryString(params)
  return <CommitGuardWorkspaceProvider key={query} initial={initial} query={query}><WorkspaceSurfaces params={params} /></CommitGuardWorkspaceProvider>
}

function WorkspaceSurfaces({ params }: { params: WorkspaceQuery }): React.JSX.Element | null {
  const context = useCommitGuardWorkspace()
  if (!context) return null
  const { workspace } = context
  const summary = workspaceSummaryForDisplay(workspace.summary)
  const linked = workspace.linkedCommitment
  return <div className="space-y-6" data-workspace-revision={workspace.calculationRevision} data-cash-revision={workspace.cashInputRevision}>
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h1 className="text-xl font-semibold">CommitGuard</h1>
      <p className="mt-1 text-sm text-gray-600">Protect upcoming cash with commitment forecasting, renewal visibility, and confidence-scored detection.</p>
      <div className="mt-3 flex gap-4"><Link href="/dashboard/settings/commitguard">Settings</Link><Link href="/dashboard/settings/import-export">Import / export</Link></div>
      {params.costGuardAlertId ? <p>Filtered to commitments linked to Cost Guard alert {params.costGuardAlertId}.</p> : null}
    </section>
    {summary.quality.reasons.includes("unsupported_recurrence") ? <p role="status">Forecast incomplete: a commitment has an unsupported or invalid schedule. Totals and free cash are not available. Existing commitments remain editable; choose a supported frequency for custom recurrence.</p> : null}
    <CommitGuardCashSummary summary={summary} />
    <section className="rounded-xl border bg-white p-4"><p>Detected commitments {workspace.reviewCount}</p><p className="text-xs">Pending review queue</p></section>
    <CommitGuardUpcoming upcoming={workspace.upcoming} params={params} />
    <CommitGuardAlertHistory history={workspace.alerts} params={params} />
    {params.commitmentId ? <section id="alert-commitment" tabIndex={-1} className="rounded-xl border bg-white p-4"><h2>Linked commitment</h2>
      {linked ? <><h3>{linked.name}</h3><p>Status: {linked.status}{linked.archived ? " · Archived (read-only)" : ""}</p><p>{linked.amount} · Next due (UTC): {linked.nextDueDate ?? "Unscheduled"}</p><p>Current saved record. Alert impact remains historical context, not a current risk assertion.</p>{!linked.archived ? <a href={`#commitment-${params.commitmentId}`}>Manage this commitment</a> : null}</> : <p>Commitment unavailable. It may no longer exist or be accessible.</p>}
    </section> : null}
    <div id="commitguard-cash-context"><CommitGuardCashContextPanel /></div>
    <CommitGuardWorkspace initialCommitments={workspace.commitments} initialDetectedCandidates={workspace.candidates} detectionEnabled={workspace.detectionEnabled} detectionSettings={workspace.settings} />
    <CommitGuardRenewals renewals={workspace.summary.renewals} commitments={workspace.commitments} params={params} />
  </div>
}