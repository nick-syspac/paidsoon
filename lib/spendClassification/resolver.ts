export function normalizeSpendCategoryName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase()
}

export type SpendRuleForResolution = {
  id: string
  ruleType: string
  categoryId: string
  priority: number
  enabled: boolean
  matchConfig: unknown
  categoryStatus: string
}

export type DeterministicSpendInput = {
  accountingConnectionId: string
  expenseAccountCode?: string | null
  expenseAccountName?: string | null
  merchantName?: string | null
  description?: string | null
  manualCategoryId?: string | null
}

export type DeterministicSpendResolution =
  | { status: "matched"; categoryId: string; origin: "manual" | "source_mapping" | "rule"; ruleId: string | null }
  | { status: "needs_review"; reason: "conflicting_rules" }
  | { status: "unmatched" }

type MatchCandidate = {
  rule: SpendRuleForResolution
  sourceRank: number
  specificity: number
}

function asStringRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeAccountCode(value: string): string {
  return value.trim().toLowerCase()
}

function matchesSourceAccount(rule: SpendRuleForResolution, input: DeterministicSpendInput): boolean {
  const config = asStringRecord(rule.matchConfig)
  if (!config || config.accountingConnectionId !== input.accountingConnectionId) return false

  const mappedCode = typeof config.accountCode === "string" ? normalizeAccountCode(config.accountCode) : ""
  const transactionCode = input.expenseAccountCode?.trim() ?? ""
  if (transactionCode) return Boolean(mappedCode) && mappedCode === normalizeAccountCode(transactionCode)

  const mappedName = typeof config.accountName === "string" ? normalizeSpendCategoryName(config.accountName) : ""
  const transactionName = input.expenseAccountName
    ? normalizeSpendCategoryName(input.expenseAccountName)
    : ""
  return Boolean(mappedName) && Boolean(transactionName) && mappedName === transactionName
}

function matchingCandidate(rule: SpendRuleForResolution, input: DeterministicSpendInput): MatchCandidate | null {
  if (!rule.enabled || rule.categoryStatus !== "active") return null

  if (rule.ruleType === "source_account") {
    return matchesSourceAccount(rule, input) ? { rule, sourceRank: 3, specificity: 1 } : null
  }

  const config = asStringRecord(rule.matchConfig)
  if (!config) return null

  if (rule.ruleType === "merchant") {
    const configuredMerchant = typeof config.merchantName === "string"
      ? normalizeSpendCategoryName(config.merchantName)
      : ""
    const transactionMerchant = input.merchantName
      ? normalizeSpendCategoryName(input.merchantName)
      : ""
    return configuredMerchant && transactionMerchant === configuredMerchant
      ? { rule, sourceRank: 2, specificity: 1 }
      : null
  }

  if (rule.ruleType === "text_match") {
    const phrase = typeof config.phrase === "string" ? normalizeSpendCategoryName(config.phrase) : ""
    const description = input.description ? normalizeSpendCategoryName(input.description) : ""
    return phrase && description.includes(phrase)
      ? { rule, sourceRank: 1, specificity: phrase.length }
      : null
  }

  return null
}

function compareCandidateRank(left: MatchCandidate, right: MatchCandidate): number {
  return (
    right.sourceRank - left.sourceRank ||
    right.specificity - left.specificity ||
    right.rule.priority - left.rule.priority
  )
}

export function resolveDeterministicSpendCategory(
  input: DeterministicSpendInput,
  rules: SpendRuleForResolution[],
): DeterministicSpendResolution {
  if (input.manualCategoryId) {
    return { status: "matched", categoryId: input.manualCategoryId, origin: "manual", ruleId: null }
  }

  const candidates = rules
    .map((rule) => matchingCandidate(rule, input))
    .filter((candidate): candidate is MatchCandidate => candidate !== null)
    .sort(compareCandidateRank)
  if (candidates.length === 0) return { status: "unmatched" }

  const leading = candidates[0]
  const topRanked = candidates.filter(
    (candidate) =>
      candidate.sourceRank === leading.sourceRank &&
      candidate.specificity === leading.specificity &&
      candidate.rule.priority === leading.rule.priority,
  )
  const categoryIds = new Set(topRanked.map(({ rule }) => rule.categoryId))
  if (categoryIds.size > 1) return { status: "needs_review", reason: "conflicting_rules" }

  const winningRule = topRanked.map(({ rule }) => rule).sort((a, b) => a.id.localeCompare(b.id))[0]
  return {
    status: "matched",
    categoryId: winningRule.categoryId,
    origin: winningRule.ruleType === "source_account" ? "source_mapping" : "rule",
    ruleId: winningRule.id,
  }
}
