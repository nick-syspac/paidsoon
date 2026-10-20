"use client"

import { useCallback } from "react"
import type { ReactElement } from "react"
import { CommitGuardCashContextForm } from "@/components/dashboard/commitguard/CommitGuardCashContextForm"
import { useCommitGuardWorkspace, useCommitGuardRefresh } from "@/components/dashboard/commitguard/CommitGuardWorkspaceProvider"

export function CommitGuardCashContextPanel(): ReactElement {
  const context = useCommitGuardWorkspace()
  const { refresh, requestMutation } = useCommitGuardRefresh()
  const request = useCallback((url: string, init?: RequestInit): Promise<Response> =>
    init?.method ? requestMutation(url, init) : fetch(url, init), [requestMutation])
  return <CommitGuardCashContextForm initialContext={context?.workspace.cashContext} onRefresh={refresh}
    mutationBlocked={Boolean(context?.mutating || context?.refreshing || context?.refreshFailed)}
    request={request} />
}