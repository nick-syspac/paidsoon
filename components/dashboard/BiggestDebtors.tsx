import type { DebtorSummary } from "@/lib/dashboard/biggestDebtors"
import { formatCents } from "@/lib/dashboard/format"

export function BiggestDebtors({ debtors }: { debtors: DebtorSummary[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-medium text-gray-600">Biggest Debtors</h2>
      {debtors.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No outstanding debtors right now.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="pb-2 font-medium">Customer</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium text-right">Days overdue</th>
              </tr>
            </thead>
            <tbody>
              {debtors.map((debtor) => (
                <tr key={debtor.clientEmail} className="border-t border-gray-100">
                  <td className="py-2 text-gray-800">{debtor.clientName}</td>
                  <td className="py-2 text-right font-medium text-gray-900">
                    {formatCents(debtor.amountOwed, debtor.currency)}
                  </td>
                  <td className="py-2 text-right text-gray-600">
                    {debtor.maxDaysOverdue > 0 ? debtor.maxDaysOverdue : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
