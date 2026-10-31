import { withUserContext } from "@/lib/db/withUserContext"
import type { SpendInsight } from "@/lib/generated/prisma/client"
import { moduleFromFindingType, type SpendLeakModuleId } from "@/lib/dashboard/spendleakPresentation"
import { filterCurrentSpendFindings } from "@/lib/spendleak/persist"

const MODULE_IDS: ReadonlySet<SpendLeakModuleId> = new Set([
  "recurring_spend",
  "duplicate_spend",
  "renewals",
  "supplier_concentration",
  "cash_pressure",
])

export interface SpendLeakAccountDisplayPolicy {
  accountDisplayRevision: number
  accountDisplayFromDate: Date | null
  accountDisplayTimeZone: string | null
}

export interface SpendLeakExportQueryParams {
  userId: string
  module?: SpendLeakModuleId | null
  cutoffDate?: Date | null
  accountDisplayPolicy?: SpendLeakAccountDisplayPolicy | null
}

function parseEvidenceDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === "string") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function collectEvidenceDates(value: unknown, seen = new Set<string>()): Date[] {
  if (value === null || value === undefined) return []

  if (value instanceof Date) {
    const key = value.toISOString()
    if (!seen.has(key)) {
      seen.add(key)
      return [value]
    }
    return []
  }

  if (typeof value === "string") {
    const parsed = parseEvidenceDate(value)
    return parsed ? [parsed] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectEvidenceDates(item, seen))
  }

  if (typeof value === "object") {
    const dates: Date[] = []
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if ([
        "firstObservedDate",
        "latestObservedDate",
        "observedDate",
        "transactionDate",
        "dueDate",
        "paidDate",
        "date",
        "occurredAt",
        "issuedAt",
      ].includes(key)) {
        const parsed = parseEvidenceDate(nested)
        if (parsed) dates.push(parsed)
      }
      dates.push(...collectEvidenceDates(nested, seen))
    }
    return dates
  }

  return []
}

export function parseSpendLeakExportModule(value: string | null | undefined): SpendLeakModuleId | null {
  if (!value) return null
  return MODULE_IDS.has(value as SpendLeakModuleId) ? (value as SpendLeakModuleId) : null
}

export function applySpendLeakExportFilters(
  findings: SpendInsight[],
  params: Pick<SpendLeakExportQueryParams, "module" | "cutoffDate" | "accountDisplayPolicy">,
): SpendInsight[] {
  const filteredByModule = !params.module
    ? findings
    : findings.filter((finding) => moduleFromFindingType(finding.findingType) === params.module)

  const policy = params.accountDisplayPolicy ?? {
    accountDisplayRevision: 0,
    accountDisplayFromDate: params.cutoffDate ?? null,
    accountDisplayTimeZone: "Australia/Melbourne",
  }

  const filteredByPolicy = filterCurrentSpendFindings(
    filteredByModule as Array<{ accountDisplayRevision?: number | null; accountDisplayFromDate?: Date | null; accountDisplayTimeZone?: string | null }>,
    policy,
  )

  if (!params.cutoffDate) return filteredByPolicy as SpendInsight[]

  return (filteredByPolicy as SpendInsight[]).filter((finding) => {
    const evidenceDates = collectEvidenceDates(finding.evidence)
    return evidenceDates.some((date) => date >= params.cutoffDate!)
  })
}

export async function loadSpendLeakFindingsForExport(
  params: SpendLeakExportQueryParams,
): Promise<SpendInsight[]> {
  return withUserContext(params.userId, async (tx) => {
    const profile = await tx.userProfile.findUnique({
      where: { userId: params.userId },
      select: {
        accountDisplayFromDate: true,
        accountDisplayRevision: true,
        accountDisplayTimeZone: true,
      },
    })

    const findings = await tx.spendInsight.findMany({
      where: { userId: params.userId },
      orderBy: { detectedAt: "desc" },
    })

    const resolvedCutoffDate = params.cutoffDate ?? profile?.accountDisplayFromDate ?? null
    const resolvedPolicy = {
      accountDisplayRevision: params.accountDisplayPolicy?.accountDisplayRevision ?? profile?.accountDisplayRevision ?? 0,
      accountDisplayFromDate: resolvedCutoffDate,
      accountDisplayTimeZone: params.accountDisplayPolicy?.accountDisplayTimeZone ?? profile?.accountDisplayTimeZone ?? "Australia/Melbourne",
    }

    return applySpendLeakExportFilters(findings, {
      ...params,
      cutoffDate: resolvedCutoffDate,
      accountDisplayPolicy: resolvedPolicy,
    })
  })
}
