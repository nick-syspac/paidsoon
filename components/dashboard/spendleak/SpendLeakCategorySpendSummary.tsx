import Link from "next/link"
import type {
  SpendLeakCategorySpendSummaries,
  SpendLeakSpendSourceType,
  SpendLeakSpendSummaryBucket,
} from "@/lib/dashboard/spendleakPresentation"

function formatSource(sourceType: SpendLeakSpendSourceType): string {
  return sourceType === "bills" ? "Bills" : "Bank transactions"
}

function formatBucket(bucket: SpendLeakSpendSummaryBucket): string {
  if (bucket === "unclassified") return "Unclassified"
  if (bucket === "unconfirmed") return "Unconfirmed assignment"
  if (bucket === "unknown_direction") return "Direction unknown"
  return "Excluded from spend totals"
}

function formatCurrencyCents(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountCents / 100)
  } catch {
    return `${currency} ${(amountCents / 100).toFixed(2)}`
  }
}

function SourceRecordList({ recordIds }: { recordIds: string[] }) {
  return (
    <details className="text-xs text-gray-600">
      <summary className="cursor-pointer font-medium text-blue-700 hover:underline">
        {recordIds.length.toLocaleString()} source record{recordIds.length === 1 ? "" : "s"}
      </summary>
      <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto pl-4">
        {recordIds.map((recordId) => <li key={recordId} className="break-all">{recordId}</li>)}
      </ul>
    </details>
  )
}

export function SpendLeakCategorySpendSummary({
  summaries,
}: {
  summaries: SpendLeakCategorySpendSummaries
}) {
  return (
    <section aria-labelledby="category-spend-heading" className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <h2 id="category-spend-heading" className="text-base font-semibold text-gray-900">Imported spend by category</h2>
        <p className="mt-1 text-sm text-gray-600">
          Only confirmed assignments are grouped by category. Bills and bank transactions, and each currency, are shown separately. Explicitly linked refunds reduce a same-source subtotal; cross-source refunds are shown as separate credits.
        </p>
      </div>

      {summaries.confirmed.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Source</th>
                <th scope="col" className="py-2 pr-4">Currency</th>
                <th scope="col" className="py-2 pr-4">Net confirmed outflow</th>
                <th scope="col" className="py-2">Traceability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summaries.confirmed.map((summary) => (
                <tr key={`${summary.sourceType}:${summary.currency}:${summary.categoryId}`}>
                  <th scope="row" className="py-3 pr-4 font-medium text-gray-900">{summary.categoryName}</th>
                  <td className="py-3 pr-4 text-gray-700">{formatSource(summary.sourceType)}</td>
                  <td className="py-3 pr-4 text-gray-700">{summary.currency}</td>
                  <td className="py-3 pr-4 font-medium text-gray-900">
                    {formatCurrencyCents(summary.amountCents, summary.currency)} · {summary.recordCount.toLocaleString()} outflows
                    {summary.refundRecordCount > 0 ? <span className="block text-xs font-normal text-gray-600">Includes {summary.refundRecordCount.toLocaleString()} linked refund credit{summary.refundRecordCount === 1 ? "" : "s"}</span> : null}
                  </td>
                  <td className="py-3"><SourceRecordList recordIds={[...summary.sourceRecordIds, ...summary.refundRecordIds]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">No confirmed imported outflows are available yet.</p>
      )}

      {summaries.refundCredits.length > 0 ? (
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <h3 className="font-medium text-gray-900">Cross-source linked refund credits</h3>
          <p className="text-sm text-gray-600">These bank-transaction credits link to bills but do not reduce the separate bills subtotal.</p>
          <ul className="divide-y divide-gray-100">
            {summaries.refundCredits.map((credit) => (
              <li key={`${credit.sourceType}:${credit.currency}:${credit.categoryId}:${credit.originalSourceType}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{credit.categoryName} · {formatSource(credit.sourceType)} credit</p>
                  <p className="text-gray-600">Linked to {formatSource(credit.originalSourceType)} · {credit.currency}</p>
                  <SourceRecordList recordIds={[...credit.refundRecordIds, ...credit.originalSourceRecordIds]} />
                </div>
                <span className="font-medium text-gray-900">−{formatCurrencyCents(credit.amountCents, credit.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2 border-t border-gray-100 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-gray-900">Unclassified and unconfirmed amounts</h3>
          <Link href="/dashboard/spendleak/review" className="text-sm font-medium text-blue-700 hover:underline">
            Review imported spend
          </Link>
        </div>
        <p className="text-sm text-gray-600">
          Inflows are not counted as spend. Unknown-direction transactions and excluded or voided records are shown separately from unresolved outflows.
        </p>
        {summaries.unresolved.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {summaries.unresolved.map((summary) => (
              <li key={`${summary.sourceType}:${summary.currency}:${summary.bucket}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{formatBucket(summary.bucket)}</p>
                  <p className="text-gray-600">{formatSource(summary.sourceType)} · {summary.currency} · {summary.recordCount.toLocaleString()} records</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-medium text-gray-900">{formatCurrencyCents(summary.amountCents, summary.currency)}</span>
                  <SourceRecordList recordIds={summary.sourceRecordIds} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">No unclassified or unconfirmed imported outflows.</p>
        )}
      </div>
    </section>
  )
}
