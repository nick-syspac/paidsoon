"use client"

import Link from "next/link"
import { useBillingOperation } from "@/components/billing/useBillingOperation"
import { BillingOperationNotice } from "@/components/billing/BillingOperationNotice"
import type { BillingClientProps } from "@/lib/billing/clientOperation"

export function SubscriptionCancellationClient({
  title,
  description,
  confirmLabel,
  confirmDisabled,
  ...billing
}: {
  title: string
  description: string
  confirmLabel: string | null
  confirmDisabled: boolean
} & BillingClientProps) {
  const operation = useBillingOperation(billing)
  const { loading } = operation

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Cancel subscription
          </p>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        </div>
        <p className="text-sm text-gray-600 leading-6">{description}</p>

        <BillingOperationNotice operation={operation} />

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/settings/subscription"
            className="inline-flex items-center justify-center rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Keep subscription
          </Link>
          {confirmLabel ? (
            <button
              onClick={() => void operation.start({ path: "/api/billing/cancel", method: "POST", body: null })}
              disabled={loading || confirmDisabled}
              className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? "Working…" : confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}