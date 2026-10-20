// Browser entrypoint only: real components, real HTTP fetch, no fake ledger.
import React from "react"
import { createRoot } from "react-dom/client"
import { CommitGuardDashboard } from "@/components/dashboard/commitguard/CommitGuardDashboard"
import { CommitGuardSettingsClient } from "@/components/settings/CommitGuardSettingsClient"
import { WorkspaceQuerySchema } from "@/lib/commitguard/workspaceFilters"

const root = createRoot(document.getElementById("root")!)
const settings = createRoot(document.getElementById("settings")!)
const params = WorkspaceQuerySchema.parse(Object.fromEntries(new URLSearchParams(location.search)))
async function render(): Promise<void> {
  const response = await fetch(`/api/commitguard/workspace${location.search}`)
  if (!response.ok) { root.render(<p role="alert">Synthetic session required ({response.status}).</p>); return }
  const { workspace } = await response.json()
  root.render(<CommitGuardDashboard initial={workspace} params={params} />)
  settings.render(<CommitGuardSettingsClient settings={workspace.settings} />)
}
// A router-refresh adapter reloads actual server DTOs, not RSC. Keep this
// distinction explicit in evidence; production Next/proxy code is untouched.
Object.assign(globalThis, { fixtureRefresh: () => { void render() } })
void render()