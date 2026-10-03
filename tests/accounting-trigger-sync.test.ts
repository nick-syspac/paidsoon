import { before, beforeEach, afterEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import type { SyncResult } from "@/lib/providers/accounting/sync"

const inlineResult: SyncResult = {
  connectionId: "connection", provider: "xero", status: "success",
  invoicesCreated: 1, invoicesUpdated: 2, invoicesSkipped: 3,
  spendBillsUpserted: 0, spendTransactionsUpserted: 0, spendSuppliersUpserted: 0,
}
let inlineCalls: string[] = []
let requests: { url: string; init?: RequestInit }[] = []
let acknowledgement: unknown = { queued: true, claimId: "claim" }
let ownedConnection: { id: string; provider: string; userId: string; status: string; lastSyncedAt: Date | null } | null = {
  id: "connection", provider: "xero", userId: "owner", status: "pending_first_sync", lastSyncedAt: null,
}
let savedSyncRuns: Record<string, unknown>[] = []
let rlsUsers: string[] = []
let runInsertFails = false
let connectionUpdates: { where: Record<string, unknown>; data: Record<string, unknown> }[] = []
let fetchFailure: "none" | "network" | "http" | "worker-auth" | "malformed-json" = "none"
let trigger: typeof import("@/lib/providers/accounting/triggerSyncNow").triggerSyncNow
const originalUrl = process.env.RAILWAY_WORKER_URL
const originalSecret = process.env.WORKER_TRIGGER_SECRET

describe("production accounting immediate trigger", () => {
  before(async () => {
    await mock.module("@/lib/providers/accounting/sync", {
      namedExports: { syncConnection: async (id: string) => {
        inlineCalls.push(id)
        return inlineResult
      } },
    })
    await mock.module("@/lib/db/withUserContext", {
      namedExports: { withUserContext: async (userId: string, callback: (tx: unknown) => Promise<unknown>) => {
        rlsUsers.push(userId)
        return callback({
          accountingConnection: {
            findFirst: async () => ownedConnection,
            updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
              connectionUpdates.push(args)
              if (
                ownedConnection && ownedConnection.id === args.where.id &&
                ownedConnection.userId === args.where.userId &&
                ownedConnection.status === args.where.status &&
                ownedConnection.lastSyncedAt === args.where.lastSyncedAt
              ) {
                ownedConnection.status = String(args.data.status)
                return { count: 1 }
              }
              return { count: 0 }
            },
          },
          accountingSyncRun: {
            create: async (args: { data: Record<string, unknown> }) => {
              if (runInsertFails) throw new Error("private database detail")
              savedSyncRuns.push(args.data)
              return args.data
            },
          },
        })
      } },
    })
    ;({ triggerSyncNow: trigger } = await import("@/lib/providers/accounting/triggerSyncNow"))
  })
  beforeEach(() => {
    delete process.env.RAILWAY_WORKER_URL
    delete process.env.WORKER_TRIGGER_SECRET
    inlineCalls = []
    requests = []
    acknowledgement = { queued: true, claimId: "claim" }
    ownedConnection = { id: "connection", provider: "xero", userId: "owner", status: "pending_first_sync", lastSyncedAt: null }
    savedSyncRuns = []
    rlsUsers = []
    runInsertFails = false
    connectionUpdates = []
    fetchFailure = "none"
    mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init })
      if (fetchFailure === "network") throw new Error("private network details")
      if (fetchFailure === "http") return new Response("private response body", { status: 503 })
      if (fetchFailure === "worker-auth") return new Response("private response body", { status: 401 })
      if (fetchFailure === "malformed-json") return new Response("not json", { status: 200 })
      return Response.json(acknowledgement)
    })
  })
  afterEach(() => {
    mock.restoreAll()
    if (originalUrl === undefined) delete process.env.RAILWAY_WORKER_URL
    else process.env.RAILWAY_WORKER_URL = originalUrl
    if (originalSecret === undefined) delete process.env.WORKER_TRIGGER_SECRET
    else process.env.WORKER_TRIGGER_SECRET = originalSecret
  })
  for (const settings of ["absent", "url-only", "secret-only"]) {
    test(`runs inline with ${settings} worker configuration`, async () => {
      if (settings === "url-only") process.env.RAILWAY_WORKER_URL = "https://worker.invalid"
      if (settings === "secret-only") process.env.WORKER_TRIGGER_SECRET = "test-secret"
      assert.deepStrictEqual(await trigger("connection", "owner"), inlineResult)
      assert.deepStrictEqual(inlineCalls, ["connection"])
      assert.strictEqual(requests.length, 0)
    })
  }
  test("returns a validated queued acknowledgement without inline work", async () => {
    process.env.RAILWAY_WORKER_URL = "https://worker.invalid/"
    process.env.WORKER_TRIGGER_SECRET = "test-secret"
    assert.deepStrictEqual(await trigger("connection", "owner"), { queued: true, claimId: "claim" })
    assert.deepStrictEqual(inlineCalls, [])
    assert.strictEqual(requests[0].url, "https://worker.invalid/trigger/sync-connection")
    assert.deepStrictEqual(JSON.parse(String(requests[0].init?.body)), {
      accountingConnectionId: "connection", userId: "owner",
    })
    assert.deepStrictEqual(requests[0].init?.headers, {
      "Content-Type": "application/json", Authorization: "Bearer test-secret",
    })
  })
  for (const failure of ["network", "http", "worker-auth", "malformed-json", "invalid-ack"]) {
    test(`records a sanitized failure for ${failure} dispatch errors`, async () => {
      process.env.RAILWAY_WORKER_URL = "https://worker.invalid"
      process.env.WORKER_TRIGGER_SECRET = "test-secret"
      if (failure !== "invalid-ack") fetchFailure = failure
      if (failure === "invalid-ack") acknowledgement = { queued: false, claimId: "claim" }

      const result = await trigger("connection", "owner")
      assert.deepStrictEqual(result, {
        connectionId: "connection", provider: "xero", status: "failed",
        invoicesCreated: 0, invoicesUpdated: 0, invoicesSkipped: 0,
        spendBillsUpserted: 0, spendTransactionsUpserted: 0, spendSuppliersUpserted: 0,
        errorMessage: "worker_dispatch_failed",
      })
      assert.strictEqual(savedSyncRuns.length, 1)
      assert.deepStrictEqual(savedSyncRuns[0], {
        accountingConnectionId: "connection", provider: "xero", userId: "owner",
        startedAt: savedSyncRuns[0].startedAt, completedAt: savedSyncRuns[0].completedAt,
        status: "failed", invoicesCreated: 0, invoicesUpdated: 0, invoicesSkipped: 0,
        errorMessage: "worker_dispatch_failed",
      })
      assert.ok(savedSyncRuns[0].startedAt instanceof Date)
      assert.ok(savedSyncRuns[0].completedAt instanceof Date)
      assert.deepStrictEqual(rlsUsers, ["owner"])
      assert.deepStrictEqual(connectionUpdates, [{
        where: {
          id: "connection", userId: "owner", status: "pending_first_sync", lastSyncedAt: null,
        },
        data: { status: "error" },
      }])
      assert.strictEqual(ownedConnection?.status, "error")
      assert.deepStrictEqual(inlineCalls, [])
      assert.ok(!JSON.stringify(result).includes("private"))
      assert.ok(!JSON.stringify(savedSyncRuns).includes("private"))
    })
  }
  test("does not write a failure row when the connection is not owned", async () => {
    process.env.RAILWAY_WORKER_URL = "https://worker.invalid"
    process.env.WORKER_TRIGGER_SECRET = "test-secret"
    ownedConnection = null
    acknowledgement = { queued: false }
    const result = await trigger("other-connection", "owner")
    assert.strictEqual(result.status, "failed")
    assert.strictEqual(savedSyncRuns.length, 0)
    assert.strictEqual(connectionUpdates.length, 0)
    assert.deepStrictEqual(rlsUsers, ["owner"])
    assert.deepStrictEqual(inlineCalls, [])
  })
  for (const state of [
    { status: "active", lastSyncedAt: null },
    { status: "active", lastSyncedAt: new Date("2026-10-02T00:00:00Z") },
    { status: "error", lastSyncedAt: null },
    { status: "pending_first_sync", lastSyncedAt: new Date("2026-10-01T00:00:00Z") },
    { status: "revoked", lastSyncedAt: null },
    { status: "disconnected", lastSyncedAt: null },
  ]) {
    test(`does not replace newer connection state ${state.status}/${state.lastSyncedAt ? "synced" : "never-synced"}`, async () => {
      process.env.RAILWAY_WORKER_URL = "https://worker.invalid"
      process.env.WORKER_TRIGGER_SECRET = "test-secret"
      ownedConnection = { id: "connection", provider: "myob", userId: "owner", ...state }
      fetchFailure = "http"
      const result = await trigger("connection", "owner")
      assert.strictEqual(result.status, "failed")
      assert.deepStrictEqual(savedSyncRuns.map((row) => row.provider), ["myob"])
      assert.deepStrictEqual(connectionUpdates[0].where, {
        id: "connection", userId: "owner", status: "pending_first_sync", lastSyncedAt: null,
      })
      assert.deepStrictEqual(connectionUpdates[0].data, { status: "error" })
      assert.deepStrictEqual(ownedConnection, { id: "connection", provider: "myob", userId: "owner", ...state })
    })
  }
  test("retains safe failure result when history persistence fails", async () => {
    process.env.RAILWAY_WORKER_URL = "https://worker.invalid"
    process.env.WORKER_TRIGGER_SECRET = "test-secret"
    runInsertFails = true
    fetchFailure = "http"
    const result = await trigger("connection", "owner")
    assert.strictEqual(result.status, "failed")
    assert.strictEqual(result.errorMessage, "worker_dispatch_failed")
    assert.deepStrictEqual(savedSyncRuns, [])
    assert.deepStrictEqual(connectionUpdates, [])
    assert.deepStrictEqual(inlineCalls, [])
  })
})