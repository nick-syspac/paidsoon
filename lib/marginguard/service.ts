import { withUserContext } from "@/lib/db/withUserContext"
import type { Prisma } from "@/lib/generated/prisma/client"
import type { MarginClassificationRuleModel } from "@/lib/generated/prisma/models/MarginClassificationRule"

import {
  calculateContributionMargin,
  calculateDataCompleteness,
  calculateGrossMargin,
  calculateMarginImpact,
  calculateMarginVariance,
  calculateRequiredPrice,
  determineMarginStatus,
  type MarginStatus,
} from "@/lib/marginguard/engine"
import {
  buildMarginClassificationAuditEvent,
  normalizeMarginCostClass,
  resolveMarginClassification,
  type MarginClassificationRuleSnapshot,
  type MarginCostClass,
} from "@/lib/marginguard/classification"

export type MarginPeriodPreset = "30d" | "3m" | "6m" | "12m" | "fy"
export type MarginAlertState = "open" | "acknowledged" | "resolved" | "dismissed"
export type MarginTrendComparisonMode = "none" | "previous_period"

const DEFAULT_PERIOD: MarginPeriodPreset = "30d"

function nowUtc(): Date {
  return new Date()
}

function parsePeriodBounds(period: MarginPeriodPreset, now: Date = nowUtc()): { from: Date; to: Date } {
  const to = now
  const from = new Date(now)
  if (period === "30d") {
    from.setUTCDate(from.getUTCDate() - 30)
  } else if (period === "3m") {
    from.setUTCMonth(from.getUTCMonth() - 3)
  } else if (period === "6m") {
    from.setUTCMonth(from.getUTCMonth() - 6)
  } else if (period === "12m") {
    from.setUTCMonth(from.getUTCMonth() - 12)
  } else {
    const month = from.getUTCMonth()
    const year = from.getUTCFullYear()
    const fyYear = month >= 6 ? year : year - 1
    from.setUTCFullYear(fyYear, 6, 1)
    from.setUTCHours(0, 0, 0, 0)
  }
  return { from, to }
}

function asPercent(value: number | null): number | null {
  if (value === null || Number.isNaN(value) || !Number.isFinite(value)) return null
  return Math.round(value * 100) / 100
}

function sumIntegers(values: number[]): number {
  return values.reduce((total, value) => total + Math.round(value), 0)
}

export async function getOrCreateMarginSettings(userId: string) {
  return withUserContext(userId, (tx) =>
    tx.marginGuardSetting.upsert({
      where: { userId },
      update: {},
      create: { userId },
    }),
  )
}

export async function updateMarginSettings(
  userId: string,
  payload: {
    enabled?: boolean
    defaultPeriod?: MarginPeriodPreset
    targetGrossMarginPercent?: number
    warningGrossMarginPercent?: number
    criticalGrossMarginPercent?: number
    minCompletenessPercent?: number
    alertBelowWarning?: boolean
    alertBelowCritical?: boolean
    alertDeterioration?: boolean
    alertNegativeMargin?: boolean
    alertCustomerMarginWarning?: boolean
    alertCostIncrease?: boolean
    alertDataQualityWarning?: boolean
    alertDigestMode?: "daily" | "weekly" | "monthly"
  },
) {
  return withUserContext(userId, (tx) =>
    tx.marginGuardSetting.upsert({
      where: { userId },
      update: payload,
      create: {
        userId,
        ...payload,
      },
    }),
  )
}

export async function listMarginTargets(userId: string) {
  return withUserContext(userId, (tx) =>
    tx.marginGuardTarget.findMany({
      where: { userId, isActive: true },
      orderBy: [{ scopeType: "asc" }, { scopeKey: "asc" }],
    }),
  )
}

export async function upsertMarginTarget(
  userId: string,
  input: {
    scopeType: "organization" | "customer" | "product_service" | "category" | "project_job"
    scopeKey?: string | null
    targetGrossMarginPercent: number
    warningGrossMarginPercent?: number | null
    criticalGrossMarginPercent?: number | null
    isActive?: boolean
    actorId: string
  },
) {
  return withUserContext(userId, async (tx) => {
    const existing = await tx.marginGuardTarget.findFirst({
      where: {
        userId,
        scopeType: input.scopeType,
        scopeKey: input.scopeKey ?? null,
      },
      select: { id: true },
    })

    if (existing) {
      return tx.marginGuardTarget.update({
        where: { id: existing.id },
        data: {
          targetGrossMarginPercent: input.targetGrossMarginPercent,
          warningGrossMarginPercent: input.warningGrossMarginPercent ?? null,
          criticalGrossMarginPercent: input.criticalGrossMarginPercent ?? null,
          isActive: input.isActive ?? true,
          updatedBy: input.actorId,
        },
      })
    }

    return tx.marginGuardTarget.create({
      data: {
        userId,
        scopeType: input.scopeType,
        scopeKey: input.scopeKey ?? null,
        targetGrossMarginPercent: input.targetGrossMarginPercent,
        warningGrossMarginPercent: input.warningGrossMarginPercent ?? null,
        criticalGrossMarginPercent: input.criticalGrossMarginPercent ?? null,
        isActive: input.isActive ?? true,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
    })
  })
}

async function loadBaseMarginFacts(userId: string, period: MarginPeriodPreset) {
  const { from, to } = parsePeriodBounds(period)

  return withUserContext(userId, async (tx) => {
    const [invoices, importedBills, importedBankTransactions, classifications, alertsOpen, targets] = await Promise.all([
      tx.financialInvoice.findMany({
        where: {
          userId,
          dueDate: { gte: from, lte: to },
        },
        select: {
          id: true,
          contactId: true,
          sourceSystem: true,
          amountDueCents: true,
          dueDate: true,
          invoiceNumber: true,
        },
      }),
      tx.importedBill.findMany({
        where: {
          userId,
          dueDate: { gte: from, lte: to },
        },
        select: { id: true, amountCents: true, supplierName: true, expenseAccountName: true },
      }),
      tx.importedBankTransaction.findMany({
        where: {
          userId,
          transactionDate: { gte: from, lte: to },
        },
        select: { id: true, amountCents: true, counterpartyName: true, description: true, accountName: true },
      }),
      tx.marginCostClassification.findMany({
        where: { userId },
        select: {
          id: true,
          sourceType: true,
          sourceRecordId: true,
          classification: true,
          classificationOrigin: true,
          importedBillId: true,
          importedBankTransactionId: true,
          financialInvoiceId: true,
        },
      }),
      tx.marginAlert.count({ where: { userId, status: "open" } }),
      tx.marginGuardTarget.findMany({
        where: { userId, isActive: true },
        select: {
          scopeType: true,
          scopeKey: true,
          targetGrossMarginPercent: true,
          warningGrossMarginPercent: true,
          criticalGrossMarginPercent: true,
        },
      }),
    ])

    return {
      from,
      to,
      invoices,
      importedBills,
      importedBankTransactions,
      classifications,
      alertsOpen,
      targets,
    }
  })
}

function classifyCostTotals(input: {
  importedBills: Array<{ id: string; amountCents: number }>
  importedBankTransactions: Array<{ id: string; amountCents: number }>
  classifications: Array<{
    sourceType: string
    sourceRecordId: string
    classification: string
    importedBillId: string | null
    importedBankTransactionId: string | null
  }>
}): {
  directCostCents: number
  variableCostCents: number
  classifiedCount: number
  totalCostRecordCount: number
} {
  const byBill = new Map(input.importedBills.map((row) => [row.id, row]))
  const byTxn = new Map(input.importedBankTransactions.map((row) => [row.id, row]))
  let directCostCents = 0
  let variableCostCents = 0
  let classifiedCount = 0

  for (const c of input.classifications) {
    const normalizedClass = normalizeMarginCostClass(c.classification)
    const billAmount = c.importedBillId ? byBill.get(c.importedBillId)?.amountCents : undefined
    const txnAmount = c.importedBankTransactionId ? byTxn.get(c.importedBankTransactionId)?.amountCents : undefined
    const sourceAmount = Math.abs(Math.round((billAmount ?? txnAmount ?? 0)))

    if (normalizedClass !== "UNCLASSIFIED") {
      classifiedCount += 1
    }
    if (normalizedClass === "DIRECT_COST") {
      directCostCents += sourceAmount
    }
    if (normalizedClass === "VARIABLE_COST") {
      variableCostCents += sourceAmount
    }
  }

  return {
    directCostCents,
    variableCostCents,
    classifiedCount,
    totalCostRecordCount: input.importedBills.length + input.importedBankTransactions.length,
  }
}

export async function getMarginSummary(userId: string, requestedPeriod?: string) {
  const settings = await getOrCreateMarginSettings(userId)
  const period: MarginPeriodPreset =
    requestedPeriod === "30d" || requestedPeriod === "3m" || requestedPeriod === "6m" || requestedPeriod === "12m" || requestedPeriod === "fy"
      ? requestedPeriod
      : ((settings.defaultPeriod as MarginPeriodPreset) ?? DEFAULT_PERIOD)

  const facts = await loadBaseMarginFacts(userId, period)

  const revenueCents = sumIntegers(facts.invoices.map((row) => row.amountDueCents))
  const costTotals = classifyCostTotals({
    importedBills: facts.importedBills,
    importedBankTransactions: facts.importedBankTransactions,
    classifications: facts.classifications,
  })

  const gross = calculateGrossMargin({
    revenueCents,
    directCostCents: costTotals.directCostCents,
  })

  const completeness = calculateDataCompleteness({
    revenueMappedPercent: facts.invoices.length > 0 ? 100 : 0,
    expenseClassifiedPercent:
      costTotals.totalCostRecordCount === 0
        ? 0
        : (Math.min(costTotals.classifiedCount, costTotals.totalCostRecordCount) / costTotals.totalCostRecordCount) * 100,
    directCostAssignedPercent:
      costTotals.totalCostRecordCount === 0
        ? 0
        : (costTotals.directCostCents > 0 ? 100 : 0),
    customerMappedPercent:
      facts.invoices.length === 0
        ? 0
        : (facts.invoices.filter((row) => row.contactId !== null).length / facts.invoices.length) * 100,
    productServiceMappedPercent: 0,
  })

  const contribution = calculateContributionMargin({
    revenueCents,
    variableCostCents: costTotals.variableCostCents,
    completenessPercent: completeness.completenessPercent,
    minimumCompletenessPercent: settings.minCompletenessPercent,
  })

  const status: MarginStatus = determineMarginStatus({
    grossMarginPercent: gross.grossMarginPercent,
    confidence: completeness.confidence,
    thresholds: {
      targetPercent: settings.targetGrossMarginPercent,
      warningPercent: settings.warningGrossMarginPercent,
      criticalPercent: settings.criticalGrossMarginPercent,
    },
  })

  const customersBelowTargetCount = await withUserContext(userId, async (tx) => {
    const contacts = await tx.financialContact.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        financialInvoices: {
          where: { dueDate: { gte: facts.from, lte: facts.to } },
          select: { amountDueCents: true },
        },
      },
    })

    return contacts.filter((contact) => {
      const contactRevenue = sumIntegers(contact.financialInvoices.map((row) => row.amountDueCents))
      if (contactRevenue <= 0 || gross.grossMarginPercent === null) return false
      return gross.grossMarginPercent < settings.targetGrossMarginPercent
    }).length
  })

  const marginAtRiskCents = gross.grossMarginPercent === null
    ? 0
    : gross.grossMarginPercent < settings.warningGrossMarginPercent
      ? Math.round((settings.warningGrossMarginPercent - gross.grossMarginPercent) / 100 * revenueCents)
      : 0

  return {
    period: {
      preset: period,
      from: facts.from.toISOString(),
      to: facts.to.toISOString(),
    },
    revenueCents,
    directCostCents: costTotals.directCostCents,
    variableCostCents: costTotals.variableCostCents,
    grossProfitCents: gross.grossProfitCents,
    grossMarginPercent: asPercent(gross.grossMarginPercent),
    contributionMarginCents: contribution.contributionMarginCents,
    contributionMarginPercent: asPercent(contribution.contributionMarginPercent),
    targetGrossMarginPercent: settings.targetGrossMarginPercent,
    marginVariancePercent: calculateMarginVariance(gross.grossMarginPercent, settings.targetGrossMarginPercent),
    marginAtRiskCents,
    customersBelowTargetCount,
    alertsOpenCount: facts.alertsOpen,
    completenessPercent: completeness.completenessPercent,
    confidence: completeness.confidence,
    status,
    assumptions: {
      grossMarginReason: gross.reason,
      contributionReason: contribution.reason,
      missingItems: completeness.missingItems,
      taxReserveExcludedFromOperatingMargin: true,
    },
  }
}

export async function getMarginTrends(
  userId: string,
  requestedPeriod?: string,
  comparisonMode: MarginTrendComparisonMode = "none",
) {
  const summary = await getMarginSummary(userId, requestedPeriod)
  const granularity = requestedPeriod === "30d" ? "daily" : "monthly"

  const snapshots = await withUserContext(userId, (tx) =>
    tx.marginSnapshot.findMany({
      where: {
        userId,
        periodGranularity: granularity,
        periodStart: { gte: new Date(summary.period.from), lte: new Date(summary.period.to) },
      },
      orderBy: { periodStart: "asc" },
      select: {
        periodStart: true,
        periodEnd: true,
        revenueCents: true,
        directCostCents: true,
        grossProfitCents: true,
        grossMarginPercent: true,
      },
    }),
  )

  const points = snapshots.length
    ? snapshots.map((row) => ({
        periodStart: row.periodStart.toISOString(),
        periodEnd: row.periodEnd.toISOString(),
        revenueCents: row.revenueCents,
        directCostCents: row.directCostCents,
        grossProfitCents: row.grossProfitCents,
        grossMarginPercent: asPercent(row.grossMarginPercent),
        targetGrossMarginPercent: summary.targetGrossMarginPercent,
      }))
    : [
        {
          periodStart: summary.period.from,
          periodEnd: summary.period.to,
          revenueCents: summary.revenueCents,
          directCostCents: summary.directCostCents,
          grossProfitCents: summary.grossProfitCents,
          grossMarginPercent: summary.grossMarginPercent,
          targetGrossMarginPercent: summary.targetGrossMarginPercent,
        },
      ]

  let comparison = {
    enabled: false,
    deltaGrossMarginPercent: null as number | null,
    deltaGrossProfitCents: null as number | null,
  }

  if (comparisonMode === "previous_period") {
    comparison.enabled = true

    const currentFrom = new Date(summary.period.from)
    const currentTo = new Date(summary.period.to)
    const rangeMs = currentTo.getTime() - currentFrom.getTime()

    if (Number.isFinite(rangeMs) && rangeMs > 0) {
      const previousTo = new Date(currentFrom.getTime() - 1)
      const previousFrom = new Date(previousTo.getTime() - rangeMs)

      const previousSnapshots = await withUserContext(userId, (tx) =>
        tx.marginSnapshot.findMany({
          where: {
            userId,
            periodGranularity: granularity,
            periodStart: { gte: previousFrom, lte: previousTo },
          },
          orderBy: { periodStart: "asc" },
          select: {
            revenueCents: true,
            directCostCents: true,
          },
        }),
      )

      if (previousSnapshots.length > 0) {
        const currentRevenueCents = sumIntegers(points.map((point) => point.revenueCents))
        const currentDirectCostCents = sumIntegers(points.map((point) => point.directCostCents))
        const previousRevenueCents = sumIntegers(previousSnapshots.map((point) => point.revenueCents))
        const previousDirectCostCents = sumIntegers(previousSnapshots.map((point) => point.directCostCents))

        const currentGross = calculateGrossMargin({
          revenueCents: currentRevenueCents,
          directCostCents: currentDirectCostCents,
        })
        const previousGross = calculateGrossMargin({
          revenueCents: previousRevenueCents,
          directCostCents: previousDirectCostCents,
        })

        const deltaMargin =
          currentGross.grossMarginPercent === null || previousGross.grossMarginPercent === null
            ? null
            : currentGross.grossMarginPercent - previousGross.grossMarginPercent

        comparison = {
          enabled: true,
          deltaGrossMarginPercent: asPercent(deltaMargin),
          deltaGrossProfitCents: currentGross.grossProfitCents - previousGross.grossProfitCents,
        }
      }
    }
  }

  return {
    period: summary.period,
    points,
    comparison,
    completenessPercent: summary.completenessPercent,
    confidence: summary.confidence,
  }
}

export async function getMarginCustomers(userId: string, requestedPeriod?: string) {
  const summary = await getMarginSummary(userId, requestedPeriod)
  const from = new Date(summary.period.from)
  const to = new Date(summary.period.to)

  return withUserContext(userId, async (tx) => {
    const contacts = await tx.financialContact.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        financialInvoices: {
          where: { dueDate: { gte: from, lte: to } },
          select: {
            id: true,
            amountDueCents: true,
            dueDate: true,
            financialPayments: { select: { amountCents: true, paidAt: true } },
            trackedInvoice: { select: { status: true } },
          },
        },
      },
    })

    return contacts.map((contact) => {
      const invoicedCents = sumIntegers(contact.financialInvoices.map((row) => row.amountDueCents))
      const paidCents = sumIntegers(
        contact.financialInvoices.flatMap((invoice) => invoice.financialPayments.map((p) => p.amountCents)),
      )
      const outstandingInvoicesCount = contact.financialInvoices.filter((row) => row.trackedInvoice?.status !== "paid").length
      const directCostCents = 0
      const grossProfitCents = invoicedCents - directCostCents
      const grossMarginPercent = invoicedCents === 0 ? null : asPercent((grossProfitCents / invoicedCents) * 100)
      const avgPaymentDelayDays = null

      const target = summary.targetGrossMarginPercent
      const variance = calculateMarginVariance(grossMarginPercent, target)
      const status = determineMarginStatus({
        grossMarginPercent,
        thresholds: {
          targetPercent: summary.targetGrossMarginPercent,
          warningPercent: summary.targetGrossMarginPercent - 5,
          criticalPercent: summary.targetGrossMarginPercent - 10,
        },
        confidence: summary.confidence,
      })

      return {
        customerId: contact.id,
        customerName: contact.name,
        revenueCents: invoicedCents,
        invoicedCents,
        paidCents,
        directCostCents,
        grossProfitCents,
        grossMarginPercent,
        targetMarginPercent: target,
        variancePercent: variance,
        outstandingInvoicesCount,
        avgPaymentDelayDays,
        trendDeltaPercent: null,
        status,
      }
    })
  })
}

export async function getMarginBreakdowns(
  userId: string,
  dimension: "customer" | "invoice" | "accounting_source",
  requestedPeriod?: string,
) {
  const summary = await getMarginSummary(userId, requestedPeriod)
  const from = new Date(summary.period.from)
  const to = new Date(summary.period.to)

  if (dimension === "invoice") {
    const rows = await withUserContext(userId, (tx) =>
      tx.financialInvoice.findMany({
        where: { userId, dueDate: { gte: from, lte: to } },
        orderBy: { dueDate: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          sourceSystem: true,
          amountDueCents: true,
          dueDate: true,
        },
      }),
    )

    return rows.map((row) => {
      const directCostCents = 0
      const grossProfitCents = row.amountDueCents - directCostCents
      const grossMarginPercent = row.amountDueCents === 0 ? null : asPercent((grossProfitCents / row.amountDueCents) * 100)
      const variancePercent = calculateMarginVariance(grossMarginPercent, summary.targetGrossMarginPercent)
      return {
        key: row.id,
        label: row.invoiceNumber || row.id,
        scopeType: "invoice",
        source: row.sourceSystem,
        revenueCents: row.amountDueCents,
        directCostCents,
        grossProfitCents,
        grossMarginPercent,
        targetMarginPercent: summary.targetGrossMarginPercent,
        variancePercent,
        trendDeltaPercent: null,
        status: summary.status,
      }
    })
  }

  if (dimension === "accounting_source") {
    const rows = await withUserContext(userId, (tx) =>
      tx.financialInvoice.groupBy({
        by: ["sourceSystem"],
        where: { userId, dueDate: { gte: from, lte: to } },
        _sum: { amountDueCents: true },
      }),
    )

    return rows.map((row) => {
      const revenueCents = row._sum.amountDueCents ?? 0
      const directCostCents = 0
      const grossProfitCents = revenueCents - directCostCents
      const grossMarginPercent = revenueCents === 0 ? null : asPercent((grossProfitCents / revenueCents) * 100)
      return {
        key: row.sourceSystem,
        label: row.sourceSystem,
        scopeType: "accounting_source",
        revenueCents,
        directCostCents,
        grossProfitCents,
        grossMarginPercent,
        targetMarginPercent: summary.targetGrossMarginPercent,
        variancePercent: calculateMarginVariance(grossMarginPercent, summary.targetGrossMarginPercent),
        trendDeltaPercent: null,
        status: summary.status,
      }
    })
  }

  const rows = await getMarginCustomers(userId, requestedPeriod)
  return rows.map((row) => ({
    key: row.customerId,
    label: row.customerName,
    scopeType: "customer",
    revenueCents: row.revenueCents,
    directCostCents: row.directCostCents,
    grossProfitCents: row.grossProfitCents,
    grossMarginPercent: row.grossMarginPercent,
    targetMarginPercent: row.targetMarginPercent,
    variancePercent: row.variancePercent,
    trendDeltaPercent: row.trendDeltaPercent,
    status: row.status,
  }))
}

export async function listMarginAlerts(userId: string, status?: MarginAlertState, limit = 25) {
  return withUserContext(userId, (tx) =>
    tx.marginAlert.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      take: limit,
      orderBy: { detectedAt: "desc" },
      select: {
        id: true,
        alertType: true,
        scopeType: true,
        scopeKey: true,
        severity: true,
        status: true,
        title: true,
        message: true,
        evidence: true,
        estimatedImpactCents: true,
        confidence: true,
        detectedAt: true,
        acknowledgedAt: true,
        resolvedAt: true,
        dismissedAt: true,
        updatedAt: true,
      },
    }),
  )
}

const MARGIN_ALERT_TRANSITIONS: Record<MarginAlertState, MarginAlertState[]> = {
  open: ["acknowledged", "resolved", "dismissed"],
  acknowledged: ["resolved", "dismissed", "open"],
  resolved: ["open", "dismissed"],
  dismissed: ["open"],
}

export function canTransitionMarginAlertState(current: MarginAlertState, next: MarginAlertState): boolean {
  return MARGIN_ALERT_TRANSITIONS[current].includes(next)
}

export async function transitionMarginAlert(
  userId: string,
  alertId: string,
  nextStatus: MarginAlertState,
  actorId: string,
  reason?: string,
) {
  return withUserContext(userId, async (tx) => {
    const current = await tx.marginAlert.findFirst({
      where: { id: alertId, userId },
      select: { id: true, status: true },
    })

    if (!current) {
      return null
    }

    const currentStatus = current.status as MarginAlertState
    if (!canTransitionMarginAlertState(currentStatus, nextStatus)) {
      throw new Error("Invalid alert state transition")
    }

    const updated = await tx.marginAlert.update({
      where: { id: alertId },
      data: {
        status: nextStatus,
        acknowledgedAt: nextStatus === "acknowledged" ? nowUtc() : undefined,
        resolvedAt: nextStatus === "resolved" ? nowUtc() : undefined,
        dismissedAt: nextStatus === "dismissed" ? nowUtc() : undefined,
      },
    })

    await tx.marginAlertEvent.create({
      data: {
        userId,
        marginAlertId: alertId,
        eventType: "MARGIN_ALERT_STATUS_CHANGED",
        actorId,
        oldStatus: currentStatus,
        newStatus: nextStatus,
        reason: reason ?? null,
      },
    })

    return updated
  })
}

export async function listMarginAlertEvents(userId: string, alertId: string) {
  return withUserContext(userId, (tx) =>
    tx.marginAlertEvent.findMany({
      where: { userId, marginAlertId: alertId },
      orderBy: { createdAt: "desc" },
    }),
  )
}

export async function listMarginOpportunities(userId: string, status?: "open" | "accepted" | "dismissed" | "resolved", limit = 50) {
  return withUserContext(userId, (tx) =>
    tx.marginOpportunity.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      take: Math.max(1, Math.min(limit, 500)),
      orderBy: { detectedAt: "desc" },
    }),
  )
}

export async function listMarginClassifications(
  userId: string,
  args: { sourceType?: string; classification?: string; limit?: number },
) {
  return withUserContext(userId, (tx) =>
    tx.marginCostClassification.findMany({
      where: {
        userId,
        ...(args.sourceType ? { sourceType: args.sourceType } : {}),
        ...(args.classification ? { classification: normalizeMarginCostClass(args.classification) } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: Math.max(1, Math.min(args.limit ?? 100, 500)),
    }),
  )
}

export async function updateMarginClassification(
  userId: string,
  classificationId: string,
  input: { classification: MarginCostClass; actorId: string; reason?: string | null },
) {
  return withUserContext(userId, async (tx) => {
    const current = await tx.marginCostClassification.findFirst({
      where: { id: classificationId, userId },
    })

    if (!current) {
      return null
    }

    const updated = await tx.marginCostClassification.update({
      where: { id: classificationId },
      data: {
        classification: input.classification,
        classificationOrigin: "manual",
        overrideLocked: true,
        updatedBy: input.actorId,
      },
    })

    const event = buildMarginClassificationAuditEvent({
      userId,
      actorId: input.actorId,
      oldClassification: normalizeMarginCostClass(current.classification),
      newClassification: input.classification,
      oldRuleId: current.marginClassificationRuleId,
      newRuleId: null,
      sourceType: current.sourceType,
      sourceRecordId: current.sourceRecordId,
      reason: input.reason ?? null,
    })

    await tx.marginAlertEvent.create({
      data: {
        userId,
        marginAlertId: (await ensureSystemMarginAlert(tx, userId)).id,
        eventType: event.eventType,
        actorId: event.actorId,
        oldStatus: event.oldStatus,
        newStatus: event.newStatus,
        reason: event.reason,
        metadata: event.metadata,
      },
    })

    return updated
  })
}

async function ensureSystemMarginAlert(tx: Prisma.TransactionClient, userId: string) {
  const existing = await tx.marginAlert.findFirst({
    where: { userId, alertType: "system.audit" },
    select: { id: true },
  })
  if (existing) return existing
  return tx.marginAlert.create({
    data: {
      userId,
      alertType: "system.audit",
      scopeType: "organization",
      severity: "info",
      status: "open",
      title: "MarginGuard audit events",
      message: "System audit trail container",
      confidence: "high",
    },
    select: { id: true },
  })
}

export async function createOrUpdateMarginRule(
  userId: string,
  input: {
    id?: string
    name: string
    ruleType: "supplier" | "category" | "account" | "text_match" | "recurring"
    classification: MarginCostClass
    priority: number
    enabled: boolean
    matchConfig: Prisma.InputJsonValue
    actorId: string
  },
) {
  return withUserContext(userId, async (tx) => {
    if (input.id) {
      return tx.marginClassificationRule.update({
        where: { id: input.id },
        data: {
          name: input.name,
          ruleType: input.ruleType,
          classification: input.classification,
          priority: input.priority,
          enabled: input.enabled,
          matchConfig: input.matchConfig,
          updatedBy: input.actorId,
        },
      })
    }

    return tx.marginClassificationRule.create({
      data: {
        userId,
        name: input.name,
        ruleType: input.ruleType,
        classification: input.classification,
        priority: input.priority,
        enabled: input.enabled,
        matchConfig: input.matchConfig,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
    })
  })
}

export async function listMarginRules(userId: string): Promise<MarginClassificationRuleModel[]> {
  return withUserContext(userId, (tx) =>
    tx.marginClassificationRule.findMany({
      where: { userId },
      orderBy: [{ enabled: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
    }),
  )
}

export async function previewMarginRuleApplication(
  userId: string,
  rule: {
    id: string
    ruleType: "supplier" | "category" | "account" | "text_match" | "recurring"
    classification: MarginCostClass
    priority: number
    enabled: boolean
    matchConfig: {
      supplierId?: string | null
      categoryKey?: string | null
      accountKey?: string | null
      includesText?: string | null
      recurringOnly?: boolean
    }
  },
  limit = 100,
) {
  return withUserContext(userId, async (tx) => {
    const [rules, bills, txns] = await Promise.all([
      tx.marginClassificationRule.findMany({
        where: { userId, enabled: true },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      }),
      tx.importedBill.findMany({
        where: { userId },
        take: limit,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          supplierName: true,
          expenseAccountName: true,
        },
      }),
      tx.importedBankTransaction.findMany({
        where: { userId },
        take: limit,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          counterpartyName: true,
          description: true,
          accountName: true,
        },
      }),
    ])

    const snapshots: MarginClassificationRuleSnapshot[] = [
      ...rules.map((r) => ({
        id: r.id,
        userId: r.userId,
        ruleType: r.ruleType as MarginClassificationRuleSnapshot["ruleType"],
        classification: normalizeMarginCostClass(r.classification),
        priority: r.priority,
        enabled: r.enabled,
        matchConfig: (r.matchConfig ?? {}) as MarginClassificationRuleSnapshot["matchConfig"],
      })),
      {
        ...rule,
        userId,
      },
    ]

    const results = [
      ...bills.map((bill) => {
        const resolved = resolveMarginClassification(snapshots, {
          supplierId: bill.supplierName,
          categoryKey: bill.expenseAccountName,
          accountKey: bill.expenseAccountName,
          description: bill.expenseAccountName,
        })

        return {
          sourceType: "imported_bill",
          sourceRecordId: bill.id,
          classification: resolved.classification,
          origin: resolved.origin,
          ruleId: resolved.ruleId,
        }
      }),
      ...txns.map((txn) => {
        const resolved = resolveMarginClassification(snapshots, {
          supplierId: txn.counterpartyName,
          categoryKey: txn.accountName,
          accountKey: txn.accountName,
          description: txn.description,
        })
        return {
          sourceType: "imported_bank_transaction",
          sourceRecordId: txn.id,
          classification: resolved.classification,
          origin: resolved.origin,
          ruleId: resolved.ruleId,
        }
      }),
    ]

    return results.filter((row) => row.ruleId === rule.id)
  })
}

export async function applyMarginRule(userId: string, ruleId: string, actorId: string, limit = 500) {
  return withUserContext(userId, async (tx) => {
    const rule = await tx.marginClassificationRule.findFirst({
      where: { id: ruleId, userId },
    })
    if (!rule || !rule.enabled) return { updatedCount: 0 }

    const preview = await previewMarginRuleApplication(
      userId,
      {
        id: rule.id,
        ruleType: rule.ruleType as "supplier" | "category" | "account" | "text_match" | "recurring",
        classification: normalizeMarginCostClass(rule.classification),
        priority: rule.priority,
        enabled: rule.enabled,
        matchConfig: (rule.matchConfig ?? {}) as {
          supplierId?: string | null
          categoryKey?: string | null
          accountKey?: string | null
          includesText?: string | null
          recurringOnly?: boolean
        },
      },
      limit,
    )

    let updatedCount = 0
    for (const row of preview) {
      const existing = await tx.marginCostClassification.findFirst({
        where: { userId, sourceType: row.sourceType, sourceRecordId: row.sourceRecordId },
      })

      if (existing?.classificationOrigin === "manual") {
        continue
      }

      if (existing) {
        await tx.marginCostClassification.update({
          where: { id: existing.id },
          data: {
            classification: row.classification,
            classificationOrigin: "rule",
            marginClassificationRuleId: rule.id,
            updatedBy: actorId,
          },
        })
      } else {
        await tx.marginCostClassification.create({
          data: {
            userId,
            sourceType: row.sourceType,
            sourceRecordId: row.sourceRecordId,
            classification: row.classification,
            classificationOrigin: "rule",
            marginClassificationRuleId: rule.id,
            createdBy: actorId,
            updatedBy: actorId,
          },
        })
      }
      updatedCount += 1
    }

    return { updatedCount }
  })
}

export async function runMarginScenario(
  userId: string,
  input: {
    name: string
    scenarioType: "price_to_target" | "cost_change" | "mixed"
    directCostCents: number
    revenueCents: number
    targetMarginPercent: number
    currentPriceCents?: number | null
    directCostChangePercent?: number
    priceChangePercent?: number
    volumeChangePercent?: number
    actorId: string
  },
) {
  const requiredPrice = calculateRequiredPrice({
    directCostCents: input.directCostCents,
    targetMarginPercent: input.targetMarginPercent,
    currentPriceCents: input.currentPriceCents,
  })

  const impact = calculateMarginImpact({
    revenueCents: input.revenueCents,
    directCostCents: input.directCostCents,
    directCostChangePercent: input.directCostChangePercent,
    priceChangePercent: input.priceChangePercent,
    volumeChangePercent: input.volumeChangePercent,
  })

  const outputs = {
    requiredPriceCents: requiredPrice.requiredPriceCents,
    expectedGrossProfitCents: requiredPrice.expectedGrossProfitCents,
    deltaFromCurrentPriceCents: requiredPrice.deltaFromCurrentPriceCents,
    projectedGrossProfitCents: impact.projectedGrossProfitCents,
    projectedGrossMarginPercent: impact.projectedGrossMarginPercent,
    grossProfitDeltaCents: impact.grossProfitDeltaCents,
    grossMarginDeltaPercent: impact.grossMarginDeltaPercent,
  }

  const scenario = await withUserContext(userId, (tx) =>
    tx.marginScenario.create({
      data: {
        userId,
        name: input.name,
        scenarioType: input.scenarioType,
        inputs: {
          directCostCents: input.directCostCents,
          revenueCents: input.revenueCents,
          targetMarginPercent: input.targetMarginPercent,
          currentPriceCents: input.currentPriceCents ?? null,
          directCostChangePercent: input.directCostChangePercent ?? 0,
          priceChangePercent: input.priceChangePercent ?? 0,
          volumeChangePercent: input.volumeChangePercent ?? 0,
        },
        outputs,
        assumptions: {
          calculatedAt: new Date().toISOString(),
          formulaVersion: "marginguard-v1",
        },
        createdBy: input.actorId,
      },
    }),
  )

  return {
    scenario,
    outputs,
  }
}
