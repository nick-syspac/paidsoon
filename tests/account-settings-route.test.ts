import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

describe("account settings route", () => {
  let GET: (request?: Request) => Promise<Response>
  let PATCH: (request: Request) => Promise<Response>
  let user: { id: string } | null
  let profile: {
    id: string
    accountDisplayFromDate: Date | string | null
    accountDisplayRevision: number
    accountDisplayTimeZone: string
  } | null
  let contexts: string[]
  let updates: unknown[]

  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
      },
    })
    await mock.module("@/lib/actions/auth", {
      namedExports: {
        createUserProfile: async (id: string) => {
          profile = {
            id,
            accountDisplayFromDate: null,
            accountDisplayRevision: 0,
            accountDisplayTimeZone: "Australia/Melbourne",
          }
        },
      },
    })
    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (id: string, fn: (tx: unknown) => Promise<unknown>) => {
          contexts.push(id)
          return fn({
            userProfile: {
              findUnique: async () => profile,
              update: async (args: { data: { accountDisplayFromDate: string | null; accountDisplayRevision: number; accountDisplayTimeZone: string } }) => {
                updates.push(args)
                profile = {
                  id: profile?.id ?? "profile-a",
                  accountDisplayFromDate: args.data.accountDisplayFromDate,
                  accountDisplayRevision: args.data.accountDisplayRevision,
                  accountDisplayTimeZone: args.data.accountDisplayTimeZone,
                }
                return profile
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
    profile = {
      id: "profile-a",
      accountDisplayFromDate: null,
      accountDisplayRevision: 0,
      accountDisplayTimeZone: "Australia/Melbourne",
    }
    contexts = []
    updates = []
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
    assert.equal(contexts.length, 2)
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
