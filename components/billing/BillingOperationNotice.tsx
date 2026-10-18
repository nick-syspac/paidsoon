"use client"

import Link from "next/link"
import type { useBillingOperation } from "@/components/billing/useBillingOperation"

export function BillingOperationNotice({ operation }: { operation: ReturnType<typeof useBillingOperation> }): React.JSX.Element | null {
  const { state } = operation
  if (!state.message && !state.intent) return null
  const unresolved = ["pending", "conflict"].includes(state.phase)
  return (
    <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
      <p role="status" aria-live="polite">{state.message ?? "Checking this billing request…"}</p>
      {unresolved && (
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={operation.loading} onClick={() => void operation.check()} className="underline disabled:opacity-50">Check billing request status</button>
          {state.canReconcile && <button type="button" disabled={operation.loading} onClick={() => void operation.reconcile()} className="underline disabled:opacity-50">Reconcile this billing request</button>}
        </div>
      )}
      {unresolved && <p>Automatic status checks stop after a short period. Reconciliation is never automatic. If unresolved, contact support rather than creating another request.</p>}
      {["succeeded", "failed", "superseded"].includes(state.phase) && <button type="button" disabled={operation.loading} onClick={operation.beginNewIntent} className="block underline disabled:opacity-50">Review details before a new billing request</button>}
      <Link href="/billing/checkout" className="inline-block underline">Open billing recovery without dashboard access</Link>
    </div>
  )
}