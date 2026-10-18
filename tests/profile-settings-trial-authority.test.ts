import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

describe("profile settings preserve server-owned trial authority", () => {
  let patch: (request: Request) => Promise<Response>
  let user: { id: string } | null
  let profile: { id: string } | null
  let contexts: string[]
  let bootstrap: string[]
  let updates: unknown[]

  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    })
    await mock.module("@/lib/actions/auth", {
      namedExports: { createUserProfile: async (id: string) => { bootstrap.push(id); profile = { id } } },
    })
    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (id: string, fn: (tx: unknown) => Promise<unknown>) => {
          contexts.push(id)
          return fn({ userProfile: {
            findUnique: async (args: unknown) => {
              assert.deepEqual(args, { where: { userId: "tenant-a" }, select: { id: true } })
              return profile
            },
            update: async (args: { data: { displayName: string } }) => {
              updates.push(args)
              return { displayName: args.data.displayName }
            },
          } })
        },
      },
    })
    ;({ PATCH: patch } = await import("@/app/api/settings/profile/route"))
  })

  beforeEach(() => {
    user = { id: "tenant-a" }
    profile = { id: "profile-a" }
    contexts = []; bootstrap = []; updates = []
  })

  function request(body = JSON.stringify({ displayName: "My organisation" })): Request {
    return new Request("https://paidsoon.test/api/settings/profile", { method: "PATCH", body })
  }

  test("existing profile name edit never bootstraps or writes billing columns", async () => {
    const response = await patch(request())
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { displayName: "My organisation" })
    assert.deepEqual(bootstrap, [])
    assert.deepEqual(contexts, ["tenant-a", "tenant-a"])
    assert.deepEqual(updates, [{ where: { userId: "tenant-a" }, data: { displayName: "My organisation" }, select: { displayName: true } }])
  })

  test("missing profile uses the existing bootstrap then an RLS name update", async () => {
    profile = null
    assert.equal((await patch(request())).status, 200)
    assert.deepEqual(bootstrap, ["tenant-a"])
    assert.equal(updates.length, 1)
  })

  test("unauthenticated requests perform no database or bootstrap work", async () => {
    user = null
    assert.equal((await patch(request())).status, 401)
    assert.deepEqual(contexts, [])
    assert.deepEqual(bootstrap, [])
  })

  test("malformed JSON and attempted authority injection fail before database work", async () => {
    for (const body of ["{", JSON.stringify({ displayName: "Test", subscriptionTier: "business_pro" })]) {
      assert.equal((await patch(request(body))).status, 400)
    }
    assert.deepEqual(contexts, [])
    assert.deepEqual(updates, [])
  })
})