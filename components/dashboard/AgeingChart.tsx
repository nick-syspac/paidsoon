import type { AgeingBucket } from "@/lib/dashboard/ageing"
import { formatCents } from "@/lib/dashboard/format"

const BUCKET_COLORS: Record<AgeingBucket["key"], string> = {
  current: "bg-green-500",
  d1to30: "bg-amber-400",
  d31to60: "bg-orange-500",
  d61to90: "bg-red-500",
  d90plus: "bg-red-700",
}

export function AgeingChart({ buckets, currency = "usd" }: { buckets: AgeingBucket[]; currency?: string }) {
  const maxAmount = Math.max(1, ...buckets.map((bucket) => bucket.amount))
  const hasData = buckets.some((bucket) => bucket.amount > 0)

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-medium text-gray-600">Ageing</h2>
      {!hasData ? (
        <p className="mt-4 text-sm text-gray-500">No outstanding invoices — nothing to age.</p>
      ) : (
        <div className="mt-4 flex items-end gap-3">
          {buckets.map((bucket) => {
            const heightPercent = Math.max(2, Math.round((bucket.amount / maxAmount) * 100))
            return (
              <div key={bucket.key} className="flex flex-1 flex-col items-center">
                <span className="text-xs font-medium text-gray-700">{formatCents(bucket.amount, currency)}</span>
                <div className="mt-1 flex h-32 w-full items-end">
                  <div
                    role="img"
                    aria-label={`${bucket.label}: ${formatCents(bucket.amount, currency)} across ${bucket.count} invoice${bucket.count === 1 ? "" : "s"}`}
                    className={`w-full rounded-t ${BUCKET_COLORS[bucket.key]}`}
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
                <span className="mt-2 flex h-8 items-start justify-center text-xs text-gray-500 text-center">
                  {bucket.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
