import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

type RouteModule = typeof import("@/app/api/spend-classification/categories/route")
type CategoryItemRouteModule = typeof import("@/app/api/spend-classification/categories/[categoryId]/route")
type TagsRouteModule = typeof import("@/app/api/spend-classification/tags/route")
type TagItemRouteModule = typeof import("@/app/api/spend-classification/tags/[tagId]/route")
type RulesRouteModule = typeof import("@/app/api/spend-classification/rules/route")
type RuleItemRouteModule = typeof import("@/app/api/spend-classification/rules/[ruleId]/route")
type SettingsRouteModule = typeof import("@/app/api/spend-classification/settings/route")

let mockUser: { id: string } | null = { id: "tenant-a" }
let calls: Array<{ operation: string; userId: string; input?: unknown }> = []
let categoryItemRoute: CategoryItemRouteModule
let categoriesRoute: RouteModule
let tagItemRoute: TagItemRouteModule
let tagsRoute: TagsRouteModule
let ruleItemRoute: RuleItemRouteModule
let rulesRoute: RulesRouteModule
let settingsRoute: SettingsRouteModule

const date = new Date("2026-10-01T00:00:00.000Z")

function category(id: string, userId: string, name = "Travel") {
  return {
    id,
    userId,
    key: null,
    name,
    description: null,
    isSystem: false,
    status: "active",
    mergedIntoCategoryId: null,
    createdAt: date,
    updatedAt: date,
  }
}

function tag(id: string, userId: string, name = "Recurring") {
  return { id, userId, name, normalizedName: name.toLowerCase(), status: "active", createdAt: date, updatedAt: date }
}

function rule(id: string, userId: string) {
  return {
    id,
    userId,
    name: "Merchant: Example",
    ruleType: "merchant",
    categoryId: "category-a",
    priority: 100,
    enabled: true,
    matchConfig: { merchantName: "example" },
    createdAt: date,
    updatedAt: date,
    createdBy: userId,
    updatedBy: userId,
  }
}

describe("spend classification settings routes", () => {
  before(async () => {
    await mock.module("server-only", { namedExports: {} })
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
      },
    })

    await mock.module("@/lib/spendClassification/categories", {
      namedExports: {
        SpendCategoryError: class SpendCategoryError extends Error {
          code: string
          constructor(code: string) { super(code); this.code = code }
        },
        provisionDefaultSpendCategories: async (userId: string) => {
          calls.push({ operation: "listCategories", userId })
          return [category("category-a", userId)]
        },
        createSpendCategory: async (userId: string, input: unknown) => {
          calls.push({ operation: "createCategory", userId, input })
          return category("category-a", userId)
        },
        renameSpendCategory: async (userId: string, categoryId: string, name: string) => {
          calls.push({ operation: "renameCategory", userId, input: { categoryId, name } })
          return category(categoryId, userId, name)
        },
        retireSpendCategory: async (userId: string, categoryId: string) => {
          calls.push({ operation: "retireCategory", userId, input: categoryId })
          return category(categoryId, userId)
        },
        mergeSpendCategories: async (userId: string, sourceId: string, targetId: string) => {
          calls.push({ operation: "mergeCategory", userId, input: { sourceId, targetId } })
          return { ...category(sourceId, userId), status: "merged", mergedIntoCategoryId: targetId }
        },
      },
    })

    await mock.module("@/lib/spendClassification/tags", {
      namedExports: {
        SpendTagError: class SpendTagError extends Error {
          code: string
          constructor(code: string) { super(code); this.code = code }
        },
        listSpendTags: async (userId: string) => {
          calls.push({ operation: "listTags", userId })
          return [tag("tag-a", userId)]
        },
        createSpendTag: async (userId: string, name: string) => {
          calls.push({ operation: "createTag", userId, input: name })
          return tag("tag-a", userId, name)
        },
        retireSpendTag: async (userId: string, tagId: string) => {
          calls.push({ operation: "retireTag", userId, input: tagId })
          return tag(tagId, userId)
        },
      },
    })

    await mock.module("@/lib/spendClassification/rules", {
      namedExports: {
        SpendRuleError: class SpendRuleError extends Error {
          code: string
          constructor(code: string) { super(code); this.code = code }
        },
        listSpendClassificationRules: async (userId: string) => {
          calls.push({ operation: "listRules", userId })
          return [{ ...rule("rule-a", userId), category: { name: "Travel", status: "active" } }]
        },
        createSourceAccountMapping: async (userId: string, input: unknown) => {
          calls.push({ operation: "createSourceRule", userId, input })
          return rule("rule-a", userId)
        },
        createSpendClassificationRule: async (userId: string, input: unknown) => {
          calls.push({ operation: "createRule", userId, input })
          return rule("rule-a", userId)
        },
        setSpendClassificationRuleEnabled: async (userId: string, ruleId: string, enabled: boolean) => {
          calls.push({ operation: "updateRule", userId, input: { ruleId, enabled } })
          return { ...rule(ruleId, userId), enabled }
        },
      },
    })

    await mock.module("@/lib/spendClassification/settings", {
      namedExports: {
        getSpendClassificationSetting: async (userId: string) => {
          calls.push({ operation: "getSetting", userId })
          return { enabled: false }
        },
        updateSpendClassificationSetting: async (userId: string, enabled: boolean) => {
          calls.push({ operation: "updateSetting", userId, input: enabled })
          return { enabled }
        },
      },
    })

    ;[categoriesRoute, categoryItemRoute, tagsRoute, tagItemRoute, rulesRoute, ruleItemRoute, settingsRoute] = await Promise.all([
      import("@/app/api/spend-classification/categories/route"),
      import("@/app/api/spend-classification/categories/[categoryId]/route"),
      import("@/app/api/spend-classification/tags/route"),
      import("@/app/api/spend-classification/tags/[tagId]/route"),
      import("@/app/api/spend-classification/rules/route"),
      import("@/app/api/spend-classification/rules/[ruleId]/route"),
      import("@/app/api/spend-classification/settings/route"),
    ])
  })

  beforeEach(() => {
    mockUser = { id: "tenant-a" }
    calls = []
  })

  test("every resource route rejects unauthenticated access before calling a service", async () => {
    mockUser = null
    const requests = [
      categoriesRoute.GET(),
      categoriesRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ name: "Travel" }) })),
      categoryItemRoute.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "retire" }) }), { params: Promise.resolve({ categoryId: "category-a" }) }),
      tagsRoute.GET(),
      tagsRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ name: "Tag" }) })),
      tagItemRoute.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "retire" }) }), { params: Promise.resolve({ tagId: "tag-a" }) }),
      rulesRoute.GET(),
      rulesRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ruleType: "merchant", merchantName: "Cafe", categoryId: "category-a" }) })),
      ruleItemRoute.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ enabled: false }) }), { params: Promise.resolve({ ruleId: "rule-a" }) }),
      settingsRoute.GET(),
      settingsRoute.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ enabled: true }) })),
    ]
    const responses = await Promise.all(requests)
    assert.ok(responses.every((response) => response.status === 401))
    assert.equal(calls.length, 0)
  })

  test("rejects malformed, unknown-field, and invalid route input", async () => {
    const invalidRequests = [
      categoriesRoute.POST(new Request("http://localhost", { method: "POST", body: "{" })),
      categoriesRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ name: "  ", userId: "tenant-b" }) })),
      categoryItemRoute.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "rename", name: "" }) }), { params: Promise.resolve({ categoryId: "category-a" }) }),
      tagsRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ name: "Tag", userId: "tenant-b" }) })),
      tagItemRoute.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "rename" }) }), { params: Promise.resolve({ tagId: "tag-a" }) }),
      rulesRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ruleType: "merchant", merchantName: " ", categoryId: "category-a" }) })),
      rulesRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ruleType: "source_account", accountingConnectionId: "conn-a", categoryId: "category-a" }) })),
      ruleItemRoute.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ enabled: "yes" }) }), { params: Promise.resolve({ ruleId: "rule-a" }) }),
      settingsRoute.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ enabled: true, userId: "tenant-b" }) })),
    ]
    const responses = await Promise.all(invalidRequests)
    assert.ok(responses.every((response) => response.status === 400))
    assert.equal(calls.length, 0)
  })

  test("uses the authenticated tenant for each category, tag, rule, and setting operation", async () => {
    mockUser = { id: "tenant-b" }
    const requests = [
      categoriesRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ name: "Travel" }) })),
      tagsRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ name: "Review" }) })),
      rulesRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ruleType: "merchant", merchantName: "Cafe", categoryId: "category-a" }) })),
      settingsRoute.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ enabled: true }) })),
      categoryItemRoute.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "rename", name: "Trips" }) }), { params: Promise.resolve({ categoryId: "category-a" }) }),
      tagItemRoute.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "retire" }) }), { params: Promise.resolve({ tagId: "tag-a" }) }),
      ruleItemRoute.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ enabled: false }) }), { params: Promise.resolve({ ruleId: "rule-a" }) }),
    ]
    const responses = await Promise.all(requests)
    assert.deepEqual(responses.map(({ status }) => status), [201, 201, 201, 200, 200, 200, 200])
    assert.ok(calls.every(({ userId }) => userId === "tenant-b"))
    assert.deepEqual(calls.map(({ operation }) => operation).sort(), [
      "createCategory", "createRule", "createTag", "renameCategory", "retireTag", "updateRule", "updateSetting",
    ].sort())

    const responseBodies = await Promise.all(responses.map(async (response) => response.json()))
    assert.equal("userId" in responseBodies[0].category, false)
    assert.equal("userId" in responseBodies[1].tag, false)
    assert.equal("userId" in responseBodies[2].rule, false)
    assert.deepEqual(responseBodies[3], { enabled: true })
    assert.equal("userId" in responseBodies[6].rule, false)
  })

  test("supports tenant-scoped resource listing", async () => {
    const responses = await Promise.all([categoriesRoute.GET(), tagsRoute.GET(), rulesRoute.GET(), settingsRoute.GET()])
    assert.ok(responses.every((response) => response.status === 200))
    assert.ok(calls.every(({ userId }) => userId === "tenant-a"))
    assert.deepEqual(calls.map(({ operation }) => operation).sort(), ["getSetting", "listCategories", "listRules", "listTags"])
  })
})
