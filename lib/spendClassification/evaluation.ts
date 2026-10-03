import {
  resolveDeterministicSpendCategory,
  type SpendRuleForResolution,
} from "@/lib/spendClassification/resolver"

export const SPEND_EVALUATION_CATEGORIES = [
  { id: "software_cloud", name: "Software & Cloud", signal: "hosted application access" },
  { id: "professional_services", name: "Professional Services", signal: "strategy retainer" },
  { id: "payroll_contractors", name: "Payroll & Contractors", signal: "weekly timesheets" },
  { id: "marketing_sales", name: "Marketing & Sales", signal: "campaign placement" },
  { id: "office_supplies", name: "Office & Supplies", signal: "printer consumables" },
  { id: "travel_transport", name: "Travel & Transport", signal: "rail and accommodation" },
  { id: "facilities_equipment", name: "Facilities & Equipment", signal: "site repair callout" },
  { id: "banking_insurance", name: "Banking & Insurance", signal: "policy premium" },
  { id: "taxes_government", name: "Taxes & Government", signal: "statutory remittance" },
  { id: "other", name: "Other", signal: "miscellaneous operating charge" },
] as const

const MERCHANT_NAMES: Record<(typeof SPEND_EVALUATION_CATEGORIES)[number]["id"], string[]> = {
  software_cloud: ["Aster Company", "Birchline Group", "Cinder Works", "Driftwood Services"],
  professional_services: ["Elm Company", "Foxglove Group", "Granite Works", "Hawthorn Services"],
  payroll_contractors: ["Indigo Company", "Juniper Group", "Keystone Works", "Larkspur Services"],
  marketing_sales: ["Maple Company", "Northwind Group", "Olive Works", "Peregrine Services"],
  office_supplies: ["Quartz Company", "Riverstone Group", "Seabrook Works", "Thistle Services"],
  travel_transport: ["Umber Company", "Valley Group", "Westward Works", "Yarrow Services"],
  facilities_equipment: ["Acorn Company", "Bramble Group", "Cobalt Works", "Dovetail Services"],
  banking_insurance: ["Evergreen Company", "Fairwater Group", "Glenhaven Works", "Highland Services"],
  taxes_government: ["Islet Company", "Kestrel Group", "Longview Works", "Morrow Services"],
  other: ["Noble Company", "Overland Group", "Pinecrest Works", "Queensland Services"],
}

const DESCRIPTION_PATTERNS = [
  (signal: string) => `Annual ${signal} subscription`,
  (signal: string) => `Monthly ${signal} service`,
  (signal: string) => `Renewal payment for ${signal}`,
  (signal: string) => `${signal} and support services`,
  (signal: string) => `Invoice for ${signal} contract`,
  () => "Recurring supplier charge",
  () => "Supplier payment for operating costs",
  () => "Business expense payment",
]

export type SpendEvaluationDecision = "classify" | "review" | "exclude"
export type SpendEvaluationSplit = "train" | "holdout"

export type SyntheticSpendEvaluationRecord = {
  id: string
  merchant: string
  description: string
  direction: "outflow" | "inflow" | "unknown"
  currency: "AUD"
  transactionDate: string
  providerSource: "xero" | "myob" | "csv"
  merchantFrequency: "common" | "rare"
  expectedCategoryId: string | null
  expectedDecision: SpendEvaluationDecision
  scenario: "ordinary" | "ambiguous" | "unlinked_refund" | "unknown_direction" | "internal_transfer" | "unsupported_split"
  merchantHoldout: SpendEvaluationSplit
  timeHoldout: SpendEvaluationSplit
  reviewStatus: "pending_human_review" | "human_reviewed"
}

export const SYNTHETIC_FIXTURE_REVIEW = {
  status: "human_reviewed" as "pending_human_review" | "human_reviewed",
  reviewer: "User",
  reviewedAt: "2026-10-03",
}

function expectedScenario(merchantIndex: number, transactionIndex: number): SyntheticSpendEvaluationRecord["scenario"] {
  if (transactionIndex === 3 && merchantIndex % 2 === 0) return "ambiguous"
  if (transactionIndex === 6 && merchantIndex % 5 === 0) return "unlinked_refund"
  if (transactionIndex === 7 && merchantIndex % 5 === 1) return "unknown_direction"
  if (transactionIndex === 5 && merchantIndex % 5 === 2) return "internal_transfer"
  if (transactionIndex === 4 && merchantIndex % 5 === 3) return "unsupported_split"
  if (transactionIndex >= 5) return "ambiguous"
  return "ordinary"
}

export const SYNTHETIC_SPEND_EVALUATION_FIXTURE: SyntheticSpendEvaluationRecord[] = (() => {
  const records: SyntheticSpendEvaluationRecord[] = []
  const providerSources = ["xero", "myob", "csv"] as const
  const rareMerchantMonths = [1, 4, 7, 10]
  let sequence = 0

  for (const [categoryIndex, category] of SPEND_EVALUATION_CATEGORIES.entries()) {
    const merchants = MERCHANT_NAMES[category.id]
    merchants.forEach((merchant, merchantIndex) => {
      const merchantFrequency = merchantIndex % 2 === 0 ? "common" : "rare"
      const transactionCount = merchantFrequency === "common" ? 12 : 4
      for (let transactionIndex = 0; transactionIndex < transactionCount; transactionIndex += 1) {
        const patternIndex = merchantFrequency === "common" ? transactionIndex % 8 : transactionIndex + 4
        const transactionMonth = merchantFrequency === "common"
          ? transactionIndex + 1
          : rareMerchantMonths[transactionIndex]
        sequence += 1
        const scenario = expectedScenario(merchantIndex, patternIndex)
        const normalDirection = scenario === "unlinked_refund" ? "inflow" : "outflow"
        const direction = scenario === "unknown_direction" ? "unknown" : normalDirection
        const expectedDecision = scenario === "internal_transfer"
          ? "exclude"
          : scenario === "ordinary"
            ? "classify"
            : "review"
        const pattern = DESCRIPTION_PATTERNS[patternIndex]
        const description = scenario === "internal_transfer"
          ? "Internal transfer between operating accounts"
          : scenario === "unlinked_refund"
            ? "Supplier refund with no reliable link to original expense"
            : scenario === "unknown_direction"
              ? "Imported transaction with unknown cash-flow direction"
              : scenario === "unsupported_split"
                ? "Split supplier bill without normalized line-level detail"
                    : scenario === "ambiguous"
                      ? "Supplier payment across mixed service bundles"
                : pattern(category.signal)

        records.push({
          id: `synthetic-spend-${String(sequence).padStart(4, "0")}`,
          merchant,
          description,
          direction,
          currency: "AUD",
          providerSource: providerSources[(categoryIndex + merchantIndex + transactionIndex) % providerSources.length],
          merchantFrequency,
          transactionDate: `2025-${String(transactionMonth).padStart(2, "0")}-${String(3 + merchantIndex * 3).padStart(2, "0")}`,
          expectedCategoryId: expectedDecision === "classify" ? category.id : null,
          expectedDecision,
          scenario,
          merchantHoldout: merchantIndex < 2 ? "train" : "holdout",
          timeHoldout: transactionMonth < 9 ? "train" : "holdout",
          reviewStatus: SYNTHETIC_FIXTURE_REVIEW.status,
        })
      }
    })
  }

  return records
})()

export function exportSyntheticSpendFixtureCsv(
  records: SyntheticSpendEvaluationRecord[] = SYNTHETIC_SPEND_EVALUATION_FIXTURE,
): string {
  const fixtureStatus = evaluateSyntheticSpendClassification(records).fixtureStatus
  const columns: Array<keyof SyntheticSpendEvaluationRecord | "expectedCategoryName" | "fixtureStatus" | "reviewer" | "reviewedAt"> = [
    "id", "merchant", "description", "direction", "currency", "providerSource", "merchantFrequency",
    "transactionDate", "expectedCategoryId", "expectedCategoryName", "expectedDecision", "scenario",
    "merchantHoldout", "timeHoldout", "reviewStatus", "fixtureStatus", "reviewer", "reviewedAt",
  ]
  const csvValue = (value: string | null): string => `"${(value ?? "").replaceAll('"', '""')}"`
  const rows = records.map((record) => {
    const values: Record<string, string | null> = {
      ...record,
      expectedCategoryName: SPEND_EVALUATION_CATEGORIES.find(({ id }) => id === record.expectedCategoryId)?.name ?? null,
      fixtureStatus,
      reviewer: SYNTHETIC_FIXTURE_REVIEW.reviewer,
      reviewedAt: SYNTHETIC_FIXTURE_REVIEW.reviewedAt,
    }
    return columns.map((column) => csvValue(values[column])).join(",")
  })
  return [columns.join(","), ...rows].join("\n") + "\n"
}

export type JevEvaluationObservation = {
  categoryId: string | null
  confidence: number | null
  probabilities?: Record<string, number>
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
  model?: string
  errorCode?: string
}

export type EvaluationMetrics = {
  records: number
  labeledRecords: number
  macroF1: number | null
  macroPrecision: number | null
  highConfidencePrecision: number | null
  decisionAccuracy: number | null
  reviewRate: number | null
  coverage: number | null
  jevObservationCount: number
  jevModels: string[]
  latencyP50Ms: number | null
  latencyP95Ms: number | null
  inputTokens: number | null
  outputTokens: number | null
  estimatedCostUsd: number | null
  estimatedCostPerJevRequestUsd: number | null
  estimatedCostPerLabeledRecordUsd: number | null
}

export type EvaluationReport = {
  fixtureStatus: "candidate_pending_human_review" | "human_reviewed"
  fixtureRecords: number
  holdouts: {
    merchant: { rulesOnly: EvaluationMetrics; rulesPlusJev: EvaluationMetrics }
    time: { rulesOnly: EvaluationMetrics; rulesPlusJev: EvaluationMetrics }
  }
  strata: {
    providerSource: Record<SyntheticSpendEvaluationRecord["providerSource"], number>
    merchantFrequency: Record<SyntheticSpendEvaluationRecord["merchantFrequency"], number>
    scenario: Record<SyntheticSpendEvaluationRecord["scenario"], number>
  }
  notes: string[]
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)]
}

type EvaluationPrediction = {
  categoryId: string | null
  decision: SpendEvaluationDecision
  confidence: number | null
}

function isValidProbabilityMap(probabilities: Record<string, number> | undefined): boolean {
  if (!probabilities) return false
  const validIds = new Set<string>(SPEND_EVALUATION_CATEGORIES.map(({ id }) => id))
  const entries = Object.entries(probabilities)
  return entries.length === validIds.size && entries.every(
    ([id, probability]) => validIds.has(id) && Number.isFinite(probability) && probability >= 0 && probability <= 1,
  )
}

function needsJevReview(observation: JevEvaluationObservation): boolean {
  if (
    !observation.categoryId ||
    observation.categoryId === "other" ||
    observation.confidence === null ||
    observation.confidence < 0.6 ||
    !isValidProbabilityMap(observation.probabilities)
  ) return true
  const ranked = Object.values(observation.probabilities!).sort((left, right) => right - left)
  return ranked.length < 2 || ranked[0] - ranked[1] < 0.15 || ranked[0] === ranked[1]
}

function categoryMetrics(
  records: SyntheticSpendEvaluationRecord[],
  predictions: Map<string, EvaluationPrediction>,
  usedObservations: Map<string, JevEvaluationObservation>,
  inputPricePerMillion: number | undefined,
  outputPricePerMillion: number,
): EvaluationMetrics {
  const labels = SPEND_EVALUATION_CATEGORIES.map(({ id }) => id)
  const labeledRecords = records.filter(({ expectedDecision }) => expectedDecision === "classify")
  const counts = new Map(labels.map((id) => [id, { tp: 0, fp: 0, fn: 0 }]))
  let reviewed = 0
  let decisionsCorrect = 0
  let coveredClassifications = 0
  let highConfidenceCorrect = 0
  let highConfidenceTotal = 0
  const latencies: number[] = []
  let inputTokens = 0
  let outputTokens = 0
  let hasInputTokens = false
  let hasOutputTokens = false
  const models = new Set<string>()

  for (const record of records) {
    const prediction = predictions.get(record.id) ?? { categoryId: null, decision: "review" as const, confidence: null }
    if (prediction.decision === "review") reviewed += 1
    if (prediction.decision === record.expectedDecision) decisionsCorrect += 1
    if (record.expectedDecision === "classify" && prediction.decision === "classify" && prediction.categoryId) {
      coveredClassifications += 1
    }

    const expectedCategoryId = record.expectedDecision === "classify" ? record.expectedCategoryId : null
    for (const label of labels) {
      const count = counts.get(label)!
      if (expectedCategoryId === label && prediction.categoryId === label) count.tp += 1
      else {
        if (prediction.categoryId === label) count.fp += 1
        if (expectedCategoryId === label) count.fn += 1
      }
    }

    if (
      prediction.categoryId !== null &&
      prediction.confidence !== null &&
      prediction.confidence >= 0.6 &&
      prediction.decision === "classify"
    ) {
      highConfidenceTotal += 1
      if (record.expectedDecision === "classify" && prediction.categoryId === record.expectedCategoryId) {
        highConfidenceCorrect += 1
      }
    }
  }

  for (const observation of usedObservations.values()) {
    if (typeof observation.latencyMs === "number" && Number.isFinite(observation.latencyMs)) latencies.push(observation.latencyMs)
    if (typeof observation.inputTokens === "number" && Number.isFinite(observation.inputTokens)) {
      inputTokens += observation.inputTokens
      hasInputTokens = true
    }
    if (typeof observation.outputTokens === "number" && Number.isFinite(observation.outputTokens)) {
      outputTokens += observation.outputTokens
      hasOutputTokens = true
    }
    if (observation.model) models.add(observation.model)
  }

  const f1Scores: number[] = []
  const precisionScores: number[] = []
  for (const count of counts.values()) {
    const precision = count.tp + count.fp > 0 ? count.tp / (count.tp + count.fp) : 0
    const recall = count.tp + count.fn > 0 ? count.tp / (count.tp + count.fn) : 0
    precisionScores.push(precision)
    f1Scores.push(precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0)
  }

  const estimatedCostUsd = hasInputTokens && inputPricePerMillion !== undefined
    ? ((inputTokens * inputPricePerMillion) + ((hasOutputTokens ? outputTokens : 0) * outputPricePerMillion)) / 1_000_000
    : null
  const requestCount = usedObservations.size
  return {
    records: records.length,
    labeledRecords: labeledRecords.length,
    macroF1: records.length ? f1Scores.reduce((sum, score) => sum + score, 0) / f1Scores.length : null,
    macroPrecision: records.length
      ? precisionScores.reduce((sum, score) => sum + score, 0) / precisionScores.length
      : null,
    highConfidencePrecision: highConfidenceTotal ? highConfidenceCorrect / highConfidenceTotal : null,
    decisionAccuracy: records.length ? decisionsCorrect / records.length : null,
    reviewRate: records.length ? reviewed / records.length : null,
    coverage: labeledRecords.length ? coveredClassifications / labeledRecords.length : null,
    jevObservationCount: requestCount,
    jevModels: [...models].sort(),
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP95Ms: percentile(latencies, 0.95),
    inputTokens: hasInputTokens ? inputTokens : null,
    outputTokens: hasOutputTokens ? outputTokens : null,
    estimatedCostUsd,
    estimatedCostPerJevRequestUsd: estimatedCostUsd !== null && requestCount > 0
      ? estimatedCostUsd / requestCount
      : null,
    estimatedCostPerLabeledRecordUsd: estimatedCostUsd !== null && labeledRecords.length > 0
      ? estimatedCostUsd / labeledRecords.length
      : null,
  }
}

function makeRulesFromTrainingSet(
  records: SyntheticSpendEvaluationRecord[],
  split: "merchantHoldout" | "timeHoldout",
): SpendRuleForResolution[] {
  const categoriesByMerchant = new Map<string, string>()
  for (const record of records) {
    if (record[split] === "train" && record.expectedDecision === "classify" && record.expectedCategoryId) {
      categoriesByMerchant.set(record.merchant, record.expectedCategoryId)
    }
  }

  return [...categoriesByMerchant].map(([merchantName, categoryId], index) => ({
    id: `synthetic-merchant-rule-${index + 1}`,
    ruleType: "merchant",
    categoryId,
    priority: 100,
    enabled: true,
    matchConfig: { merchantName },
    categoryStatus: "active",
  }))
}

function runEvaluationSplit(
  records: SyntheticSpendEvaluationRecord[],
  observations: Map<string, JevEvaluationObservation>,
  inputPricePerMillion: number | undefined,
  outputPricePerMillion: number,
  useJev: boolean,
  split: "merchantHoldout" | "timeHoldout",
): EvaluationMetrics {
  const selected = records.filter((record) => record[split] === "holdout")
  const rules = makeRulesFromTrainingSet(records, split)
  const predictions = new Map<string, EvaluationPrediction>()
  const usedObservations = new Map<string, JevEvaluationObservation>()

  for (const record of selected) {
    if (record.description.toLowerCase().includes("internal transfer")) {
      predictions.set(record.id, { categoryId: null, decision: "exclude", confidence: null })
      continue
    }
    if (record.direction !== "outflow" || record.description.toLowerCase().includes("split")) {
      predictions.set(record.id, { categoryId: null, decision: "review", confidence: null })
      continue
    }

    const deterministic = resolveDeterministicSpendCategory({
      accountingConnectionId: "synthetic-connection",
      merchantName: record.merchant,
      description: record.description,
    }, rules)
    if (deterministic.status === "matched") {
      predictions.set(record.id, {
        categoryId: deterministic.categoryId,
        decision: "classify",
        confidence: null,
      })
      continue
    }

    const observation = observations.get(record.id)
    if (!useJev || !observation) {
      predictions.set(record.id, { categoryId: null, decision: "review", confidence: null })
      continue
    }

    usedObservations.set(record.id, observation)
    const validCategory = SPEND_EVALUATION_CATEGORIES.some(({ id }) => id === observation.categoryId)
    const validConfidence = typeof observation.confidence === "number" &&
      Number.isFinite(observation.confidence) && observation.confidence >= 0 && observation.confidence <= 1
    if (!validCategory || !validConfidence || !isValidProbabilityMap(observation.probabilities)) {
      predictions.set(record.id, { categoryId: null, decision: "review", confidence: null })
      continue
    }

    const decision = needsJevReview(observation) ? "review" : "classify"
    predictions.set(record.id, {
      categoryId: observation.categoryId,
      decision,
      confidence: observation.confidence,
    })
  }

  return categoryMetrics(selected, predictions, usedObservations, inputPricePerMillion, outputPricePerMillion)
}

export function evaluateSyntheticSpendClassification(
  records: SyntheticSpendEvaluationRecord[],
  rawJevObservations: Record<string, JevEvaluationObservation> = {},
  inputPricePerMillion?: number,
  outputPricePerMillion = 0,
): EvaluationReport {
  const observations = new Map(Object.entries(rawJevObservations))
  const fixtureReviewed = records.length > 0 &&
    SYNTHETIC_FIXTURE_REVIEW.status === "human_reviewed" &&
    Boolean(SYNTHETIC_FIXTURE_REVIEW.reviewer?.trim()) &&
    Boolean(SYNTHETIC_FIXTURE_REVIEW.reviewedAt && Number.isFinite(Date.parse(SYNTHETIC_FIXTURE_REVIEW.reviewedAt))) &&
    records.every(({ reviewStatus }) => reviewStatus === "human_reviewed")
  const notes = [
    ...(fixtureReviewed ? [] : ["Synthetic labels remain provisional until a human reviewer approves the fixture; do not cite these metrics as validated quality."]),
    "Rules-only and rules-plus-Jev both use the production deterministic resolver; the merchant-rule baseline is fitted only on each split's training partition.",
    "Rules-plus-Jev uses supplied offline observations only and never calls TypeSafe; usage and latency count only observations for unresolved outflow records.",
    "Latency, token totals, and estimated cost are null when no required observations or current input-token price are supplied.",
    "Jev suggestions remain unconfirmed; the review rate measures operational review routing, not automatic-apply eligibility.",
  ]

  const countBy = <T extends string>(values: T[]): Record<T, number> => {
    const counts = Object.fromEntries([...new Set(values)].map((value) => [value, 0])) as Record<T, number>
    for (const value of values) counts[value] += 1
    return counts
  }

  return {
    fixtureStatus: fixtureReviewed ? "human_reviewed" : "candidate_pending_human_review",
    fixtureRecords: records.length,
    holdouts: {
      merchant: {
        rulesOnly: runEvaluationSplit(records, observations, inputPricePerMillion, outputPricePerMillion, false, "merchantHoldout"),
        rulesPlusJev: runEvaluationSplit(records, observations, inputPricePerMillion, outputPricePerMillion, true, "merchantHoldout"),
      },
      time: {
        rulesOnly: runEvaluationSplit(records, observations, inputPricePerMillion, outputPricePerMillion, false, "timeHoldout"),
        rulesPlusJev: runEvaluationSplit(records, observations, inputPricePerMillion, outputPricePerMillion, true, "timeHoldout"),
      },
    },
    strata: {
      providerSource: countBy(records.map(({ providerSource }) => providerSource)),
      merchantFrequency: countBy(records.map(({ merchantFrequency }) => merchantFrequency)),
      scenario: countBy(records.map(({ scenario }) => scenario)),
    },
    notes,
  }
}
