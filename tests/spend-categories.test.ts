import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"

type Category = {
  id: string
  userId: string
  key: string | null
  name: string
  normalizedName: string
  description: string | null
  isSystem: boolean
  status: string
  mergedIntoCategoryId: string | null
  createdAt: Date
}

type Event = Record<string, unknown>
type Rule = {
  id: string
  userId: string
  name: string
  ruleType: string
  categoryId: string
  priority: number
  enabled: boolean
  matchConfig: unknown
}

let categories: Category[]
let events: Event[]
let rules: Rule[]
let accountingConnections: Array<{ id: string; userId: string }>
let nextId: number
const lockQueues = new Map<string, Promise<void>>()
let categoryService: typeof import("@/lib/spendClassification/categories")
let ruleService: typeof import("@/lib/spendClassification/rules")

function matchesWhere(row: Category, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([field, expected]) => {
    const actual = row[field as keyof Category]
    if (expected && typeof expected === "object") {
      const filter = expected as Record<string, unknown>
      if ("in" in filter) return (filter.in as unknown[]).includes(actual)
      if ("not" in filter) return actual !== filter.not
    }
    return actual === expected
  })
}

function newCategory(data: Record<string, unknown>): Category {
  return {
    id: `category-${nextId++}`,
    userId: String(data.userId),
    key: (data.key as string | null | undefined) ?? null,
    name: String(data.name),
    normalizedName: String(data.normalizedName),
    description: (data.description as string | null | undefined) ?? null,
    isSystem: Boolean(data.isSystem),
    status: (data.status as string | undefined) ?? "active",
    mergedIntoCategoryId: (data.mergedIntoCategoryId as string | null | undefined) ?? null,
    createdAt: new Date(nextId),
  }
}

function createTransaction(userId: string) {
  let releaseLock: (() => void) | undefined

  const tx = {
    $executeRawUnsafe: async (_sql: string, lockKey: string) => {
      const previous = lockQueues.get(lockKey) ?? Promise.resolve()
      let release!: () => void
      const current = new Promise<void>((resolve) => {
        release = resolve
      })
      lockQueues.set(lockKey, current)
      await previous
      releaseLock = () => {
        release()
        if (lockQueues.get(lockKey) === current) lockQueues.delete(lockKey)
      }
    },
    spendCategory: {
      findMany: async ({ where }: { where?: Record<string, unknown> }) =>
        categories.filter((category) => category.userId === userId && matchesWhere(category, where)),
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        categories.find((category) => category.userId === userId && matchesWhere(category, where)) ?? null,
      count: async ({ where }: { where: Record<string, unknown> }) =>
        categories.filter((category) => category.userId === userId && matchesWhere(category, where)).length,
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const input of data) {
          if (
            categories.some(
              (category) =>
                category.userId === userId &&
                (category.normalizedName === input.normalizedName ||
                  (input.key != null && category.key === input.key)),
            )
          ) {
            throw new Error("unique constraint")
          }
          categories.push(newCategory(input))
        }
        return { count: data.length }
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (
          categories.some(
            (category) =>
              category.userId === userId && category.normalizedName === data.normalizedName,
          )
        ) {
          throw new Error("unique constraint")
        }
        const category = newCategory(data)
        categories.push(category)
        return category
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const category = categories.find((item) => item.id === where.id && item.userId === userId)
        if (!category) throw new Error("not found")
        Object.assign(category, data)
        return category
      },
    },
    spendClassificationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data)
        return data
      },
    },
    accountingConnection: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        accountingConnections.find((connection) => connection.id === where.id && connection.userId === where.userId) ?? null,
    },
    spendClassificationRule: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        rules.filter((rule) => rule.userId === userId && Object.entries(where).every(([key, value]) => rule[key as keyof Rule] === value)),
      create: async ({ data }: { data: Omit<Rule, "id"> }) => {
        const rule = { ...data, id: `rule-${nextId++}` }
        rules.push(rule)
        return rule
      },
    },
  }

  return { tx, release: () => releaseLock?.() }
}

before(async () => {
  await mock.module("@/lib/db/withUserContext", {
    namedExports: {
      withUserContext: async (userId: string, fn: (tx: never) => Promise<unknown>) => {
        const transaction = createTransaction(userId)
        try {
          return await fn(transaction.tx as never)
        } finally {
          transaction.release()
        }
      },
    },
  })
  categoryService = await import("@/lib/spendClassification/categories")
  ruleService = await import("@/lib/spendClassification/rules")
})

beforeEach(() => {
  categories = []
  events = []
  rules = []
  accountingConnections = [
    { id: "connection-a", userId: "tenant-a" },
    { id: "connection-b", userId: "tenant-b" },
  ]
  nextId = 1
  lockQueues.clear()
})

test("default categories are idempotent, tenant-scoped, and safe under concurrent first use", async () => {
  const [first, second] = await Promise.all([
    categoryService.provisionDefaultSpendCategories("tenant-a"),
    categoryService.provisionDefaultSpendCategories("tenant-a"),
  ])

  assert.equal(first.length, 10)
  assert.equal(second.length, 10)
  assert.equal(categories.filter(({ userId }) => userId === "tenant-a").length, 10)
  assert.equal(categories.filter(({ userId, key }) => userId === "tenant-a" && key === "other").length, 1)
  assert.deepEqual(
    first.map(({ name }) => name).sort(),
    [
      "Banking & Insurance",
      "Facilities & Equipment",
      "Marketing & Sales",
      "Office & Supplies",
      "Other",
      "Payroll & Contractors",
      "Professional Services",
      "Software & Cloud",
      "Taxes & Government",
      "Travel & Transport",
    ],
  )
  assert.equal(events.length, 10)

  await categoryService.provisionDefaultSpendCategories("tenant-b")
  assert.equal(categories.filter(({ userId }) => userId === "tenant-b").length, 10)
  assert.equal(categories.length, 20)
})

test("category names normalize Unicode, case, and whitespace", () => {
  assert.equal(categoryService.normalizeSpendCategoryName("  Ｓoftware   & CLOUD "), "software & cloud")
})

test("create and rename reject normalized duplicate names while preserving stable identity", async () => {
  await categoryService.provisionDefaultSpendCategories("tenant-a")
  const original = await categoryService.createSpendCategory("tenant-a", { name: "  Office   Costs " })
  await assert.rejects(
    categoryService.createSpendCategory("tenant-a", { name: "office costs" }),
    (error: unknown) => error instanceof categoryService.SpendCategoryError && error.code === "category_name_taken",
  )
  await assert.rejects(
    categoryService.renameSpendCategory("tenant-a", original.id, " SOFTWARE   & CLOUD "),
    (error: unknown) => error instanceof categoryService.SpendCategoryError && error.code === "category_name_taken",
  )

  const renamed = await categoryService.renameSpendCategory("tenant-a", original.id, "Operating Costs")
  assert.equal(renamed.id, original.id)
  assert.equal(renamed.normalizedName, "operating costs")
  assert.equal(events.at(-1)?.eventType, "category_renamed")
})

test("Other cannot be renamed, retired, or merged, and merge preserves the source category", async () => {
  await categoryService.provisionDefaultSpendCategories("tenant-a")
  const other = categories.find(({ key }) => key === "other")!
  const source = await categoryService.createSpendCategory("tenant-a", { name: "Legacy Costs" })
  const target = await categoryService.createSpendCategory("tenant-a", { name: "General Costs" })

  await assert.rejects(
    categoryService.renameSpendCategory("tenant-a", other.id, "Miscellaneous"),
    (error: unknown) => error instanceof categoryService.SpendCategoryError && error.code === "category_reserved",
  )
  await assert.rejects(
    categoryService.retireSpendCategory("tenant-a", other.id),
    (error: unknown) => error instanceof categoryService.SpendCategoryError && error.code === "category_reserved",
  )
  await assert.rejects(
    categoryService.mergeSpendCategories("tenant-a", other.id, target.id),
    (error: unknown) => error instanceof categoryService.SpendCategoryError && error.code === "category_reserved",
  )

  const merged = await categoryService.mergeSpendCategories("tenant-a", source.id, target.id)
  assert.equal(merged.status, "merged")
  assert.equal(merged.mergedIntoCategoryId, target.id)
  assert.ok(categories.some(({ id }) => id === source.id))
  assert.equal(events.at(-1)?.eventType, "category_merged")
})

test("retired categories remain historical and no longer count against the active limit", async () => {
  await categoryService.provisionDefaultSpendCategories("tenant-a")
  const category = await categoryService.createSpendCategory("tenant-a", { name: "Temporary" })
  const retired = await categoryService.retireSpendCategory("tenant-a", category.id)

  assert.equal(retired.status, "retired")
  assert.ok(categories.some(({ id }) => id === category.id))
  assert.equal(events.at(-1)?.eventType, "category_retired")
})

test("active option limit includes Other and rejects the next category without writes", async () => {
  await categoryService.provisionDefaultSpendCategories("tenant-a")
  for (let index = 0; index < 245; index += 1) {
    categories.push(
      newCategory({
        userId: "tenant-a",
        name: `Custom ${index}`,
        normalizedName: `custom ${index}`,
        status: "active",
      }),
    )
  }
  assert.equal(categories.filter(({ userId, status }) => userId === "tenant-a" && status === "active").length, 255)

  await assert.rejects(
    categoryService.createSpendCategory("tenant-a", { name: "One Too Many" }),
    (error: unknown) => error instanceof categoryService.SpendCategoryError && error.code === "category_limit_reached",
  )
  assert.equal(categories.length, 255)
})

test("retiring a category frees one active option slot", async () => {
  await categoryService.provisionDefaultSpendCategories("tenant-a")
  for (let index = 0; index < 245; index += 1) {
    categories.push(
      newCategory({
        userId: "tenant-a",
        name: `Custom ${index}`,
        normalizedName: `custom ${index}`,
        status: "active",
      }),
    )
  }
  const removable = categories.find(({ name }) => name === "Custom 0")!
  await categoryService.retireSpendCategory("tenant-a", removable.id)
  const created = await categoryService.createSpendCategory("tenant-a", { name: "New Option" })

  assert.equal(created.status, "active")
  assert.equal(categories.filter(({ userId, status }) => userId === "tenant-a" && status === "active").length, 255)
})

test("source-account mappings are connection-scoped and reject duplicate identities", async () => {
  const tenantACategories = await categoryService.provisionDefaultSpendCategories("tenant-a")
  const tenantBCategories = await categoryService.provisionDefaultSpendCategories("tenant-b")
  const tenantACategory = tenantACategories.find(({ key }) => key === "software_cloud")!
  const tenantBCategory = tenantBCategories.find(({ key }) => key === "software_cloud")!

  const mapping = await ruleService.createSourceAccountMapping("tenant-a", {
    accountingConnectionId: "connection-a",
    expenseAccountCode: " 621 ",
    expenseAccountName: "Software subscriptions",
    categoryId: tenantACategory.id,
  })
  assert.equal(mapping.ruleType, "source_account")
  assert.deepEqual(mapping.matchConfig, {
    accountingConnectionId: "connection-a",
    accountCode: "621",
  })

  await assert.rejects(
    ruleService.createSourceAccountMapping("tenant-a", {
      accountingConnectionId: "connection-a",
      expenseAccountCode: "621",
      categoryId: tenantACategory.id,
    }),
    (error: unknown) => error instanceof ruleService.SpendRuleError && error.code === "duplicate_source_mapping",
  )

  const tenantBMapping = await ruleService.createSourceAccountMapping("tenant-b", {
    accountingConnectionId: "connection-b",
    expenseAccountCode: "621",
    categoryId: tenantBCategory.id,
  })
  assert.equal(tenantBMapping.userId, "tenant-b")

  await assert.rejects(
    ruleService.createSourceAccountMapping("tenant-b", {
      accountingConnectionId: "connection-a",
      expenseAccountCode: "622",
      categoryId: tenantBCategory.id,
    }),
    (error: unknown) => error instanceof ruleService.SpendRuleError && error.code === "accounting_connection_not_found",
  )
})

test("deterministic resolution orders manual, source mapping, merchant, and specific text rules", () => {
  const rules = [
    {
      id: "map-1",
      ruleType: "source_account",
      categoryId: "category-software",
      priority: 100,
      enabled: true,
      categoryStatus: "active",
      matchConfig: { accountingConnectionId: "connection-a", accountCode: "621" },
    },
    {
      id: "merchant-1",
      ruleType: "merchant",
      categoryId: "category-marketing",
      priority: 100,
      enabled: true,
      categoryStatus: "active",
      matchConfig: { merchantName: "acme" },
    },
    {
      id: "text-short",
      ruleType: "text_match",
      categoryId: "category-office",
      priority: 100,
      enabled: true,
      categoryStatus: "active",
      matchConfig: { phrase: "cloud" },
    },
    {
      id: "text-long",
      ruleType: "text_match",
      categoryId: "category-hosting",
      priority: 1,
      enabled: true,
      categoryStatus: "active",
      matchConfig: { phrase: "cloud hosting" },
    },
  ]

  assert.deepEqual(
    ruleService.resolveDeterministicSpendCategory(
      {
        accountingConnectionId: "connection-a",
        expenseAccountCode: "621",
        merchantName: "ACME",
        description: "Cloud hosting invoice",
      },
      rules,
    ),
    { status: "matched", categoryId: "category-software", origin: "source_mapping", ruleId: "map-1" },
  )
  assert.deepEqual(
    ruleService.resolveDeterministicSpendCategory(
      { accountingConnectionId: "connection-a", merchantName: "Acme", description: "cloud hosting" },
      rules,
    ),
    { status: "matched", categoryId: "category-marketing", origin: "rule", ruleId: "merchant-1" },
  )
  assert.deepEqual(
    ruleService.resolveDeterministicSpendCategory(
      { accountingConnectionId: "connection-a", description: "cloud hosting invoice" },
      rules,
    ),
    { status: "matched", categoryId: "category-hosting", origin: "rule", ruleId: "text-long" },
  )
  assert.deepEqual(
    ruleService.resolveDeterministicSpendCategory(
      { accountingConnectionId: "another-connection", expenseAccountCode: "621" },
      rules.slice(0, 1),
    ),
    { status: "unmatched" },
  )
})

test("equal-rank conflicting rules route to review; priority and manual assignment resolve first", () => {
  const makeMerchantRule = (id: string, categoryId: string, priority: number) => ({
    id,
    ruleType: "merchant",
    categoryId,
    priority,
    enabled: true,
    categoryStatus: "active",
    matchConfig: { merchantName: "acme" },
  })
  const input = { accountingConnectionId: "connection-a", merchantName: "Acme" }

  assert.deepEqual(
    ruleService.resolveDeterministicSpendCategory(input, [
      makeMerchantRule("rule-a", "category-a", 100),
      makeMerchantRule("rule-b", "category-b", 100),
    ]),
    { status: "needs_review", reason: "conflicting_rules" },
  )
  assert.deepEqual(
    ruleService.resolveDeterministicSpendCategory(input, [
      makeMerchantRule("rule-a", "category-a", 99),
      makeMerchantRule("rule-b", "category-b", 100),
    ]),
    { status: "matched", categoryId: "category-b", origin: "rule", ruleId: "rule-b" },
  )
  assert.deepEqual(
    ruleService.resolveDeterministicSpendCategory(
      { ...input, manualCategoryId: "category-manual" },
      [makeMerchantRule("rule-b", "category-b", 100)],
    ),
    { status: "matched", categoryId: "category-manual", origin: "manual", ruleId: null },
  )
})

test("source-account name matching is a fallback only when the imported expense code is absent", () => {
  const nameMapping = {
    id: "map-name",
    ruleType: "source_account",
    categoryId: "category-software",
    priority: 100,
    enabled: true,
    categoryStatus: "active",
    matchConfig: { accountingConnectionId: "connection-a", accountName: "Software subscriptions" },
  }

  assert.equal(
    ruleService.resolveDeterministicSpendCategory(
      {
        accountingConnectionId: "connection-a",
        expenseAccountCode: "999",
        expenseAccountName: "Software subscriptions",
      },
      [nameMapping],
    ).status,
    "unmatched",
  )
  assert.equal(
    ruleService.resolveDeterministicSpendCategory(
      { accountingConnectionId: "connection-a", expenseAccountName: "software   subscriptions" },
      [nameMapping],
    ).status,
    "matched",
  )
})