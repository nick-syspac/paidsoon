import type { RecentPayment } from "@/lib/dashboard/collectionMetrics"
import { formatCents, formatShortDate } from "@/lib/dashboard/format"

export function RecentPayments({ payments }: { payments: RecentPayment[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-medium text-gray-600">Recent Payments</h2>
      {payments.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No payments received yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {payments.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-gray-700">
                <span aria-hidden="true" className="text-green-600">
                  ✔
                </span>
                {payment.clientName}
                <span className="text-xs text-gray-400">{formatShortDate(payment.paidAt)}</span>
              </span>
              <span className="font-medium text-gray-900">{formatCents(payment.amountDue, payment.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
