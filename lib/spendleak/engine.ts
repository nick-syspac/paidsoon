export type SpendFindingSeverity = "low" | "medium" | "high"
export type SpendFindingState = "open" | "resolved" | "dismissed" | "snoozed"

export interface SpendBillInput {
  id?: string
  sourceId?: string
  supplierName: string
  amountCents: number
  dueDate?: Date | null
  paidDate?: Date | null
  status?: string
  sourceUpdatedAt?: Date | null
}

export interface SpendBankTransactionInput {
  id?: string
  sourceId?: string
  description: string
  amountCents: number
  transactionDate: Date
  counterpartyName?: string | null
}

export interface SpendSupplierInput {
  id?: string
  sourceId?: string
  supplierName: string
}

export interface SpendSyncInput {
  bills: SpendBillInput[]
  bankTransactions: SpendBankTransactionInput[]
  suppliers: SpendSupplierInput[]
  currentCashCents?: number
  openReceivablesCents?: number
  now?: Date
}

export interface SpendFinding {
  id: string
  findingType: string
  subjectKey: string
  severity: SpendFindingSeverity
  summary: string
  state: SpendFindingState
  estimatedMonthlyCents?: number | null
  estimatedAnnualCents?: number | null
  evidence: Record<string, unknown>
  detectedAt: Date
}

export interface SpendSyncState {
  status: "fresh" | "stale" | "initial" | "partial"
  latestSyncAt: Date | null
}

function asDate(value: Date | null | undefined): Date | null {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase()
}

function uniqueByKey<T extends { id?: string; sourceId?: string; supplierName?: string; description?: string; amountCents?: number; transactionDate?: Date }>(items: T[], pick: (item: T) => string): T[] {
  const byKey = new Map<string, T>()
  for (const item of items) {
    const key = pick(item)
    const existing = byKey.get(key)
    if (!existing || (item.transactionDate && existing.transactionDate && item.transactionDate > existing.transactionDate)) {
      byKey.set(key, item)
    } else if (!existing) {
      byKey.set(key, item)
    }
  }
  return [...byKey.values()]
}

export function normalizeSpendSyncInput(input: SpendSyncInput): { bills: SpendBillInput[]; bankTransactions: SpendBankTransactionInput[]; suppliers: SpendSupplierInput[] } {
  const bills = uniqueByKey(input.bills, (bill) => {
    if (bill.sourceId) return `bill:${normalizeKey(bill.sourceId)}`
    if (bill.id) return `bill:${normalizeKey(bill.id)}`
    return `bill:${normalizeKey(bill.supplierName)}:${Math.abs(bill.amountCents)}:${String(bill.dueDate?.toISOString?.() ?? "")}`
  })

  const bankTransactions = uniqueByKey(input.bankTransactions, (item) => {
    if (item.sourceId) return `txn:${normalizeKey(item.sourceId)}`
    if (item.id) return `txn:${normalizeKey(item.id)}`
    return `txn:${normalizeKey(item.description)}:${item.amountCents}:${item.transactionDate.toISOString()}`
  })

  const suppliers = uniqueByKey(input.suppliers, (supplier) => {
    if (supplier.sourceId) return `supplier:${normalizeKey(supplier.sourceId)}`
    if (supplier.id) return `supplier:${normalizeKey(supplier.id)}`
    return `supplier:${normalizeKey(supplier.supplierName)}`
  })

  return {
    bills: bills.sort((a, b) => (asDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (asDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER)),
    bankTransactions: bankTransactions.sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime()),
    suppliers: suppliers.sort((a, b) => a.supplierName.localeCompare(b.supplierName)),
  }
}

function supplierGroupFor(bills: SpendBillInput[]): Map<string, SpendBillInput[]> {
  const groups = new Map<string, SpendBillInput[]>()
  for (const bill of bills) {
    const key = normalizeKey(bill.supplierName)
    const next = groups.get(key) ?? []
    next.push(bill)
    groups.set(key, next)
  }
  return groups
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function monthDistance(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
}

function confidenceFromSignal(signal: "confirmed" | "likely" | "review"): "confirmed leak" | "likely leak" | "review recommended" {
  if (signal === "confirmed") return "confirmed leak"
  if (signal === "likely") return "likely leak"
  return "review recommended"
}

export function detectSpendFindings(input: SpendSyncInput): SpendFinding[] {
  const { bills, bankTransactions, suppliers } = normalizeSpendSyncInput(input)
  const now = input.now ?? new Date()
  const findings: SpendFinding[] = []
  const groupedBills = supplierGroupFor(bills)

  const totalOutflow = bankTransactions.reduce((sum, tx) => sum + Math.min(0, tx.amountCents), 0)
  const totalSpend = bills.reduce((sum, bill) => sum + Math.abs(bill.amountCents), 0)

  const supplierTotals = new Map<string, number>()
  for (const bill of bills) {
    supplierTotals.set(bill.supplierName, (supplierTotals.get(bill.supplierName) ?? 0) + Math.abs(bill.amountCents))
  }

  for (const [supplierName, supplierBills] of groupedBills.entries()) {
    if (supplierBills.length >= 2) {
      const ordered = [...supplierBills].sort((a, b) => (asDate(a.dueDate)?.getTime() ?? 0) - (asDate(b.dueDate)?.getTime() ?? 0))
      const amounts = ordered.map((bill) => Math.abs(bill.amountCents))
      const avgAmount = average(amounts)
      const annual = Math.max(Math.round(avgAmount * 12), 0)

      findings.push({
        id: `recurring-spend-${supplierName}`,
        findingType: "recurring_spend",
        subjectKey: supplierName,
        severity: annual >= 500000 ? "high" : "medium",
        summary: `${supplierName} shows a repeat monthly spend pattern worth around ${Math.round(avgAmount / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })} AUD per cycle.`,
        state: "open",
        estimatedMonthlyCents: Math.round(avgAmount),
        estimatedAnnualCents: annual,
        evidence: {
          supplier: supplierName,
          billCount: ordered.length,
          averageAmountCents: Math.round(avgAmount),
          confidence: confidenceFromSignal("likely"),
        },
        detectedAt: now,
      })

      for (let i = 0; i < ordered.length - 1; i += 1) {
        const current = ordered[i]
        const next = ordered[i + 1]
        const currentDate = asDate(current.dueDate) ?? asDate(current.paidDate) ?? new Date(0)
        const nextDate = asDate(next.dueDate) ?? asDate(next.paidDate) ?? new Date(0)
        const dayDifference = Math.abs(nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
        if (dayDifference <= 45 && Math.abs(Math.abs(current.amountCents) - Math.abs(next.amountCents)) <= Math.max(10000, Math.round(Math.abs(current.amountCents) * 0.08))) {
          findings.push({
            id: `duplicate-spend-${supplierName}-${i}`,
            findingType: "duplicate_spend",
            subjectKey: `${supplierName}:${current.sourceId ?? current.id ?? i}`,
            severity: Math.abs(current.amountCents) >= 500000 ? "high" : "medium",
            summary: `Possible duplicate spend for ${supplierName} appears within a short time window.`,
            state: "open",
            estimatedMonthlyCents: Math.round(Math.abs(current.amountCents)),
            estimatedAnnualCents: Math.round(Math.abs(current.amountCents) * 12),
            evidence: {
              supplier: supplierName,
              billIds: [current.id ?? current.sourceId ?? "unknown", next.id ?? next.sourceId ?? "unknown"],
              dayDifference,
              amountCents: Math.abs(current.amountCents),
              confidence: confidenceFromSignal("confirmed"),
            },
            detectedAt: now,
          })
          break
        }
      }

      const upcomingBill = ordered.find((bill) => {
        const date = asDate(bill.dueDate) ?? asDate(bill.paidDate)
        return date ? date.getTime() > now.getTime() : false
      })
      if (upcomingBill) {
        const upcomingDate = asDate(upcomingBill.dueDate) ?? asDate(upcomingBill.paidDate)
        if (upcomingDate) {
          findings.push({
            id: `renewal-${supplierName}`,
            findingType: "renewal",
            subjectKey: supplierName,
            severity: "medium",
            summary: `${supplierName} has an upcoming renewal or renewal-like spend due on ${upcomingDate.toISOString().slice(0, 10)}.`,
            state: "open",
            estimatedMonthlyCents: Math.round(avgAmount),
            estimatedAnnualCents: Math.round(avgAmount * 12),
            evidence: {
              supplier: supplierName,
              renewalDate: upcomingDate.toISOString(),
              measuredBills: ordered.length,
              confidence: confidenceFromSignal("review"),
            },
            detectedAt: now,
          })
        }
      }

      if (ordered.length >= 3) {
        const midpoint = Math.floor(ordered.length / 2)
        const earlyAmounts = ordered.slice(0, midpoint).map((bill) => Math.abs(bill.amountCents))
        const recentAmounts = ordered.slice(midpoint).map((bill) => Math.abs(bill.amountCents))
        const earlyAverage = average(earlyAmounts)
        const recentAverage = average(recentAmounts)
        const increaseRatio = earlyAverage > 0 ? (recentAverage - earlyAverage) / earlyAverage : 0

        if (increaseRatio >= 0.12 && recentAverage - earlyAverage >= 5000) {
          findings.push({
            id: `price-increase-${supplierName}`,
            findingType: "price_increase",
            subjectKey: supplierName,
            severity: increaseRatio >= 0.25 ? "high" : "medium",
            summary: `${supplierName} shows a supplier price increase trend versus earlier recurring charges.`,
            state: "open",
            estimatedMonthlyCents: Math.round(Math.max(recentAverage - earlyAverage, 0)),
            estimatedAnnualCents: Math.round(Math.max(recentAverage - earlyAverage, 0) * 12),
            evidence: {
              supplier: supplierName,
              baselineAverageCents: Math.round(earlyAverage),
              currentAverageCents: Math.round(recentAverage),
              increaseRatio: Number(increaseRatio.toFixed(4)),
              confidence: confidenceFromSignal("likely"),
            },
            detectedAt: now,
          })
        }
      }

      if (ordered.length >= 3) {
        const datedAmounts = ordered
          .map((bill) => ({
            date: asDate(bill.dueDate) ?? asDate(bill.paidDate),
            amount: Math.abs(bill.amountCents),
          }))
          .filter((row): row is { date: Date; amount: number } => row.date instanceof Date)
          .sort((a, b) => a.date.getTime() - b.date.getTime())

        if (datedAmounts.length >= 3) {
          const first = datedAmounts[0]
          const last = datedAmounts[datedAmounts.length - 1]
          const months = Math.max(monthDistance(first.date, last.date), 1)
          const monthlySlopeCents = Math.round((last.amount - first.amount) / months)
          const growthRatio = first.amount > 0 ? (last.amount - first.amount) / first.amount : 0
          if (monthlySlopeCents > 0 && growthRatio >= 0.1) {
            findings.push({
              id: `supplier-spend-trend-${supplierName}`,
              findingType: "supplier_spend_trend",
              subjectKey: supplierName,
              severity: growthRatio >= 0.25 ? "high" : "medium",
              summary: `${supplierName} shows a gradual upward spend trend that may indicate price creep.`,
              state: "open",
              estimatedMonthlyCents: monthlySlopeCents,
              estimatedAnnualCents: monthlySlopeCents * 12,
              evidence: {
                supplier: supplierName,
                firstAmountCents: first.amount,
                latestAmountCents: last.amount,
                monthsObserved: months,
                monthlySlopeCents,
                growthRatio: Number(growthRatio.toFixed(4)),
                confidence: confidenceFromSignal("review"),
              },
              detectedAt: now,
            })
          }
        }
      }
    }
  }

  if (bankTransactions.length >= 2) {
    const byCounterpartyAndAmount = new Map<string, SpendBankTransactionInput[]>()
    for (const tx of bankTransactions) {
      const counterparty = normalizeKey(tx.counterpartyName ?? tx.description)
      const key = `${counterparty}:${Math.abs(tx.amountCents)}`
      const group = byCounterpartyAndAmount.get(key) ?? []
      group.push(tx)
      byCounterpartyAndAmount.set(key, group)
    }

    for (const [groupKey, group] of byCounterpartyAndAmount.entries()) {
      if (group.length < 2) continue
      const ordered = [...group].sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime())
      for (let i = 0; i < ordered.length - 1; i += 1) {
        const current = ordered[i]
        const next = ordered[i + 1]
        const dayDifference = Math.abs(next.transactionDate.getTime() - current.transactionDate.getTime()) / (1000 * 60 * 60 * 24)
        if (dayDifference <= 7) {
          const counterparty = current.counterpartyName ?? current.description
          const amount = Math.abs(current.amountCents)
          findings.push({
            id: `duplicate-payment-${groupKey}-${i}`,
            findingType: "duplicate_payment",
            subjectKey: `${groupKey}:${i}`,
            severity: amount >= 500000 ? "high" : "medium",
            summary: `Possible duplicate payment detected for ${counterparty} within a short timeframe.`,
            state: "open",
            estimatedMonthlyCents: amount,
            estimatedAnnualCents: amount * 12,
            evidence: {
              counterparty,
              transactionIds: [current.id ?? current.sourceId ?? "unknown", next.id ?? next.sourceId ?? "unknown"],
              dayDifference,
              amountCents: amount,
              confidence: confidenceFromSignal("confirmed"),
            },
            detectedAt: now,
          })
          break
        }
      }
    }
  }

  const topSupplier = [...supplierTotals.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topSupplier && totalSpend > 0 && topSupplier[1] / totalSpend >= 0.6) {
    findings.push({
      id: `supplier-concentration-${topSupplier[0]}`,
      findingType: "supplier_concentration",
      subjectKey: topSupplier[0],
      severity: "high",
      summary: `${topSupplier[0]} accounts for a large share of supplier spend and is a concentration risk.`,
      state: "open",
      estimatedMonthlyCents: Math.round(topSupplier[1]),
      estimatedAnnualCents: Math.round(topSupplier[1] * 12),
      evidence: {
        supplier: topSupplier[0],
        share: Number((topSupplier[1] / totalSpend).toFixed(4)),
        spendCents: topSupplier[1],
        confidence: confidenceFromSignal("review"),
      },
      detectedAt: now,
    })
  }

  if (Math.abs(totalOutflow) >= 1000000 || totalSpend >= 1500000) {
    findings.push({
      id: "cash-pressure",
      findingType: "cash_pressure",
      subjectKey: "cash-pressure",
      severity: "high",
      summary: "Current spend pressure is elevated and cash runway should be reviewed against the next month’s outflows.",
      state: "open",
      estimatedMonthlyCents: Math.round(Math.abs(totalOutflow)),
      estimatedAnnualCents: Math.round(Math.abs(totalOutflow) * 12),
      evidence: {
        negativeBankTransactionCents: Math.abs(totalOutflow),
        spendCents: totalSpend,
        transactionCount: bankTransactions.length,
        confidence: confidenceFromSignal("review"),
      },
      detectedAt: now,
    })
  }

  if ((input.currentCashCents ?? 0) > 0) {
    const monthlyOutflow = Math.max(Math.abs(totalOutflow), Math.round(totalSpend))
    if (monthlyOutflow > 0) {
      const netBuffer = (input.currentCashCents ?? 0) + (input.openReceivablesCents ?? 0)
      const runwayDays = Math.max(Math.floor((netBuffer / monthlyOutflow) * 30), 0)
      if (runwayDays <= 120) {
        findings.push({
          id: "cash-runway",
          findingType: "cash_runway",
          subjectKey: "cash-runway",
          severity: runwayDays <= 45 ? "high" : "medium",
          summary: `Estimated cash runway is about ${runwayDays} days using current cash, open receivables, and spend outflow trends.`,
          state: "open",
          estimatedMonthlyCents: monthlyOutflow,
          estimatedAnnualCents: monthlyOutflow * 12,
          evidence: {
            currentCashCents: input.currentCashCents ?? 0,
            openReceivablesCents: input.openReceivablesCents ?? 0,
            modeledMonthlyOutflowCents: monthlyOutflow,
            runwayDays,
            confidence: confidenceFromSignal("review"),
          },
          detectedAt: now,
        })
      }
    }
  }

  if (suppliers.length === 0 && bills.length === 0 && bankTransactions.length === 0) {
    return []
  }

  const deduped = new Map<string, SpendFinding>()
  for (const finding of findings) {
    deduped.set(`${finding.findingType}:${finding.subjectKey}`, finding)
  }

  return [...deduped.values()]
}

export function buildGroundedSummary({ findings, syncState }: { findings: Array<Pick<SpendFinding, "findingType" | "summary" | "subjectKey" | "estimatedAnnualCents">>; syncState: SpendSyncState }): string {
  if (findings.length === 0) {
    if (syncState.status === "initial" || syncState.latestSyncAt === null) {
      return "No spend findings detected yet. This account is still in its initial sync, so SpendLeak has not identified any supported opportunities to present."
    }
    return "No spend findings were detected from the latest persisted spend data. This summary stays grounded in the current findings only."
  }

  const supportedTypes = new Set([
    "recurring_spend",
    "price_increase",
    "duplicate_spend",
    "duplicate_payment",
    "renewal",
    "supplier_concentration",
    "supplier_spend_trend",
    "cash_pressure",
    "cash_runway",
  ])
  const labels = [...new Set(findings.map((finding) => finding.findingType))]
  const summaryLabels = labels.filter((label) => supportedTypes.has(label))
  const strongest = findings.reduce((winner, current) => {
    const currentScore = current.estimatedAnnualCents ?? 0
    return currentScore > (winner.estimatedAnnualCents ?? 0) ? current : winner
  }, findings[0])

  const lead = strongest.subjectKey || "your spend profile"
  const freshnessNote = syncState.status === "stale" ? "The latest sync is stale, so this summary should be treated as a cautious view of the data currently on file." : "The latest spend data is recent enough to keep the recommendations grounded in the current findings."

  const normalizedLabels = summaryLabels.length > 0 ? summaryLabels : ["supported"]
  const labelText = normalizedLabels.length === 1
    ? normalizedLabels[0].replace(/_/g, " ")
    : `${normalizedLabels.slice(0, -1).map((label) => label.replace(/_/g, " ")).join(", ")}, and ${normalizedLabels.at(-1)?.replace(/_/g, " ")}`
  const recurringSignal = labels.includes("recurring spend") || labels.includes("recurring_spend") ? " showing a repeat monthly charge pattern" : ""

  return `${lead} is the strongest signal in the current SpendLeak view. The latest analysis is grounded in ${labelText} findings${recurringSignal} and suggests a review of the spend pattern behind this signal. Any savings figures are potential estimates, not confirmed outcomes, and should be validated during review. ${freshnessNote}`
}
