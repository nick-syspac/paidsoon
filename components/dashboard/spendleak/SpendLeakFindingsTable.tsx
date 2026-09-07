import Link from "next/link"
import type { SpendInsight } from "@/lib/generated/prisma/client"
import {
  formatSpendLeakEvidenceSource,
  formatSpendLeakReviewAction,
  getSpendLeakEvidenceSource,
  moduleFromFindingType,
  type SpendLeakModuleId,
} from "@/lib/dashboard/spendleakPresentation"

interface SpendLeakFindingsTableProps {
  findings: SpendInsight[]
  selectedModule: SpendLeakModuleId | null
}

export function SpendLeakFindingsTable({ findings, selectedModule }: SpendLeakFindingsTableProps) {
  const filtered = selectedModule
    ? findings.filter((finding) => moduleFromFindingType(finding.findingType) === selectedModule)
    : findings

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        No findings match this filter yet.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-gray-600">Type</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">Summary</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">Severity</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">State</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">Review outcome</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">Source</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">Detected</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.map((finding) => (
            <tr key={finding.id}>
              <td className="whitespace-nowrap px-4 py-2 text-gray-700">{finding.findingType}</td>
              <td className="px-4 py-2 text-gray-700">
                <Link href={`/dashboard/spendleak/${finding.id}`} className="text-blue-700 hover:text-blue-800 hover:underline">
                  {finding.summary}
                </Link>
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-gray-700">{finding.severity}</td>
              <td className="whitespace-nowrap px-4 py-2 text-gray-700">{finding.state}</td>
              <td className="whitespace-nowrap px-4 py-2 text-gray-700">{formatSpendLeakReviewAction(finding.reviewAction)}</td>
              <td className="whitespace-nowrap px-4 py-2 text-gray-700">
                {formatSpendLeakEvidenceSource(getSpendLeakEvidenceSource(finding))}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-gray-700">
                {finding.detectedAt.toLocaleDateString("en-AU")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
