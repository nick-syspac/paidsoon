import "server-only"

import { createHash } from "node:crypto"

import { withUserContext } from "@/lib/db/withUserContext"
import { provisionDefaultSpendCategories } from "@/lib/spendClassification/categories"
import {
  upsertSpendClassification,
  type ImportedSpendSourceType,
  type SpendClassificationStatus,
} from "@/lib/spendClassification/assignments"
import { JEV_MODEL } from "@/lib/spendClassification/jevClient"
import { resolveDeterministicSpendCategory } from "@/lib/spendClassification/resolver"
import { hasUnnormalizedSplitLineDetails } from "@/lib/spendClassification/specialCases"

const CLASSIFICATION_FINGERPRINT_VERSION = "spend-classification-v1"

type SpendSource = {
  accountingConnectionId: string
  sourceType: ImportedSpendSourceType
  expenseAccountCode: string | null
  expenseAccountName: string | null
  merchantName: string | null
  description: string | null
  direction: "outflow" | "inflow" | "unknown"
  currency: string
  createdAt: Date
  status?: string
  hasUnnormalizedSplitLineDetails: boolean
}

type RuleSnapshot = {
  id: string
  ruleType: string
  categoryId: string
  priority: number
  enabled: boolean
  matchConfig: unknown
  categoryStatus: string
  updatedAt: Date
}

type CategorySnapshot = {
  id: string
  name: string
  normalizedName: string
  description: string | null
  status: string
  updatedAt: Date
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`
}

export function createSpendClassificationFingerprint(input: {
  source: SpendSource
  categories: CategorySnapshot[]
  rules: RuleSnapshot[]
  jevEnabled: boolean
}): string {
  const source = input.source
  const payload = {
    version: CLASSIFICATION_FINGERPRINT_VERSION,
    model: JEV_MODEL,
    source: {
      sourceType: source.sourceType,
      expenseAccountCode: source.expenseAccountCode?.trim().toLowerCase() ?? null,
      expenseAccountName: source.expenseAccountName?.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase() ?? null,
      merchantName: source.merchantName?.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase() ?? null,
      description: source.description?.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase() ?? null,
      direction: source.direction,
      currency: source.currency.trim().toUpperCase(),
      status: source.status?.trim().toLowerCase() ?? null,
      hasUnnormalizedSplitLineDetails: source.hasUnnormalizedSplitLineDetails,
      accountingConnectionId: source.accountingConnectionId,
    },
    categories: [...input.categories]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id, name, normalizedName, description, status, updatedAt }) => ({
        id, name, normalizedName, description, status, updatedAt: updatedAt.toISOString(),
      })),
    rules: [...input.rules]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id, ruleType, categoryId, priority, enabled, matchConfig, categoryStatus, updatedAt }) => ({
        id, ruleType, categoryId, priority, enabled, matchConfig, categoryStatus, updatedAt: updatedAt.toISOString(),
      })),
    jevEnabled: input.jevEnabled,
  }
  return createHash("sha256").update(stableJson(payload)).digest("hex")
}

export type SpendClassificationHandoffResult =
  | { status: "created_or_updated"; classificationStatus: SpendClassificationStatus; fingerprint: string }
  | { status: "unchanged"; classificationStatus: SpendClassificationStatus; fingerprint: string }
  | { status: "manual_preserved"; classificationStatus: SpendClassificationStatus; fingerprint: string | null }

export async function handoffImportedSpendForClassification(
  userId: string,
  sourceType: ImportedSpendSourceType,
  sourceRecordId: string,
): Promise<SpendClassificationHandoffResult | { status: "source_not_found" }> {
  // Sync runs as a background process; the read/write boundary still applies tenant RLS.
  const snapshot = await withUserContext(userId, async (tx) => {
    const source = sourceType === "imported_bill"
      ? await tx.importedBill.findFirst({
          where: { userId, id: sourceRecordId },
          select: {
            accountingConnectionId: true,
            expenseAccountCode: true,
            expenseAccountName: true,
            supplierName: true,
            currency: true,
            status: true,
            createdAt: true,
            rawSourceData: true,
          },
        }).then((bill) => bill && ({
          accountingConnectionId: bill.accountingConnectionId,
          sourceType,
          expenseAccountCode: bill.expenseAccountCode,
          expenseAccountName: bill.expenseAccountName,
          merchantName: bill.supplierName,
          description: null,
          direction: "outflow" as const,
          currency: bill.currency,
          createdAt: bill.createdAt,
          status: bill.status,
          hasUnnormalizedSplitLineDetails: hasUnnormalizedSplitLineDetails(bill.rawSourceData),
        }))
      : await tx.importedBankTransaction.findFirst({
          where: { userId, id: sourceRecordId },
          select: {
            accountingConnectionId: true,
            expenseAccountCode: true,
            expenseAccountName: true,
            counterpartyName: true,
            description: true,
            direction: true,
            currency: true,
            createdAt: true,
            rawSourceData: true,
          },
        }).then((transaction) => transaction && ({
          accountingConnectionId: transaction.accountingConnectionId,
          sourceType,
          expenseAccountCode: transaction.expenseAccountCode,
          expenseAccountName: transaction.expenseAccountName,
          merchantName: transaction.counterpartyName,
          description: transaction.description,
          direction: transaction.direction,
          currency: transaction.currency,
          createdAt: transaction.createdAt,
          hasUnnormalizedSplitLineDetails: hasUnnormalizedSplitLineDetails(transaction.rawSourceData),
          }))

    if (!source) return null

    const [setting, existing, categoryRows, ruleRows] = await Promise.all([
      tx.spendClassificationSetting.findUnique({ where: { userId }, select: { enabled: true } }),
      tx.spendClassification.findFirst({
        where: { userId, sourceType, sourceRecordId },
        select: { id: true, status: true, origin: true, sourceFingerprint: true },
      }),
      tx.spendCategory.findMany({
        where: { userId, status: "active" },
        select: { id: true, name: true, normalizedName: true, description: true, status: true, updatedAt: true },
      }),
      tx.spendClassificationRule.findMany({
        // Rules created after an imported source record are future-only and must
        // not affect it, even when a later sync reevaluates changed source data.
        where: { userId, enabled: true, createdAt: { lte: source.createdAt } },
        select: {
          id: true,
          ruleType: true,
          categoryId: true,
          priority: true,
          enabled: true,
          matchConfig: true,
          updatedAt: true,
          category: { select: { status: true } },
        },
      }),
    ])
    const activeCategories: CategorySnapshot[] = categoryRows
    const rules: RuleSnapshot[] = ruleRows.map((rule) => ({
      id: rule.id,
      ruleType: rule.ruleType,
      categoryId: rule.categoryId,
      priority: rule.priority,
      enabled: rule.enabled,
      matchConfig: rule.matchConfig,
      categoryStatus: rule.category.status,
      updatedAt: rule.updatedAt,
    }))
    const fingerprint = createSpendClassificationFingerprint({
      source,
      categories: activeCategories,
      rules,
      jevEnabled: setting?.enabled === true,
    })

    return { source, existing, categories: activeCategories, rules, fingerprint, jevEnabled: setting?.enabled === true }
  })

  if (!snapshot) return { status: "source_not_found" }
  if (snapshot.categories.length === 0) {
    await provisionDefaultSpendCategories(userId)
    return handoffImportedSpendForClassification(userId, sourceType, sourceRecordId)
  }
  if (snapshot.existing?.origin === "manual") {
    return {
      status: "manual_preserved",
      classificationStatus: snapshot.existing.status as SpendClassificationStatus,
      fingerprint: snapshot.existing.sourceFingerprint,
    }
  }
  if (snapshot.existing?.sourceFingerprint === snapshot.fingerprint) {
    return {
      status: "unchanged",
      classificationStatus: snapshot.existing.status as SpendClassificationStatus,
      fingerprint: snapshot.fingerprint,
    }
  }

  const resolution = resolveDeterministicSpendCategory({
    accountingConnectionId: snapshot.source.accountingConnectionId,
    expenseAccountCode: snapshot.source.expenseAccountCode,
    expenseAccountName: snapshot.source.expenseAccountName,
    merchantName: snapshot.source.merchantName,
    description: snapshot.source.description,
  }, snapshot.rules)

  let status: SpendClassificationStatus
  let origin: "source_mapping" | "rule" | null = null
  let categoryId: string | null = null
  let ruleId: string | null = null
  if (snapshot.source.hasUnnormalizedSplitLineDetails) {
    status = "needs_review"
  } else if (snapshot.source.direction !== "outflow") {
    status = "needs_review"
  } else if (resolution.status === "matched") {
    status = "confirmed"
    origin = resolution.origin === "manual" ? null : resolution.origin
    categoryId = resolution.categoryId
    ruleId = resolution.ruleId
  } else if (resolution.status === "needs_review") {
    status = "needs_review"
  } else {
    status = snapshot.jevEnabled ? "queued" : "pending"
  }

  await upsertSpendClassification(userId, {
    sourceType,
    sourceRecordId,
    status,
    origin,
    categoryId,
    ruleId,
    sourceFingerprint: snapshot.fingerprint,
  })

  return { status: "created_or_updated", classificationStatus: status, fingerprint: snapshot.fingerprint }
}
