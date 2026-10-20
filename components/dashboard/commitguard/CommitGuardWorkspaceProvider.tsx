"use client"

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import type { CommitGuardWorkspaceDTO } from "@/lib/commitguard/workspace"
import { createWorkspaceStore, requestCommitGuardWorkspace } from "@/lib/commitguard/workspaceClient"

type WorkspaceContext = {
  workspace: CommitGuardWorkspaceDTO; refreshing: boolean; refreshFailed: boolean; mutating: boolean;
  refresh: () => Promise<void>; requestMutation: (url: string, init: RequestInit) => Promise<Response>
}
const Context = createContext<WorkspaceContext | null>(null)

export function CommitGuardWorkspaceProvider({ initial, query, children }: {
  initial: CommitGuardWorkspaceDTO; query: string; children: ReactNode
}): React.JSX.Element {
  const router = useRouter()
  const [store] = useState(() => createWorkspaceStore(initial, query))
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useEffect(() => { store.adoptServer(initial) }, [store, initial])
  useEffect(() => () => store.dispose(), [store])
  const value = useMemo(() => ({ ...state, requestMutation: store.requestMutation,
    refresh: async (): Promise<void> => { try { await store.refresh() } finally { router.refresh() } },
  }), [state, store, router])
  return <Context.Provider value={value}>
    {state.refreshing ? <p role="status">Refreshing all CommitGuard figures…</p> : null}
    {state.refreshFailed ? <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p>Save succeeded, but figures could not refresh. Displayed figures are from the previous workspace revision.</p>
      <button type="button" disabled={state.refreshing} onClick={() => { void value.refresh().catch(() => undefined) }} className="mt-2 rounded border px-3 py-2">Retry workspace refresh (GET only)</button>
    </div> : null}
    {children}
  </Context.Provider>
}

export function useCommitGuardWorkspace(): WorkspaceContext | null { return useContext(Context) }

export function useCommitGuardRefresh(): Pick<WorkspaceContext, "refresh" | "requestMutation"> {
  const context = useContext(Context)
  const router = useRouter()
  return context ?? { requestMutation: fetch, refresh: async () => {
    try { await requestCommitGuardWorkspace() } finally { router.refresh() }
  } }
}