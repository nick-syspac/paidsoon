import type { InvoiceCounts } from "@/lib/admin/tenantSnapshot"

interface Props {
  invoiceCounts: InvoiceCounts
}

const STATUS_LABELS: Array<{ key: keyof Omit<InvoiceCounts, "total">; label: string }> = [
  { key: "pending", label: "Open / Pending" },
  { key: "paused", label: "Paused" },
  { key: "snoozed", label: "Snoozed" },
  { key: "sequence_complete", label: "Sequence complete" },
  { key: "manually_resolved", label: "Manually resolved" },
  { key: "paid", label: "Paid" },
]

export function InvoiceSummarySection({ invoiceCounts }: Props) {
  return (
    <section className="bg-gray-900 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Invoice Summary
        <span className="ml-2 text-gray-500 normal-case font-normal">({invoiceCounts.total} total)</span>
      </h2>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {STATUS_LABELS.map(({ key, label }) => (
          <li key={key} className="bg-gray-800 rounded px-3 py-2 text-sm flex justify-between">
            <span className="text-gray-400">{label}</span>
            <span className="text-gray-100 font-medium">{invoiceCounts[key]}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
