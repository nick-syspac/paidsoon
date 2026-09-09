import { prismaAdmin } from "@/lib/db/admin"
import type { Prisma } from "@/lib/generated/prisma/client"

interface OpportunityContext {
  targetGrossMarginPercent: number
  currentGrossMarginPercent: number | null
  revenueCents: number
  directCostCents: number
  completenessPercent: number
  unclassifiedCount: number
  openAlertCount: number
  spendLeakOpenFindingCount: number
  spendLeakEstimatedMonthlyCents: number
  costGuardVarianceCents: number
  commitmentDue30DaysCents: number
  cashPlanBufferGapCents: number
}

interface OpportunityCandidate {
  opportunityType: "pricing" | "cost_reduction" | "classification" | "customer_mix" | "service_mix"
  severity: "info" | "warning" | "critical"
  title: string
  description: string
  estimatedMonthlyCents: number | null
  estimatedAnnualCents: number | null
  confidence: "high" | "medium" | "low" | "insufficient_data"
  evidence: Record<string, unknown>
}

function annualize(monthlyCents: number | null): number | null {
  if (monthlyCents === null) return null
  return monthlyCents * 12
}

export function evaluateOpportunityCandidates(input: OpportunityContext): OpportunityCandidate[] {
  const opportunities: OpportunityCandidate[] = []

  if (input.currentGrossMarginPercent !== null && input.currentGrossMarginPercent < input.targetGrossMarginPercent) {
    const marginGap = input.targetGrossMarginPercent - input.currentGrossMarginPercent
    const monthlyImpact = Math.max(0, Math.round((marginGap / 100) * input.revenueCents))

    opportunities.push({
      opportunityType: "pricing",
      severity: marginGap >= 8 ? "critical" : "warning",
      title: "Reprice low-margin work",
      description: `Gross margin is ${input.currentGrossMarginPercent.toFixed(1)}%, below target ${input.targetGrossMarginPercent.toFixed(1)}%.`,
      estimatedMonthlyCents: monthlyImpact,
      estimatedAnnualCents: annualize(monthlyImpact),
      confidence: input.completenessPercent >= 85 ? "high" : "medium",
      evidence: {
        currentGrossMarginPercent: input.currentGrossMarginPercent,
        targetGrossMarginPercent: input.targetGrossMarginPercent,
        marginGap,
      },
    })
  }

  if (input.revenueCents > 0) {
    const directCostRatio = (input.directCostCents / input.revenueCents) * 100
    if (directCostRatio > 70) {
      const reductionTarget = Math.round(input.directCostCents * 0.05)
      opportunities.push({
        opportunityType: "cost_reduction",
        severity: directCostRatio >= 85 ? "critical" : "warning",
        title: "Reduce direct cost intensity",
        description: `Direct costs are ${directCostRatio.toFixed(1)}% of revenue. Negotiate supplier rates or reduce delivery inputs.`,
        estimatedMonthlyCents: reductionTarget,
        estimatedAnnualCents: annualize(reductionTarget),
        confidence: input.completenessPercent >= 80 ? "high" : "medium",
        evidence: {
          directCostRatio,
          directCostCents: input.directCostCents,
          revenueCents: input.revenueCents,
        },
      })
    }
  }

  if (input.unclassifiedCount > 0) {
    opportunities.push({
      opportunityType: "classification",
      severity: input.unclassifiedCount >= 25 ? "critical" : "info",
      title: "Classify uncategorized costs",
      description: `${input.unclassifiedCount} cost records are unclassified, reducing confidence in margin decisions.`,
      estimatedMonthlyCents: null,
      estimatedAnnualCents: null,
      confidence: "medium",
      evidence: {
        unclassifiedCount: input.unclassifiedCount,
      },
    })
  }

  const hasCommitmentOrLiquidityPressure = input.commitmentDue30DaysCents > 0 || input.cashPlanBufferGapCents > 0

  if (input.openAlertCount >= 3 || hasCommitmentOrLiquidityPressure) {
    const severity: OpportunityCandidate["severity"] =
      input.openAlertCount >= 6 || input.cashPlanBufferGapCents >= 50_000
        ? "critical"
        : "warning"

    const contextPhrases: string[] = []
    if (input.openAlertCount >= 3) {
      contextPhrases.push(`${input.openAlertCount} open margin alerts`) 
    }
    if (input.commitmentDue30DaysCents > 0) {
      contextPhrases.push(`$${(input.commitmentDue30DaysCents / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })} in next-30-day commitments`)
    }
    if (input.cashPlanBufferGapCents > 0) {
      contextPhrases.push(`cash-plan buffer gap of $${(input.cashPlanBufferGapCents / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`)
    }

    opportunities.push({
      opportunityType: "customer_mix",
      severity,
      title: "Prioritize high-risk customer margin review",
      description: `${contextPhrases.join(", ")} suggest customer mix or contract terms need intervention.`,
      estimatedMonthlyCents: null,
      estimatedAnnualCents: null,
      confidence: input.completenessPercent >= 75 ? "medium" : "low",
      evidence: {
        openAlertCount: input.openAlertCount,
        commitmentDue30DaysCents: input.commitmentDue30DaysCents,
        cashPlanBufferGapCents: input.cashPlanBufferGapCents,
        handoff: {
          commitGuardPath: "/dashboard/commitguard",
          cashPlanPath: "/dashboard/settings/cash-plan",
        },
        commitmentsAreNotRealizedCosts: true,
        taxReserveExcludedFromOperatingMargin: true,
      },
    })
  }

  const crossModuleCostPressureCents = Math.max(0, input.spendLeakEstimatedMonthlyCents) + Math.max(0, input.costGuardVarianceCents)
  if (crossModuleCostPressureCents > 0 || input.spendLeakOpenFindingCount > 0) {
    opportunities.push({
      opportunityType: "service_mix",
      severity: crossModuleCostPressureCents >= 100_000 ? "critical" : "warning",
      title: "Coordinate spend controls across low-margin services",
      description: input.spendLeakOpenFindingCount > 0
        ? `SpendLeak reports ${input.spendLeakOpenFindingCount} open finding${input.spendLeakOpenFindingCount === 1 ? "" : "s"}; combine supplier/category actions with Cost Guard drift controls.`
        : "Cost Guard variance indicates spend drift; coordinate supplier/category actions to protect service margins.",
      estimatedMonthlyCents: crossModuleCostPressureCents > 0 ? crossModuleCostPressureCents : null,
      estimatedAnnualCents: crossModuleCostPressureCents > 0 ? annualize(crossModuleCostPressureCents) : null,
      confidence: input.completenessPercent >= 80 ? "high" : "medium",
      evidence: {
        spendLeakOpenFindingCount: input.spendLeakOpenFindingCount,
        spendLeakEstimatedMonthlyCents: input.spendLeakEstimatedMonthlyCents,
        costGuardVarianceCents: input.costGuardVarianceCents,
        sourceModules: ["spendleak", "cost_guard"],
      },
    })
  }

  return opportunities
}

export async function runMarginOpportunitySweep(options?: { limitUsers?: number }) {
  const startedAt = new Date()
  const settings = await prismaAdmin.marginGuardSetting.findMany({
    where: { enabled: true },
    take: options?.limitUsers,
    select: {
      userId: true,
      targetGrossMarginPercent: true,
    },
  })

  let createdOrUpdated = 0
  let resolved = 0
  let failed = 0

  for (const setting of settings) {
    try {
      const [latestSnapshot, unclassifiedCount, openAlertCount, spendLeakSignals, latestCostGuardForecast, commitmentDueSoon, latestCashPlanSnapshot, activeOpportunities] = await Promise.all([
        prismaAdmin.marginSnapshot.findFirst({
          where: { userId: setting.userId },
          orderBy: [{ periodEnd: "desc" }, { calculatedAt: "desc" }],
          select: {
            grossMarginPercent: true,
            revenueCents: true,
            directCostCents: true,
            completenessPercent: true,
          },
        }),
        prismaAdmin.marginCostClassification.count({
          where: {
            userId: setting.userId,
            classification: "UNCLASSIFIED",
          },
        }),
        prismaAdmin.marginAlert.count({
          where: {
            userId: setting.userId,
            status: { in: ["open", "acknowledged"] },
          },
        }),
        prismaAdmin.spendInsight.aggregate({
          where: {
            userId: setting.userId,
            state: "open",
          },
          _count: { id: true },
          _sum: { estimatedMonthlyCents: true },
        }),
        prismaAdmin.costGuardForecast.findFirst({
          where: { userId: setting.userId },
          orderBy: { forecastMonth: "desc" },
          select: {
            varianceAmountCents: true,
          },
        }),
        prismaAdmin.commitment.aggregate({
          where: {
            userId: setting.userId,
            status: { in: ["active", "upcoming"] },
            nextDueDate: {
              lte: new Date(startedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
            },
          },
          _sum: {
            amountCents: true,
          },
        }),
        prismaAdmin.cashPlanSnapshot.findFirst({
          where: {
            plan: { userId: setting.userId },
          },
          orderBy: { createdAt: "desc" },
          select: {
            bufferGapCents: true,
          },
        }),
        prismaAdmin.marginOpportunity.findMany({
          where: {
            userId: setting.userId,
            scopeType: "organization",
            scopeKey: null,
            status: "open",
          },
          select: {
            id: true,
            opportunityType: true,
          },
        }),
      ])

      if (!latestSnapshot) continue

      const candidates = evaluateOpportunityCandidates({
        targetGrossMarginPercent: setting.targetGrossMarginPercent,
        currentGrossMarginPercent: latestSnapshot.grossMarginPercent,
        revenueCents: latestSnapshot.revenueCents,
        directCostCents: latestSnapshot.directCostCents,
        completenessPercent: latestSnapshot.completenessPercent,
        unclassifiedCount,
        openAlertCount,
        spendLeakOpenFindingCount: spendLeakSignals._count.id,
        spendLeakEstimatedMonthlyCents: spendLeakSignals._sum.estimatedMonthlyCents ?? 0,
        costGuardVarianceCents: latestCostGuardForecast?.varianceAmountCents ?? 0,
        commitmentDue30DaysCents: commitmentDueSoon._sum.amountCents ?? 0,
        cashPlanBufferGapCents: latestCashPlanSnapshot?.bufferGapCents ?? 0,
      })

      const activeByType = new Map(activeOpportunities.map((row) => [row.opportunityType, row]))
      const candidateTypes = new Set(candidates.map((candidate) => candidate.opportunityType))

      for (const candidate of candidates) {
        const existing = activeByType.get(candidate.opportunityType)
        if (existing) {
          await prismaAdmin.marginOpportunity.update({
            where: { id: existing.id },
            data: {
              severity: candidate.severity,
              title: candidate.title,
              description: candidate.description,
              evidence: candidate.evidence as Prisma.InputJsonValue,
              estimatedMonthlyCents: candidate.estimatedMonthlyCents,
              estimatedAnnualCents: candidate.estimatedAnnualCents,
              confidence: candidate.confidence,
              detectedAt: startedAt,
            },
          })
        } else {
          await prismaAdmin.marginOpportunity.create({
            data: {
              userId: setting.userId,
              opportunityType: candidate.opportunityType,
              scopeType: "organization",
              scopeKey: null,
              severity: candidate.severity,
              status: "open",
              title: candidate.title,
              description: candidate.description,
              evidence: candidate.evidence as Prisma.InputJsonValue,
              estimatedMonthlyCents: candidate.estimatedMonthlyCents,
              estimatedAnnualCents: candidate.estimatedAnnualCents,
              confidence: candidate.confidence,
              detectedAt: startedAt,
            },
          })
        }
        createdOrUpdated += 1
      }

      for (const active of activeOpportunities) {
        if (!candidateTypes.has(active.opportunityType as OpportunityCandidate["opportunityType"])) {
          await prismaAdmin.marginOpportunity.update({
            where: { id: active.id },
            data: {
              status: "resolved",
              resolvedAt: startedAt,
            },
          })
          resolved += 1
        }
      }
    } catch (error) {
      failed += 1
      console.error("[MarginGuard Opportunity Sweep] Failed for user", setting.userId, error)
    }
  }

  return {
    startedAt: startedAt.toISOString(),
    processedUsers: settings.length,
    createdOrUpdated,
    resolved,
    failed,
  }
}
