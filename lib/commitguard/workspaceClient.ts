import type { CommitGuardWorkspaceDTO } from "@/lib/commitguard/workspace"
import { selectWorkspaceCommitments, WorkspaceQuerySchema } from "@/lib/commitguard/workspaceFilters"

export type WorkspaceState = { workspace: CommitGuardWorkspaceDTO; refreshing: boolean; refreshFailed: boolean; mutating: boolean }
type Request = (url: string, init?: RequestInit) => Promise<Response>

export async function requestCommitGuardWorkspace(query = "", signal?: AbortSignal, request: Request = fetch): Promise<CommitGuardWorkspaceDTO> {
  const response = await request(`/api/commitguard/workspace${query ? `?${query}` : ""}`, { cache: "no-store", signal })
  if (!response.ok) throw new Error("Could not refresh workspace")
  const { workspace } = await response.json() as { workspace: CommitGuardWorkspaceDTO }
  if (!workspace || workspace.version !== 1 || workspace.summary?.calculationRevision !== workspace.calculationRevision ||
    workspace.summary?.inputRevision !== workspace.cashInputRevision || workspace.cashContext?.revision !== workspace.cashInputRevision ||
    workspace.summary?.asOf !== workspace.asOf ||
    JSON.stringify(workspace.summary?.cashContext) !== JSON.stringify(workspace.cashContext) ||
    JSON.stringify(workspace.summary?.settings) !== JSON.stringify(workspace.settings) ||
    !Array.isArray(workspace.commitments) || !Array.isArray(workspace.candidates) || !workspace.settings || !workspace.alerts ||
    workspace.reviewCount !== workspace.candidates.filter((row) => row.status === "pending").length) throw new Error("Invalid workspace response")
  const params = WorkspaceQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(query)))
  if (!params.success || JSON.stringify(workspace.upcoming) !== JSON.stringify(selectWorkspaceCommitments(workspace.commitments, params.data, workspace.asOf))) throw new Error("Invalid workspace selection")
  return workspace
}

function atLeast(next: CommitGuardWorkspaceDTO, previous: CommitGuardWorkspaceDTO): boolean {
  return next.calculationRevision >= previous.calculationRevision && next.cashInputRevision >= previous.cashInputRevision && next.asOf >= previous.asOf
}

/** Deferred requests and server props cannot replace a newer published snapshot. */
export function createWorkspaceStore(initial: CommitGuardWorkspaceDTO, query = "", request: Request = fetch) {
  let state: WorkspaceState = { workspace: initial, refreshing: false, refreshFailed: false, mutating: false }
  let sequence = 0
  let controller: AbortController | undefined
  let dirty = false
  const listeners = new Set<() => void>()
  const publish = (next: WorkspaceState): void => { state = next; listeners.forEach((listener) => listener()) }
  return {
    getSnapshot: (): WorkspaceState => state,
    subscribe: (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    beginMutation: (): void => { dirty = true; sequence++; controller?.abort(); publish({ ...state, refreshing: false }) },
    requestMutation: async (url: string, init: RequestInit): Promise<Response> => {
      // One writer across cash, candidates and lifecycle controls. A synchronous
      // store guard also covers double clicks before React has rendered disabled controls.
      if (state.mutating || state.refreshing || state.refreshFailed) throw new Error("Reload current workspace before another mutation")
      dirty = true
      sequence++
      controller?.abort()
      publish({ ...state, mutating: true, refreshing: false })
      try { return await request(url, init) }
      finally { publish({ ...state, mutating: false }) }
    },
    adoptServer: (workspace: CommitGuardWorkspaceDTO): void => {
      if (!dirty && !state.refreshing && !state.refreshFailed && atLeast(workspace, state.workspace)) publish({ ...state, workspace })
    },
    dispose: (): void => { sequence++; controller?.abort() },
    refresh: async (): Promise<void> => {
      if (state.mutating) throw new Error("Wait for the current mutation before refreshing")
      const current = ++sequence
      controller?.abort()
      controller = new AbortController()
      publish({ ...state, refreshing: true })
      try {
        const workspace = await requestCommitGuardWorkspace(query, controller.signal, request)
        if (current !== sequence) return
        if (!atLeast(workspace, state.workspace)) throw new Error("Stale workspace response")
        dirty = false
        publish({ workspace, refreshing: false, refreshFailed: false, mutating: false })
      } catch (error) {
        if (current !== sequence) return
        publish({ ...state, refreshing: false, refreshFailed: true })
        throw error
      }
    },
  }
}