import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

type QueryResult = Array<{ enabled_source_types: string[] | null }>

let queuedResults: QueryResult[] = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getSpendLeakSourceSettings: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let updateSpendLeakSourceSettings: any

describe("spend leak source settings", () => {
  before(async () => {
    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: async () => queuedResults.shift() ?? [],
          }
          return fn(tx)
        },
      },
    })

    ;({ getSpendLeakSourceSettings, updateSpendLeakSourceSettings } = await import("@/lib/spendleak/sourceSettings"))
  })

  beforeEach(() => {
    queuedResults = []
  })

  test("resolves to default source selection when no settings row exists", async () => {
    queuedResults.push([])

    const settings = await getSpendLeakSourceSettings("user-1")

    assert.deepEqual(settings.enabledSourceTypes, ["bills", "bank_transactions", "suppliers"])
    assert.equal(settings.isDefault, true)
  })

  test("filters invalid stored source entries", async () => {
    queuedResults.push([
      { enabled_source_types: ["bank_transactions", "suppliers", "suppliers", "unknown"] },
    ])

    const settings = await getSpendLeakSourceSettings("user-1")

    assert.deepEqual(settings.enabledSourceTypes, ["bank_transactions", "suppliers"])
    assert.equal(settings.isDefault, false)
  })

  test("falls back to default selection when stored list is empty", async () => {
    queuedResults.push([{ enabled_source_types: [] }])

    const settings = await getSpendLeakSourceSettings("user-1")

    assert.deepEqual(settings.enabledSourceTypes, ["bills", "bank_transactions", "suppliers"])
    assert.equal(settings.isDefault, false)
  })

  test("returns normalized selection after update", async () => {
    queuedResults.push([{ enabled_source_types: ["bills", "suppliers", "suppliers"] }])

    const settings = await updateSpendLeakSourceSettings("user-1", ["bills", "suppliers", "suppliers"])

    assert.deepEqual(settings.enabledSourceTypes, ["bills", "suppliers"])
    assert.equal(settings.isDefault, false)
  })
})
