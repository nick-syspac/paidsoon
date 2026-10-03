import { z } from "zod"

import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import type { Prisma } from "@/lib/generated/prisma/client"
import { lockSpendClassificationTenant } from "@/lib/spendClassification/locks"
import { normalizeSpendCategoryName } from "@/lib/spendClassification/resolver"
export {
  resolveDeterministicSpendCategory,
} from "@/lib/spendClassification/resolver"
export type {
  DeterministicSpendInput,
  DeterministicSpendResolution,
  SpendRuleForResolution,
} from "@/lib/spendClassification/resolver"

const SourceAccountMappingInputSchema = z
  .object({
    accountingConnectionId: z.string().trim().min(1),
    expenseAccountCode: z.string().optional(),
    expenseAccountName: z.string().optional(),
    categoryId: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    priority: z.number().int().optional(),
  })
  .strict()

const TenantRuleInputSchema = z.discriminatedUnion("ruleType", [
  z
    .object({
      ruleType: z.literal("merchant"),
      merchantName: z.string().trim().min(1),
      categoryId: z.string().trim().min(1),
      name: z.string().trim().min(1).optional(),
      priority: z.number().int().optional(),
    })
    .strict(),
  z
    .object({
      ruleType: z.literal("text_match"),
      phrase: z.string().trim().min(1),
      categoryId: z.string().trim().min(1),
      name: z.string().trim().min(1).optional(),
      priority: z.number().int().optional(),
    })
    .strict(),
])

export type SpendRuleErrorCode =
  | "invalid_match_criteria"
  | "duplicate_source_mapping"
  | "accounting_connection_not_found"
  | "rule_not_found"
  | "category_not_active"

export class SpendRuleError extends Error {
  constructor(public readonly code: SpendRuleErrorCode) {
    super(code)
    this.name = "SpendRuleError"
  }
}

export async function listSpendClassificationRules(userId: string) {
  return withUserContext(userId, async (tx) => tx.spendClassificationRule.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      ruleType: true,
      categoryId: true,
      priority: true,
      enabled: true,
      matchConfig: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { name: true, status: true } },
    },
  }))
}

export async function setSpendClassificationRuleEnabled(userId: string, ruleId: string, enabled: boolean) {
  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    const rule = await tx.spendClassificationRule.findFirst({
      where: { userId, id: ruleId },
    })
    if (!rule) throw new SpendRuleError("rule_not_found")
    if (enabled) {
      await requireActiveCategory(tx, userId, rule.categoryId)
      if (rule.ruleType === "source_account") {
        const identity = normalizedMappingIdentity(rule.matchConfig)
        const enabledMappings = await tx.spendClassificationRule.findMany({
          where: { userId, ruleType: "source_account", enabled: true, id: { not: ruleId } },
          select: { matchConfig: true },
        })
        if (identity && enabledMappings.some(({ matchConfig }) => normalizedMappingIdentity(matchConfig) === identity)) {
          throw new SpendRuleError("duplicate_source_mapping")
        }
      }
    }
    return tx.spendClassificationRule.update({
      where: { id: ruleId },
      data: { enabled, updatedBy: userId },
    })
  })
}

function asStringRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeAccountCode(value: string): string {
  return value.trim().toLowerCase()
}

async function requireActiveCategory(tx: PrismaTx, userId: string, categoryId: string): Promise<void> {
  const category = await tx.spendCategory.findFirst({
    where: { userId, id: categoryId, status: "active" },
    select: { id: true },
  })
  if (!category) throw new SpendRuleError("category_not_active")
}

function normalizedMappingIdentity(matchConfig: unknown): string | null {
  const config = asStringRecord(matchConfig)
  if (!config || typeof config.accountingConnectionId !== "string") return null
  if (typeof config.accountCode === "string" && config.accountCode.trim()) {
    return `${config.accountingConnectionId}:code:${normalizeAccountCode(config.accountCode)}`
  }
  if (typeof config.accountName === "string" && config.accountName.trim()) {
    return `${config.accountingConnectionId}:name:${normalizeSpendCategoryName(config.accountName)}`
  }
  return null
}

export async function createSourceAccountMapping(
  userId: string,
  input: {
    accountingConnectionId: string
    expenseAccountCode?: string
    expenseAccountName?: string
    categoryId: string
    name?: string
    priority?: number
  },
) {
  const parsed = SourceAccountMappingInputSchema.safeParse(input)
  if (!parsed.success) throw new SpendRuleError("invalid_match_criteria")
  const accountCode = parsed.data.expenseAccountCode?.trim() ?? ""
  const accountName = parsed.data.expenseAccountName
    ? normalizeSpendCategoryName(parsed.data.expenseAccountName)
    : ""
  if (!accountCode && !accountName) throw new SpendRuleError("invalid_match_criteria")

  const matchConfig = {
    accountingConnectionId: parsed.data.accountingConnectionId,
    ...(accountCode ? { accountCode: normalizeAccountCode(accountCode) } : { accountName }),
  }
  const identity = normalizedMappingIdentity(matchConfig)

  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)

    const connection = await tx.accountingConnection.findFirst({
      where: { id: parsed.data.accountingConnectionId, userId },
      select: { id: true },
    })
    if (!connection) throw new SpendRuleError("accounting_connection_not_found")
    await requireActiveCategory(tx, userId, parsed.data.categoryId)

    const existingMappings = await tx.spendClassificationRule.findMany({
      where: { userId, ruleType: "source_account", enabled: true },
      select: { matchConfig: true },
    })
    if (existingMappings.some(({ matchConfig: existing }) => normalizedMappingIdentity(existing) === identity)) {
      throw new SpendRuleError("duplicate_source_mapping")
    }

    return tx.spendClassificationRule.create({
      data: {
        userId,
        name: parsed.data.name ?? `Account ${accountCode || accountName}`,
        ruleType: "source_account",
        categoryId: parsed.data.categoryId,
        priority: parsed.data.priority ?? 100,
        enabled: true,
        matchConfig: matchConfig as Prisma.InputJsonValue,
        createdBy: userId,
        updatedBy: userId,
      },
    })
  })
}

export async function createSpendClassificationRule(
  userId: string,
  input: {
    ruleType: "merchant"
    merchantName: string
    categoryId: string
    name?: string
    priority?: number
  } | {
    ruleType: "text_match"
    phrase: string
    categoryId: string
    name?: string
    priority?: number
  },
) {
  const parsed = TenantRuleInputSchema.safeParse(input)
  if (!parsed.success) throw new SpendRuleError("invalid_match_criteria")

  const matchConfig = parsed.data.ruleType === "merchant"
    ? { merchantName: normalizeSpendCategoryName(parsed.data.merchantName) }
    : { phrase: normalizeSpendCategoryName(parsed.data.phrase) }
  const defaultName = parsed.data.ruleType === "merchant"
    ? `Merchant: ${parsed.data.merchantName.trim()}`
    : `Text: ${parsed.data.phrase.trim()}`

  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    await requireActiveCategory(tx, userId, parsed.data.categoryId)
    return tx.spendClassificationRule.create({
      data: {
        userId,
        name: parsed.data.name ?? defaultName,
        ruleType: parsed.data.ruleType,
        categoryId: parsed.data.categoryId,
        priority: parsed.data.priority ?? 100,
        enabled: true,
        matchConfig: matchConfig as Prisma.InputJsonValue,
        createdBy: userId,
        updatedBy: userId,
      },
    })
  })
}