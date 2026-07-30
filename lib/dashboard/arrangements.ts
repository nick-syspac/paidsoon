import type { Arrangement, ArrangementInvoiceCoverage } from "@/lib/generated/prisma/client"

export type ArrangementWithCoverage = Arrangement & {
  coverages: Pick<ArrangementInvoiceCoverage, "trackedInvoiceId">[]
}

export type ArrangementCoverageWithArrangement = ArrangementInvoiceCoverage & {
  arrangement: ArrangementWithCoverage
}

export function deriveArrangementStatus(
  coverages: ArrangementCoverageWithArrangement[]
): { type: "active" | "broken" | "fulfilled"; arrangement: ArrangementWithCoverage } | null {
  const arrangements = coverages.map((coverage) => coverage.arrangement)
  const active = arrangements.find((arrangement) => arrangement.status === "active")
  if (active) return { type: "active", arrangement: active }

  const broken = arrangements.find((arrangement) => arrangement.status === "broken")
  if (broken) return { type: "broken", arrangement: broken }

  const fulfilled = arrangements.find((arrangement) => arrangement.status === "fulfilled")
  if (fulfilled) return { type: "fulfilled", arrangement: fulfilled }

  return null
}

export function arrangementScopeLabel(arrangement: ArrangementWithCoverage): string {
  return arrangement.coverages.length > 1
    ? `Multi-invoice (${arrangement.coverages.length})`
    : "Single invoice"
}

export function arrangementTypeLabel(type: string): string {
  if (type === "full_payment") return "Full payment"
  if (type === "partial_payment") return "Partial payment"
  if (type === "instalment_plan") return "Instalment plan"
  return type
}

export function isArrangementHighPriority(status: {
  type: "active" | "broken" | "fulfilled"
} | null): boolean {
  return status?.type === "broken"
}
