import { withUserContext } from "@/lib/db/withUserContext"
import type { SpendInsight } from "@/lib/generated/prisma/client"
import { moduleFromFindingType, type SpendLeakModuleId } from "@/lib/dashboard/spendleakPresentation"

const MODULE_IDS: ReadonlySet<SpendLeakModuleId> = new Set([
  "recurring_spend",
  "duplicate_spend",
  "renewals",
  "supplier_concentration",
  "cash_pressure",
])

export interface SpendLeakExportQueryParams {
  userId: string
  module?: SpendLeakModuleId | null
}

export function parseSpendLeakExportModule(value: string | null | undefined): SpendLeakModuleId | null {
  if (!value) return null
  return MODULE_IDS.has(value as SpendLeakModuleId) ? (value as SpendLeakModuleId) : null
}

export function applySpendLeakExportFilters(
  findings: SpendInsight[],
  params: Pick<SpendLeakExportQueryParams, "module">,
): SpendInsight[] {
  if (!params.module) return findings
  return findings.filter((finding) => moduleFromFindingType(finding.findingType) === params.module)
}

export async function loadSpendLeakFindingsForExport(
  params: SpendLeakExportQueryParams,
): Promise<SpendInsight[]> {
  return withUserContext(params.userId, async (tx) => {
    const findings = await tx.spendInsight.findMany({
      where: { userId: params.userId },
      orderBy: { detectedAt: "desc" },
    })

    return applySpendLeakExportFilters(findings, params)
  })
}
