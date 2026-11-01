import "@/tests/helpers/subscriptionAccess"
import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

describe("account settings route", () => {
  let GET: (request?: Request) => Promise<Response>
  let PATCH: (request: Request) => Promise<Response>
  let user: { id: string } | null
  let setting: {
    userId: string
    displayFromDate: Date | string | null
    revision: number
    timeZone: string
  } | null
  let contexts: string[]
  let updates: unknown[]
  let createdSettings: string[]
  let createConflict: boolean
  let lockedRows: Array<{ user_id: string; display_from_date: string | null; revision: number; time_zone: string }>

  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
      },
    })
    await mock.module("@/lib/actions/auth", {
      namedExports: {
        createUserProfile: async (id: string) => {
          createdSettings.push(id)
          setting = {
            userId: id,
            displayFromDate: null,
            revision: 0,
            timeZone: "Australia/Melbourne",
          }
        },
      },
    })
    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (id: string, fn: (tx: unknown) => Promise<unknown>) => {
          contexts.push(id)
          return fn({
            $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
              const sql = strings.join("")
              if (sql.includes("FOR UPDATE") || sql.includes("SELECT user_id") || sql.includes("FROM public.account_display_settings")) {
                if (setting === null) return []
                return [{
                  user_id: setting.userId,
                  display_from_date: setting.displayFromDate ? (typeof setting.displayFromDate === "string" ? setting.displayFromDate : setting.displayFromDate.toISOString().slice(0, 10)) : null,
                  revision: setting.revision,
                  time_zone: setting.timeZone,
                }]
              }
              if (sql.includes("INSERT INTO public.account_display_settings") || sql.includes("ON CONFLICT")) {
                if (createConflict) {
                  const error = new Error("duplicate key") as Error & { code?: string }
                  error.code = "P2002"
                  throw error
                }
                const userId = values[0]
                const dateValue = values[1]
                const revisionValue = values[2]
                const timeZoneValue = values[3]
                setting = {
                  userId: String(userId),
                  displayFromDate: dateValue as string | Date | null,
                  revision: Number(revisionValue),
                  timeZone: String(timeZoneValue),
                }
                return [{ user_id: String(userId), display_from_date: String(dateValue), revision: Number(revisionValue), time_zone: String(timeZoneValue) }]
              }
              return []
            },
            accountDisplaySetting: {
              findUnique: async () => setting,
              create: async (args: { data: { userId: string; displayFromDate: Date | string | null; revision: number; timeZone: string } }) => {
                if (createConflict) {
                  const error = new Error("duplicate key") as Error & { code?: string }
                  error.code = "P2002"
                  throw error
                }
                createdSettings.push(args.data.userId)
                setting = {
                  userId: args.data.userId,
                  displayFromDate: args.data.displayFromDate,
                  revision: args.data.revision,
                  timeZone: args.data.timeZone,
                }
                return setting
              },
              update: async (args: { data: { displayFromDate: string | null; revision: number; timeZone: string } }) => {
                updates.push(args)
                setting = {
                  userId: setting?.userId ?? "tenant-a",
                  displayFromDate: args.data.displayFromDate,
                  revision: args.data.revision,
                  timeZone: args.data.timeZone,
                }
                return setting
              },
            },
          })
        },
      },
    })

    ;({ GET, PATCH } = await import("@/app/api/settings/account/route"))
  })

  beforeEach(() => {
    user = { id: "tenant-a" }
    setting = {
      userId: "tenant-a",
      displayFromDate: null,
      revision: 0,
      timeZone: "Australia/Melbourne",
    }
    contexts = []
    updates = []
    createdSettings = []
    createConflict = false
    lockedRows = []
  })

  test("GET returns the canonical account cutoff payload without writes", async () => {
    const response = await GET()
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      displayFromDate: null,
      revision: 0,
      timeZone: "Australia/Melbourne",
    })
    assert.deepEqual(contexts, ["tenant-a"])
    assert.deepEqual(updates, [])
  })

  test("PATCH applies a valid date and enforces expected revision", async () => {
    const response = await PATCH(new Request("https://paidsoon.test/api/settings/account", {
      method: "PATCH",
      body: JSON.stringify({ displayFromDate: "2026-11-01", expectedRevision: 0 }),
    }))

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      displayFromDate: "2026-11-01",
      revision: 1,
      timeZone: "Australia/Melbourne",
    })
    assert.deepEqual(updates.length, 1)
    assert.equal(contexts.length, 1)
  })

  test("PATCH treats a same-value save as an unchanged no-op", async () => {
    setting = {
      userId: "tenant-a",
      displayFromDate: "2026-11-01",
      revision: 2,
      timeZone: "Australia/Melbourne",
    }

    const response = await PATCH(new Request("https://paidsoon.test/api/settings/account", {
      method: "PATCH",
      body: JSON.stringify({ displayFromDate: "2026-11-01", expectedRevision: 2 }),
    }))

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      displayFromDate: "2026-11-01",
      revision: 2,
      timeZone: "Australia/Melbourne",
    })
    assert.deepEqual(updates, [])
  })

  test("PATCH treats a missing row null clear as a no-op and preserves the row state", async () => {
    setting = null
    const response = await PATCH(new Request("https://paidsoon.test/api/settings/account", {
      method: "PATCH",
      body: JSON.stringify({ displayFromDate: null, expectedRevision: 0 }),
    }))

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      displayFromDate: null,
      revision: 0,
      timeZone: "Australia/Melbourne",
    })
    assert.deepEqual(createdSettings, [])
    assert.deepEqual(updates, [])
  })

  test("PATCH handles a lost insert race as a conflict instead of writing a stale row", async () => {
    setting = null
    createConflict = true

    const response = await PATCH(new Request("https://paidsoon.test/api/settings/account", {
      method: "PATCH",
      body: JSON.stringify({ displayFromDate: "2026-11-01", expectedRevision: 0 }),
    }))

    assert.equal(response.status, 409)
    assert.deepEqual(await response.json(), { error: "Revision conflict" })
    assert.deepEqual(createdSettings, [])
  })

  test("PATCH rejects stale revisions and invalid JSON", async () => {
    const stale = await PATCH(new Request("https://paidsoon.test/api/settings/account", {
      method: "PATCH",
      body: JSON.stringify({ displayFromDate: "2026-11-01", expectedRevision: 99 }),
    }))
    assert.equal(stale.status, 409)

    const invalid = await PATCH(new Request("https://paidsoon.test/api/settings/account", {
      method: "PATCH",
      body: "{",
    }))
    assert.equal(invalid.status, 400)
  })

  test("PATCH rejects unauthenticated requests", async () => {
    user = null
    const response = await PATCH(new Request("https://paidsoon.test/api/settings/account", {
      method: "PATCH",
      body: JSON.stringify({ displayFromDate: "2026-11-01", expectedRevision: 0 }),
    }))
    assert.equal(response.status, 401)
  })
})
