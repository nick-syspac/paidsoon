import type { Prisma } from "@/lib/generated/prisma/client"

export type MarginCostClass =
  | "DIRECT_COST"
  | "VARIABLE_COST"
  | "OVERHEAD"
  | "EXCLUDED"
  | "UNCLASSIFIED"

export type MarginClassificationOrigin = "manual" | "rule" | "default"

export type MarginRuleType = "supplier" | "category" | "account" | "text_match" | "recurring"

export interface MarginClassificationRuleSnapshot {
  id: string
  userId: string
  ruleType: MarginRuleType
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
}

export interface MarginClassificationCandidate {
  supplierId?: string | null
  categoryKey?: string | null
  accountKey?: string | null
  description?: string | null
  isRecurring?: boolean
}

export interface MarginClassificationResult {
  classification: MarginCostClass
  origin: MarginClassificationOrigin
  ruleId: string | null
}

export interface MarginClassificationAuditEventInput {
  userId: string
  alertId?: string | null
  actorId?: string | null
  oldClassification?: MarginCostClass | null
  newClassification: MarginCostClass
  oldRuleId?: string | null
  newRuleId?: string | null
  sourceType: string
  sourceRecordId: string
  reason?: string | null
}

const MARGIN_COST_CLASSES: MarginCostClass[] = [
  "DIRECT_COST",
  "VARIABLE_COST",
  "OVERHEAD",
  "EXCLUDED",
  "UNCLASSIFIED",
]

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

export function normalizeMarginCostClass(value: string | null | undefined): MarginCostClass {
  const normalized = normalizeText(value).replace(/[-\s]/g, "_").toUpperCase()
  return MARGIN_COST_CLASSES.includes(normalized as MarginCostClass)
    ? (normalized as MarginCostClass)
    : "UNCLASSIFIED"
}

export function shouldApplyMarginRule(
  rule: MarginClassificationRuleSnapshot,
  candidate: MarginClassificationCandidate,
): boolean {
  if (!rule.enabled) return false

  if (rule.ruleType === "supplier") {
    return normalizeText(rule.matchConfig.supplierId) !== "" && normalizeText(rule.matchConfig.supplierId) === normalizeText(candidate.supplierId)
  }

  if (rule.ruleType === "category") {
    return normalizeText(rule.matchConfig.categoryKey) !== "" && normalizeText(rule.matchConfig.categoryKey) === normalizeText(candidate.categoryKey)
  }

  if (rule.ruleType === "account") {
    return normalizeText(rule.matchConfig.accountKey) !== "" && normalizeText(rule.matchConfig.accountKey) === normalizeText(candidate.accountKey)
  }

  if (rule.ruleType === "text_match") {
    const needle = normalizeText(rule.matchConfig.includesText)
    const haystack = normalizeText(candidate.description)
    return needle.length > 0 && haystack.includes(needle)
  }

  if (rule.ruleType === "recurring") {
    return rule.matchConfig.recurringOnly === true && candidate.isRecurring === true
  }

  return false
}

function ruleSpecificity(rule: MarginClassificationRuleSnapshot): number {
  if (rule.ruleType === "supplier") return 5
  if (rule.ruleType === "category") return 4
  if (rule.ruleType === "account") return 3
  if (rule.ruleType === "text_match") return 2
  return 1
}

export function resolveMarginClassification(
  rules: MarginClassificationRuleSnapshot[],
  candidate: MarginClassificationCandidate,
  manualClassification?: MarginCostClass | null,
): MarginClassificationResult {
  if (manualClassification) {
    return {
      classification: normalizeMarginCostClass(manualClassification),
      origin: "manual",
      ruleId: null,
    }
  }

  const matches = rules.filter((rule) => shouldApplyMarginRule(rule, candidate))
  matches.sort((a, b) => {
    const specificityDelta = ruleSpecificity(b) - ruleSpecificity(a)
    if (specificityDelta !== 0) return specificityDelta
    return a.priority - b.priority
  })

  const winner = matches[0]
  if (!winner) {
    return {
      classification: "UNCLASSIFIED",
      origin: "default",
      ruleId: null,
    }
  }

  return {
    classification: winner.classification,
    origin: "rule",
    ruleId: winner.id,
  }
}

export function buildMarginClassificationAuditEvent(input: MarginClassificationAuditEventInput): {
  userId: string
  eventType: string
  actorId: string | null
  oldStatus: string | null
  newStatus: string
  reason: string | null
  metadata: Prisma.InputJsonValue
} {
  return {
    userId: input.userId,
    eventType: "MARGIN_CLASSIFICATION_UPDATED",
    actorId: input.actorId ?? null,
    oldStatus: input.oldClassification ?? null,
    newStatus: input.newClassification,
    reason: input.reason ?? null,
    metadata: {
      sourceType: input.sourceType,
      sourceRecordId: input.sourceRecordId,
      oldRuleId: input.oldRuleId ?? null,
      newRuleId: input.newRuleId ?? null,
    },
  }
}
