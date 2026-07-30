import type { AiSummaryLine } from "@/lib/dashboard/aiSummary"

export function AiSummaryCard({ lines }: { lines: AiSummaryLine[] }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-blue-700">AI Summary</h2>
      <div className="mt-2 space-y-2 text-sm text-gray-800">
        {lines.map((line, index) => (
          <p key={line.id} className={index === 0 ? "font-semibold text-gray-900" : undefined}>
            {line.text}
          </p>
        ))}
      </div>
    </div>
  )
}
