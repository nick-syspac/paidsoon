import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import {
  buildTaxBufferSummary,
  type TaxBufferAccountingBasis,
  type TaxBufferCategoryResult,
  type TaxBufferSummary,
  type TaxReserveCategoryConfig,
} from "@/lib/taxBuffer/engine"

const DEFAULT_CATEGORIES: Array<Omit<TaxReserveCategoryConfig, "id">> = [
  {
    type: "gst",
    name: "GST",
    enabled: true,
    method: "integration",
    recurrence: "quarterly",
    sourcePreference: "auto",
  },
  {
    type: "payg_withholding",
    name: "PAYG Withholding",
    enabled: false,
    method: "manual",
    recurrence: "monthly",
    manualAmountCents: 0,
    sourcePreference: "manual",
  },
  {
    type: "payg_instalment",
    name: "PAYG Instalment",
    enabled: false,
    method: "manual",
    recurrence: "quarterly",
    manualAmountCents: 0,
    sourcePreference: "manual",
  },
  {
    type: "income_tax",
    name: "Income / Company Tax",
    enabled: true,
    method: "percentage_profit",
    ratePercent: 25,
    recurrence: "quarterly",
    sourcePreference: "manual",
  },
]

async function ensureDefaults(tx: PrismaTx, userId: string) {
  await tx.taxBufferConfiguration.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      enabled: false,
      accountingBasis: "cash",
      businessType: "other",
      gstRegistered: false,
      gstFrequency: "quarterly",
      reserveBalanceSource: "manual",
      reserveBalanceCents: 0,
    },
  })

  const existing = await tx.taxReserveCategory.count({ where: { userId } })
  if (existing > 0) return

  await tx.taxReserveCategory.createMany({
    data: DEFAULT_CATEGORIES.map((category) => ({
      userId,
      categoryType: category.type,
      name: category.name,
      enabled: category.enabled,
      calculationMethod: category.method,
      recurrence: category.recurrence ?? "quarterly",
      ratePercent: category.ratePercent ?? null,
      fixedAmountCents: category.fixedAmountCents ?? null,
      manualAmountCents: category.manualAmountCents ?? null,
      sourcePreference: category.sourcePreference ?? "auto",
    })),
  })
}

function estimateGstFromInvoiceAmount(amountCents: number): number {
  if (amountCents <= 0) return 0
  return Math.round(amountCents / 11)
}

function buildLatestOverrideMaps(
  overrides: Array<{
    reserveCategoryId: string | null
    obligationId: string | null
    overrideValueCents: number
    reason: string
    createdBy: string | null
    createdAt: Date
  }>,
) {
  const categoryOverrideById = new Map<
    string,
    { overrideValueCents: number; reason: string; createdBy: string | null; createdAt: Date }
  >()
  const obligationOverrideById = new Map<
    string,
    { overrideValueCents: number; reason: string; createdBy: string | null; createdAt: Date }
  >()

  for (const override of overrides) {
    if (override.reserveCategoryId && !categoryOverrideById.has(override.reserveCategoryId)) {
      categoryOverrideById.set(override.reserveCategoryId, {
        overrideValueCents: override.overrideValueCents,
        reason: override.reason,
        createdBy: override.createdBy,
        createdAt: override.createdAt,
      })
    }
    if (override.obligationId && !obligationOverrideById.has(override.obligationId)) {
      obligationOverrideById.set(override.obligationId, {
        overrideValueCents: override.overrideValueCents,
        reason: override.reason,
        createdBy: override.createdBy,
        createdAt: override.createdAt,
      })
    }
  }

  return { categoryOverrideById, obligationOverrideById }
}

export async function loadTaxBufferSummary(userId: string): Promise<TaxBufferSummary> {
  return withUserContext(userId, async (tx) => {
    await ensureDefaults(tx, userId)

    const [
      configuration,
      categories,
      obligations,
      financialInvoices,
      importedBills,
      cashForecast,
      cashPlanSnapshot,
      previousSnapshot,
      overrides,
    ] = await Promise.all([
      tx.taxBufferConfiguration.findUnique({ where: { userId } }),
      tx.taxReserveCategory.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      tx.taxBufferObligation.findMany({ where: { userId, status: { in: ["open", "short", "covered"] } } }),
      tx.financialInvoice.findMany({
        where: { userId },
        select: { amountDueCents: true, currency: true, dueDate: true },
      }),
      tx.importedBill.findMany({
        where: { userId },
        select: { amountCents: true, gstCents: true, dueDate: true },
      }),
      tx.cashForecastSnapshot.findFirst({
        where: { userId },
        orderBy: { snapshotAt: "desc" },
        select: { currentCashCents: true },
      }),
      tx.cashPlanSnapshot.findFirst({
        orderBy: { createdAt: "desc" },
        where: {
          plan: {
            userId,
          },
        },
        select: { weeks: true },
      }),
      tx.taxBufferSnapshot.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          reserveGapCents: true,
          totalRequiredCents: true,
          healthStatus: true,
          createdAt: true,
        },
      }),
      tx.taxBufferOverride.findMany({
        where: {
          userId,
          OR: [{ reserveCategoryId: { not: null } }, { obligationId: { not: null } }],
        },
        orderBy: { createdAt: "desc" },
        select: {
          reserveCategoryId: true,
          obligationId: true,
          overrideValueCents: true,
          reason: true,
          createdBy: true,
          createdAt: true,
        },
      }),
    ])

    const { categoryOverrideById, obligationOverrideById } = buildLatestOverrideMaps(overrides)

    const accountingBasis = (configuration?.accountingBasis === "accrual" ? "accrual" : "cash") as TaxBufferAccountingBasis

    const gstCollectedCents = financialInvoices
      .filter((invoice) => invoice.currency.toLowerCase() === "aud")
      .reduce((sum, invoice) => sum + estimateGstFromInvoiceAmount(invoice.amountDueCents), 0)

    const gstCreditCents = importedBills.reduce((sum, bill) => sum + (bill.gstCents ?? 0), 0)

    const now = new Date()
    const unpaidInvoiceGstCents =
      accountingBasis === "accrual"
        ? financialInvoices
            .filter((invoice) => invoice.dueDate >= now)
            .reduce((sum, invoice) => sum + estimateGstFromInvoiceAmount(invoice.amountDueCents), 0)
        : 0

    const reservedByCategory = obligations.reduce<Record<string, number>>((acc, obligation) => {
      acc[obligation.reserveCategoryId] = (acc[obligation.reserveCategoryId] ?? 0) + obligation.reservedAmountCents
      return acc
    }, {})

    if (configuration?.reserveBalanceCents && categories.length > 0) {
      const gstCategory = categories.find((category) => category.categoryType === "gst") ?? categories[0]
      reservedByCategory[gstCategory.id] =
        (reservedByCategory[gstCategory.id] ?? 0) + configuration.reserveBalanceCents
    }

    const cashPlanCommittedOutflowsCents = Array.isArray(cashPlanSnapshot?.weeks)
      ? (cashPlanSnapshot?.weeks as Array<{ outflowCents?: number }>)
          .slice(0, 4)
          .reduce((sum, week) => sum + Math.max(0, week.outflowCents ?? 0), 0)
      : 0

    const nowPlusNinetyOneDays = new Date(now.getTime() + 13 * 7 * 24 * 60 * 60 * 1000)
    const obligationCommitmentCents = obligations
      .filter((obligation) => obligation.dueDate <= nowPlusNinetyOneDays)
      .reduce((sum, obligation) => {
        const override = obligationOverrideById.get(obligation.id)
        const effectiveEstimated = override?.overrideValueCents ?? obligation.estimatedAmountCents
        return sum + Math.max(0, effectiveEstimated - obligation.reservedAmountCents)
      }, 0)

    const committedOutflowsCents = cashPlanCommittedOutflowsCents + obligationCommitmentCents

    const categoriesForSummary: TaxReserveCategoryConfig[] = categories.map((category) => {
      const override = categoryOverrideById.get(category.id)
      if (!override) {
        return {
          id: category.id,
          type: (category.categoryType as TaxReserveCategoryConfig["type"]) ?? "custom",
          name: category.name,
          enabled: category.enabled,
          method: (category.calculationMethod as TaxReserveCategoryConfig["method"]) ?? "manual",
          ratePercent: category.ratePercent,
          fixedAmountCents: category.fixedAmountCents,
          manualAmountCents: category.manualAmountCents,
          recurrence: category.recurrence as TaxReserveCategoryConfig["recurrence"],
          sourcePreference: category.sourcePreference,
        }
      }

      return {
        id: category.id,
        type: (category.categoryType as TaxReserveCategoryConfig["type"]) ?? "custom",
        name: category.name,
        enabled: true,
        method: "manual",
        manualAmountCents: override.overrideValueCents,
        recurrence: category.recurrence as TaxReserveCategoryConfig["recurrence"],
        sourcePreference: "manual",
      }
    })

    const summary = buildTaxBufferSummary({
      accountingBasis,
      thresholds: {
        watchRatio: configuration?.reserveHealthWatchThreshold ?? 0.9,
        criticalRatio: configuration?.reserveHealthCriticalThreshold ?? 0.7,
      },
      metrics: {
        availableCashCents: cashForecast?.currentCashCents ?? null,
        committedOutflowsCents,
        estimatedRevenueCents: financialInvoices.reduce((sum, invoice) => sum + invoice.amountDueCents, 0),
        estimatedTaxableProfitCents: Math.max(
          0,
          financialInvoices.reduce((sum, invoice) => sum + invoice.amountDueCents, 0) -
            importedBills.reduce((sum, bill) => sum + bill.amountCents, 0),
        ),
        gstCollectedCents,
        gstCreditCents,
        unpaidInvoiceGstCents,
      },
      categories: categoriesForSummary,
      reservedByCategory,
    })

    const categoryResults: TaxBufferCategoryResult[] = summary.categories.map((category) => {
      const override = categoryOverrideById.get(category.categoryId)
      if (!override) return category

      return {
        ...category,
        requiredReserveCents: override.overrideValueCents,
        shortfallCents: Math.max(0, override.overrideValueCents - category.reservedCents),
        confidence: "medium",
        source: "manual_override",
        explainability: [
          ...category.explainability,
          `Manual override applied: ${override.overrideValueCents} (${override.reason})`,
        ],
      }
    })

    const totalRequiredReserveCents = categoryResults.reduce((sum, category) => sum + category.requiredReserveCents, 0)
    const totalReservedCents = categoryResults.reduce((sum, category) => sum + category.reservedCents, 0)
    const reserveGapCents = Math.max(0, totalRequiredReserveCents - totalReservedCents)
    const safeToSpendCents =
      summary.availableCashCents === null
        ? null
        : summary.availableCashCents - totalRequiredReserveCents - committedOutflowsCents

    const effectiveSummary: TaxBufferSummary = {
      ...summary,
      categories: categoryResults,
      totalRequiredReserveCents,
      totalReservedCents,
      reserveGapCents,
      safeToSpendCents,
      committedOutflowsCents,
      recommendation: {
        ...summary.recommendation,
        transferNowCents: reserveGapCents,
        reasons: categoryResults
          .filter((category) => category.shortfallCents > 0)
          .sort((left, right) => right.shortfallCents - left.shortfallCents)
          .slice(0, 3)
          .map((category) => `${category.name} shortfall: ${category.shortfallCents}`),
      },
    }

    await tx.taxBufferSnapshot.create({
      data: {
        userId,
        availableCashCents: effectiveSummary.availableCashCents,
        totalRequiredCents: effectiveSummary.totalRequiredReserveCents,
        totalReservedCents: effectiveSummary.totalReservedCents,
        reserveGapCents: effectiveSummary.reserveGapCents,
        committedOutflowsCents: effectiveSummary.committedOutflowsCents,
        safeToSpendCents: effectiveSummary.safeToSpendCents,
        healthStatus: effectiveSummary.healthStatus,
        warnings: effectiveSummary.warnings,
      },
    })

    const statusEventKey = `tax-buffer-health:${effectiveSummary.healthStatus}:${new Date().toISOString().slice(0, 10)}`
    await tx.taxBufferEvent.upsert({
      where: {
        userId_dedupeKey: {
          userId,
          dedupeKey: statusEventKey,
        },
      },
      update: {
        message:
          effectiveSummary.healthStatus === "healthy"
            ? "Your Tax Buffer reserve is back on target."
            : `Your Tax Buffer reserve is ${effectiveSummary.reserveGapCents} below target.`,
      },
      create: {
        userId,
        eventType:
          effectiveSummary.healthStatus === "healthy"
            ? "tax_buffer_reserve_recovered"
            : "tax_buffer_below_target",
        severity:
          effectiveSummary.healthStatus === "critical"
            ? "critical"
            : effectiveSummary.healthStatus === "underfunded"
              ? "warning"
              : "info",
        dedupeKey: statusEventKey,
        title:
          effectiveSummary.healthStatus === "healthy"
            ? "Tax reserve recovered"
            : "Tax reserve below target",
        message:
          effectiveSummary.healthStatus === "healthy"
            ? "Your Tax Buffer reserve is back on target."
            : `Your Tax Buffer reserve is ${effectiveSummary.reserveGapCents} below target.`,
        metadata: {
          healthStatus: effectiveSummary.healthStatus,
          reserveGapCents: effectiveSummary.reserveGapCents,
        },
      },
    })

    const upcomingDue = obligations
      .filter((obligation) => obligation.dueDate.getTime() <= Date.now() + 14 * 24 * 60 * 60 * 1000)
      .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())[0]
    if (upcomingDue) {
      const dueSoonKey = `tax-buffer-due-soon:${upcomingDue.id}:${upcomingDue.dueDate.toISOString().slice(0, 10)}`
      await tx.taxBufferEvent.upsert({
        where: {
          userId_dedupeKey: {
            userId,
            dedupeKey: dueSoonKey,
          },
        },
        update: {},
        create: {
          userId,
          eventType: "tax_buffer_obligation_due_soon",
          severity: "warning",
          dedupeKey: dueSoonKey,
          title: "Tax obligation due soon",
          message: `${upcomingDue.name} is due on ${upcomingDue.dueDate.toLocaleDateString("en-AU")}.`,
          metadata: {
            obligationId: upcomingDue.id,
            dueDate: upcomingDue.dueDate.toISOString(),
            estimatedAmountCents: upcomingDue.estimatedAmountCents,
          },
        },
      })
    }

    const previousGap = previousSnapshot?.reserveGapCents ?? 0
    const gapDeltaCents = Math.abs(effectiveSummary.reserveGapCents - previousGap)
    const baselineForDelta = Math.max(previousSnapshot?.totalRequiredCents ?? 0, 1)
    const isMaterialDelta = gapDeltaCents >= 50_000 || gapDeltaCents / baselineForDelta >= 0.2
    if (isMaterialDelta) {
      const reserveDeltaKey = `tax-buffer-reserve-delta:${new Date().toISOString().slice(0, 10)}`
      await tx.taxBufferEvent.upsert({
        where: {
          userId_dedupeKey: {
            userId,
            dedupeKey: reserveDeltaKey,
          },
        },
        update: {
          message: `Reserve gap changed by ${gapDeltaCents} since the last snapshot.`,
          metadata: {
            previousReserveGapCents: previousGap,
            currentReserveGapCents: effectiveSummary.reserveGapCents,
            deltaCents: gapDeltaCents,
          },
        },
        create: {
          userId,
          eventType: "tax_buffer_reserve_delta_material",
          severity: gapDeltaCents >= 150_000 ? "warning" : "info",
          dedupeKey: reserveDeltaKey,
          title: "Tax reserve gap changed",
          message: `Reserve gap changed by ${gapDeltaCents} since the last snapshot.`,
          metadata: {
            previousReserveGapCents: previousGap,
            currentReserveGapCents: effectiveSummary.reserveGapCents,
            deltaCents: gapDeltaCents,
            previousHealthStatus: previousSnapshot?.healthStatus ?? null,
          },
        },
      })
    }

    return effectiveSummary
  })
}

export async function listTaxBufferObligations(input: {
  userId: string
  horizonDays?: number
  status?: string
  sortBy?: "dueDate" | "estimatedAmountCents" | "reservedAmountCents"
  sortOrder?: "asc" | "desc"
}): Promise<{
  obligations: Array<{
    id: string
    categoryName: string
    categoryType: string
    name: string
    dueDate: string
    estimatedAmountCents: number
    reservedAmountCents: number
    shortfallCents: number
    status: string
    confidence: string
    source: string
  }>
}> {
  const horizonDays = Math.max(1, Math.min(input.horizonDays ?? 90, 365))
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + horizonDays)

  return withUserContext(input.userId, async (tx) => {
    await ensureDefaults(tx, input.userId)

    const obligations = await tx.taxBufferObligation.findMany({
      where: {
        userId: input.userId,
        dueDate: { lte: cutoff },
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy:
        input.sortBy === "estimatedAmountCents"
          ? { estimatedAmountCents: input.sortOrder ?? "asc" }
          : input.sortBy === "reservedAmountCents"
            ? { reservedAmountCents: input.sortOrder ?? "asc" }
            : { dueDate: input.sortOrder ?? "asc" },
      include: { reserveCategory: { select: { name: true, categoryType: true } } },
    })

    const overrides = await tx.taxBufferOverride.findMany({
      where: {
        userId: input.userId,
        obligationId: { in: obligations.map((obligation) => obligation.id) },
      },
      orderBy: { createdAt: "desc" },
      select: {
        obligationId: true,
        overrideValueCents: true,
        reason: true,
        createdAt: true,
        createdBy: true,
        reserveCategoryId: true,
      },
    })

    const { obligationOverrideById } = buildLatestOverrideMaps(overrides)

    return {
      obligations: obligations.map((obligation) => ({
        id: obligation.id,
        categoryName: obligation.reserveCategory.name,
        categoryType: obligation.reserveCategory.categoryType,
        name: obligation.name,
        dueDate: obligation.dueDate.toISOString(),
        estimatedAmountCents:
          obligationOverrideById.get(obligation.id)?.overrideValueCents ?? obligation.estimatedAmountCents,
        reservedAmountCents: obligation.reservedAmountCents,
        shortfallCents: Math.max(
          0,
          (obligationOverrideById.get(obligation.id)?.overrideValueCents ?? obligation.estimatedAmountCents) -
            obligation.reservedAmountCents,
        ),
        status: obligation.status,
        confidence: obligation.confidence,
        source: obligationOverrideById.get(obligation.id) ? `manual_override:${obligation.source}` : obligation.source,
      })),
    }
  })
}

export interface TaxBufferSettingsInput {
  enabled: boolean
  accountingBasis: "cash" | "accrual"
  businessType: string
  gstRegistered: boolean
  gstFrequency: "monthly" | "quarterly" | "annually"
  reserveBalanceSource: "manual" | "connected_account"
  reserveBalanceCents: number
  reserveAccountName?: string | null
  categories?: Array<{
    id: string
    enabled: boolean
    calculationMethod: "integration" | "fixed_amount" | "percentage_profit" | "percentage_revenue" | "manual"
    recurrence: "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually" | "one_off"
    ratePercent?: number | null
    fixedAmountCents?: number | null
    manualAmountCents?: number | null
  }>
}

export async function getTaxBufferSettings(userId: string) {
  return withUserContext(userId, async (tx) => {
    await ensureDefaults(tx, userId)
    const [configuration, categories, audInvoiceCount, gstBillCount, unpaidInvoiceCount] = await Promise.all([
      tx.taxBufferConfiguration.findUnique({ where: { userId } }),
      tx.taxReserveCategory.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      tx.financialInvoice.count({ where: { userId, currency: { equals: "aud", mode: "insensitive" } } }),
      tx.importedBill.count({ where: { userId, gstCents: { gt: 0 } } }),
      tx.financialInvoice.count({ where: { userId, dueDate: { gte: new Date() } } }),
    ])

    const hasReliableTaxSignals = audInvoiceCount > 0 || gstBillCount > 0
    const suggestedGstRegistered = audInvoiceCount > 0 || gstBillCount > 0
    const suggestedAccountingBasis: TaxBufferAccountingBasis = unpaidInvoiceCount > 0 ? "accrual" : "cash"

    return {
      configuration,
      categories,
      suggestedDefaults: {
        available: hasReliableTaxSignals,
        reasons: [
          audInvoiceCount > 0 ? "Recent AUD invoices were found." : null,
          gstBillCount > 0 ? "Imported bills include GST amounts." : null,
          unpaidInvoiceCount > 0 ? "Unpaid invoices suggest accrual-aware GST tracking." : null,
        ].filter((reason): reason is string => reason !== null),
        values: {
          enabled: hasReliableTaxSignals,
          gstRegistered: suggestedGstRegistered,
          accountingBasis: suggestedAccountingBasis,
          gstFrequency: "quarterly" as const,
          reserveBalanceSource: "manual" as const,
          businessType: configuration?.businessType ?? "other",
        },
      },
    }
  })
}

export async function saveTaxBufferSettings(userId: string, input: TaxBufferSettingsInput) {
  return withUserContext(userId, async (tx) => {
    await ensureDefaults(tx, userId)
    const configuration = await tx.taxBufferConfiguration.upsert({
      where: { userId },
      update: {
        enabled: input.enabled,
        accountingBasis: input.accountingBasis,
        businessType: input.businessType,
        gstRegistered: input.gstRegistered,
        gstFrequency: input.gstFrequency,
        reserveBalanceSource: input.reserveBalanceSource,
        reserveBalanceCents: input.reserveBalanceCents,
        reserveAccountName: input.reserveAccountName ?? null,
      },
      create: {
        userId,
        enabled: input.enabled,
        accountingBasis: input.accountingBasis,
        businessType: input.businessType,
        gstRegistered: input.gstRegistered,
        gstFrequency: input.gstFrequency,
        reserveBalanceSource: input.reserveBalanceSource,
        reserveBalanceCents: input.reserveBalanceCents,
        reserveAccountName: input.reserveAccountName ?? null,
      },
    })

    await tx.taxBufferEvent.create({
      data: {
        userId,
        eventType: "tax_buffer_settings_updated",
        severity: "info",
        dedupeKey: `tax-buffer-settings:${configuration.updatedAt.toISOString()}`,
        title: "Tax Buffer settings updated",
        message: "Tax Buffer settings were changed.",
        metadata: {
          accountingBasis: configuration.accountingBasis,
          gstFrequency: configuration.gstFrequency,
          reserveBalanceSource: configuration.reserveBalanceSource,
        },
      },
    })

    if (input.categories && input.categories.length > 0) {
      for (const category of input.categories) {
        const updateResult = await tx.taxReserveCategory.updateMany({
          where: { id: category.id, userId },
          data: {
            enabled: category.enabled,
            calculationMethod: category.calculationMethod,
            recurrence: category.recurrence,
            ratePercent: category.ratePercent ?? null,
            fixedAmountCents: category.fixedAmountCents ?? null,
            manualAmountCents: category.manualAmountCents ?? null,
          },
        })

        if (updateResult.count === 0) {
          throw new Error("Invalid reserve category")
        }
      }
    }

    return configuration
  })
}

export async function saveTaxBufferOverride(input: {
  userId: string
  reserveCategoryId?: string
  obligationId?: string
  calculatedValueCents: number
  overrideValueCents: number
  reason: string
  basedOnAccountant: boolean
  createdBy: string
}) {
  return withUserContext(input.userId, async (tx) => {
    const override = await tx.taxBufferOverride.create({
      data: {
        userId: input.userId,
        reserveCategoryId: input.reserveCategoryId ?? null,
        obligationId: input.obligationId ?? null,
        calculatedValueCents: input.calculatedValueCents,
        overrideValueCents: input.overrideValueCents,
        reason: input.reason,
        basedOnAccountant: input.basedOnAccountant,
        createdBy: input.createdBy,
      },
    })

    await tx.taxBufferEvent.create({
      data: {
        userId: input.userId,
        eventType: "tax_buffer_override_created",
        severity: "warning",
        dedupeKey: `tax-buffer-override:${override.id}`,
        title: "Tax Buffer override applied",
        message: "A Tax Buffer category or obligation value was manually overridden.",
        metadata: {
          reserveCategoryId: input.reserveCategoryId ?? null,
          obligationId: input.obligationId ?? null,
          reason: input.reason,
          basedOnAccountant: input.basedOnAccountant,
        },
      },
    })

    return override
  })
}

export async function listTaxBufferOverrides(userId: string) {
  return withUserContext(userId, async (tx) =>
    tx.taxBufferOverride.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        reserveCategory: { select: { name: true, categoryType: true } },
        obligation: { select: { name: true, dueDate: true } },
      },
    }),
  )
}
