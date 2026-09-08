import { prismaAdmin } from "@/lib/db/admin"
import type { Prisma } from "@/lib/generated/prisma/client"

interface MarginSnapshotLike {
  id: string
  userId: string
  periodGranularity: string
  periodStart: Date
  periodEnd: Date
  revenueCents: number
  directCostCents: number
  grossMarginPercent: number | null
  completenessPercent: number
}

interface MarginSettingLike {
  userId: string
  targetGrossMarginPercent: number
  warningGrossMarginPercent: number
  criticalGrossMarginPercent: number
  minCompletenessPercent: number
  alertBelowWarning: boolean
  alertBelowCritical: boolean
  alertDeterioration: boolean
  alertNegativeMargin: boolean
  alertCustomerMarginWarning: boolean
  alertCostIncrease: boolean
  alertDataQualityWarning: boolean
}

interface AlertCandidate {
  alertType: string
  severity: "warning" | "critical"
  title: string
  message: string
  estimatedImpactCents: number | null
  evidence: Record<string, unknown>
}

function safePercent(value: number | null): number {
  return value ?? 0
}

function directCostRatio(snapshot: MarginSnapshotLike): number | null {
  if (snapshot.revenueCents <= 0) return null
  return (snapshot.directCostCents / snapshot.revenueCents) * 100
}

export function evaluateMarginAlertCandidates(
  setting: MarginSettingLike,
  current: MarginSnapshotLike,
  previous: MarginSnapshotLike | null,
): AlertCandidate[] {
  const candidates: AlertCandidate[] = []
  const margin = safePercent(current.grossMarginPercent)

  if (setting.alertBelowCritical && current.grossMarginPercent !== null && margin < setting.criticalGrossMarginPercent) {
    candidates.push({
      alertType: "margin.below_critical",
      severity: "critical",
      title: "Gross margin below critical threshold",
      message: `Gross margin ${margin.toFixed(1)}% is below critical threshold ${setting.criticalGrossMarginPercent.toFixed(1)}%.`,
      estimatedImpactCents: Math.max(0, Math.round((setting.criticalGrossMarginPercent - margin) / 100 * current.revenueCents)),
      evidence: { margin, threshold: setting.criticalGrossMarginPercent },
    })
  }

  if (setting.alertBelowWarning && current.grossMarginPercent !== null && margin < setting.warningGrossMarginPercent) {
    candidates.push({
      alertType: "margin.below_warning",
      severity: "warning",
      title: "Gross margin below warning threshold",
      message: `Gross margin ${margin.toFixed(1)}% is below warning threshold ${setting.warningGrossMarginPercent.toFixed(1)}%.`,
      estimatedImpactCents: Math.max(0, Math.round((setting.warningGrossMarginPercent - margin) / 100 * current.revenueCents)),
      evidence: { margin, threshold: setting.warningGrossMarginPercent },
    })
  }

  if (setting.alertNegativeMargin && current.grossMarginPercent !== null && margin < 0) {
    candidates.push({
      alertType: "margin.negative",
      severity: "critical",
      title: "Negative gross margin detected",
      message: `Gross margin is ${margin.toFixed(1)}%, indicating direct costs currently exceed revenue.`,
      estimatedImpactCents: Math.abs(current.revenueCents - current.directCostCents),
      evidence: { margin },
    })
  }

  if (setting.alertDataQualityWarning && current.completenessPercent < setting.minCompletenessPercent) {
    candidates.push({
      alertType: "data.quality",
      severity: "warning",
      title: "Margin data quality below configured minimum",
      message: `Data completeness ${current.completenessPercent.toFixed(1)}% is below target ${setting.minCompletenessPercent.toFixed(1)}%.`,
      estimatedImpactCents: null,
      evidence: { completenessPercent: current.completenessPercent, minimum: setting.minCompletenessPercent },
    })
  }

  if (previous && setting.alertDeterioration) {
    const previousMargin = safePercent(previous.grossMarginPercent)
    const delta = margin - previousMargin
    if (current.grossMarginPercent !== null && previous.grossMarginPercent !== null && delta <= -3) {
      candidates.push({
        alertType: "margin.deterioration",
        severity: delta <= -8 ? "critical" : "warning",
        title: "Gross margin deteriorating",
        message: `Gross margin moved ${delta.toFixed(1)} points versus prior ${current.periodGranularity} period.`,
        estimatedImpactCents: null,
        evidence: { delta, currentMargin: margin, previousMargin },
      })
    }
  }

  if (previous && setting.alertCostIncrease) {
    const currentCostRatio = directCostRatio(current)
    const previousCostRatio = directCostRatio(previous)
    if (currentCostRatio !== null && previousCostRatio !== null) {
      const deltaRatio = currentCostRatio - previousCostRatio
      if (deltaRatio >= 4) {
        candidates.push({
          alertType: "cost.increase",
          severity: deltaRatio >= 8 ? "critical" : "warning",
          title: "Direct cost ratio increased",
          message: `Direct cost ratio increased by ${deltaRatio.toFixed(1)} points versus previous period.`,
          estimatedImpactCents: null,
          evidence: { currentCostRatio, previousCostRatio, deltaRatio },
        })
      }
    }
  }

  if (setting.alertCustomerMarginWarning && current.grossMarginPercent !== null && margin < setting.targetGrossMarginPercent) {
    candidates.push({
      alertType: "customer.margin_warning",
      severity: "warning",
      title: "Customers likely below target margin",
      message: `Current margin ${margin.toFixed(1)}% is below target ${setting.targetGrossMarginPercent.toFixed(1)}%; review low-margin customer cohorts.`,
      estimatedImpactCents: null,
      evidence: { margin, target: setting.targetGrossMarginPercent },
    })
  }

  return candidates
}

export async function runMarginAlertSweep(options?: { limitUsers?: number }) {
  const startedAt = new Date()
  const settings = await prismaAdmin.marginGuardSetting.findMany({
    where: { enabled: true },
    take: options?.limitUsers,
    select: {
      userId: true,
      targetGrossMarginPercent: true,
      warningGrossMarginPercent: true,
      criticalGrossMarginPercent: true,
      minCompletenessPercent: true,
      alertBelowWarning: true,
      alertBelowCritical: true,
      alertDeterioration: true,
      alertNegativeMargin: true,
      alertCustomerMarginWarning: true,
      alertCostIncrease: true,
      alertDataQualityWarning: true,
    },
  })

  let createdOrUpdated = 0
  let resolved = 0
  let failed = 0

  for (const setting of settings) {
    try {
      const current = await prismaAdmin.marginSnapshot.findFirst({
        where: { userId: setting.userId },
        orderBy: [{ periodEnd: "desc" }, { calculatedAt: "desc" }],
        select: {
          id: true,
          userId: true,
          periodGranularity: true,
          periodStart: true,
          periodEnd: true,
          revenueCents: true,
          directCostCents: true,
          grossMarginPercent: true,
          completenessPercent: true,
        },
      })

      if (!current) continue

      const previous = await prismaAdmin.marginSnapshot.findFirst({
        where: {
          userId: setting.userId,
          periodGranularity: current.periodGranularity,
          periodEnd: { lt: current.periodStart },
        },
        orderBy: [{ periodEnd: "desc" }, { calculatedAt: "desc" }],
        select: {
          id: true,
          userId: true,
          periodGranularity: true,
          periodStart: true,
          periodEnd: true,
          revenueCents: true,
          directCostCents: true,
          grossMarginPercent: true,
          completenessPercent: true,
        },
      })

      const candidates = evaluateMarginAlertCandidates(setting, current, previous)
      const activeAlerts = await prismaAdmin.marginAlert.findMany({
        where: {
          userId: setting.userId,
          scopeType: "organization",
          alertType: {
            in: [
              "margin.below_critical",
              "margin.below_warning",
              "margin.negative",
              "margin.deterioration",
              "cost.increase",
              "data.quality",
              "customer.margin_warning",
            ],
          },
          status: { in: ["open", "acknowledged"] },
        },
        select: {
          id: true,
          alertType: true,
          status: true,
        },
      })

      const byType = new Map(activeAlerts.map((row) => [row.alertType, row]))
      const triggeredTypes = new Set(candidates.map((candidate) => candidate.alertType))

      for (const candidate of candidates) {
        const existing = byType.get(candidate.alertType)

        if (existing) {
          await prismaAdmin.marginAlert.update({
            where: { id: existing.id },
            data: {
              severity: candidate.severity,
              title: candidate.title,
              message: candidate.message,
              evidence: candidate.evidence as Prisma.InputJsonValue,
              estimatedImpactCents: candidate.estimatedImpactCents,
              confidence: current.completenessPercent >= setting.minCompletenessPercent ? "high" : "medium",
              detectedAt: startedAt,
              status: "open",
            },
          })

          await prismaAdmin.marginAlertEvent.create({
            data: {
              userId: setting.userId,
              marginAlertId: existing.id,
              eventType: existing.status === "acknowledged" ? "MARGIN_ALERT_REOPENED" : "MARGIN_ALERT_UPDATED",
              oldStatus: existing.status,
              newStatus: "open",
              metadata: {
                snapshotId: current.id,
                alertType: candidate.alertType,
              },
            },
          })
        } else {
          const created = await prismaAdmin.marginAlert.create({
            data: {
              userId: setting.userId,
              marginSnapshotId: current.id,
              alertType: candidate.alertType,
              scopeType: "organization",
              scopeKey: null,
              severity: candidate.severity,
              status: "open",
              title: candidate.title,
              message: candidate.message,
              evidence: candidate.evidence as Prisma.InputJsonValue,
              estimatedImpactCents: candidate.estimatedImpactCents,
              confidence: current.completenessPercent >= setting.minCompletenessPercent ? "high" : "medium",
              detectedAt: startedAt,
            },
            select: { id: true },
          })

          await prismaAdmin.marginAlertEvent.create({
            data: {
              userId: setting.userId,
              marginAlertId: created.id,
              eventType: "MARGIN_ALERT_CREATED",
              metadata: {
                snapshotId: current.id,
                alertType: candidate.alertType,
              },
            },
          })
        }

        createdOrUpdated += 1
      }

      for (const active of activeAlerts) {
        if (!triggeredTypes.has(active.alertType)) {
          await prismaAdmin.marginAlert.update({
            where: { id: active.id },
            data: {
              status: "resolved",
              resolvedAt: startedAt,
            },
          })
          await prismaAdmin.marginAlertEvent.create({
            data: {
              userId: setting.userId,
              marginAlertId: active.id,
              eventType: "MARGIN_ALERT_RESOLVED",
              oldStatus: active.status,
              newStatus: "resolved",
              metadata: {
                snapshotId: current.id,
                reason: "Condition no longer met",
              },
            },
          })
          resolved += 1
        }
      }
    } catch (error) {
      failed += 1
      console.error("[MarginGuard Alert Sweep] Failed for user", setting.userId, error)
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
