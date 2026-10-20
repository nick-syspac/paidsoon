import assert from "node:assert/strict"
import { after, before, beforeEach, mock, test } from "node:test"

let scan: typeof import("@/lib/commitguard/workScan")
let route: typeof import("@/app/api/internal/jobs/commitguard/dispatch/route")
let tenants: string[], denied: Set<string>, enabled: boolean, revision: number, date: string
let daily: Map<string, object>, pending: object[], expired: object[], trace: string[], recoveries: string[]
const originalSecret = process.env.INTERNAL_JOBS_SECRET
const secret = "synthetic-internal-secret"

before(async () => {
  await mock.module("@/lib/commitguard/sourceRepair", { namedExports: {
    CommitGuardRepairStateSchema: (await import("zod")).z.object({}).strict(),
    repairCommitGuardSources: async () => {
      trace.push("source-repair")
      return { repairState: {}, repaired: 0, repairFailed: 0 }
    },
  } })
  await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
    commitGuardSetting: { findMany: async ({ where, orderBy, take, select }: {
      where: { enabled: boolean; userId?: { gt: string } }; orderBy: object; take: number; select: object
    }) => {
      assert.deepEqual(select, { userId: true }); assert.equal(where.enabled, true)
      assert.deepEqual(orderBy, { userId: "asc" }); assert.equal(take, 100); trace.push("tenants")
      return tenants.filter(id => !where.userId || id > where.userId.gt).slice(0, take).map(userId => ({ userId }))
    } },
    $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      const text = sql.join("?")
      assert.deepEqual(values, [100]); assert.match(text, /LIMIT \?/)
      assert.doesNotMatch(text, /SELECT \*|imported_bills|accounting_sync_runs|spend_import_batches|subscription/)
      if (text.includes("lease_expires_at <=")) { trace.push("expired"); return expired }
      assert.match(text, /state = 'pending' AND attempts < 6 AND next_attempt_at <=/)
      assert.match(text, /ORDER BY next_attempt_at, id/); trace.push("pending"); return pending
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      trace.push("tx")
      return callback({
        $executeRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
          const text = sql.join("?")
          if (text.includes("pg_advisory_xact_lock")) { trace.push(`lock:${values[0]}`); return 1 }
          if (text.includes("INSERT INTO")) {
            assert.match(text, /ON CONFLICT \(user_id, kind, dedupe_key\) DO NOTHING/)
            assert.match(text, /'daily'/)
            assert.ok(trace.includes(`lock:commitguard:${values[1]}`))
            const key = `${values[1]}:${values[2]}`
            if (!daily.has(key)) daily.set(key, { revision: values[4], date: values[3] })
          } else {
            assert.match(text, /safe_error_code = 'lease_expired'/)
            recoveries.push(values[0] as string)
          }
          return 1
        },
        $queryRaw: async (sql: TemplateStringsArray) => sql.join("").includes("FOR UPDATE")
          ? [{ id: "expired" }] : [{ date }],
        commitGuardSetting: { findUnique: async () => ({ enabled, calculationRevision: revision }) },
      })
    },
  } } })
  await mock.module("@/lib/billing/financialJobAccess", { namedExports: {
    getFinancialJobAccessSkip: async (userId: string, feature: string) => {
      assert.equal(feature, "commitguard_core"); trace.push(`access:${userId}`)
      return denied.has(userId) ? { status: "skipped", reason: "no_access" } : null
    },
  } })
  scan = await import("@/lib/commitguard/workScan")
  route = await import("@/app/api/internal/jobs/commitguard/dispatch/route")
})
beforeEach(() => {
  process.env.INTERNAL_JOBS_SECRET = secret
  tenants = ["a", "b"]; denied = new Set(); enabled = true; revision = 7; date = "2026-10-19"
  daily = new Map(); pending = []; expired = []; trace = []; recoveries = []
})
after(() => {
  if (originalSecret === undefined) delete process.env.INTERNAL_JOBS_SECRET
  else process.env.INTERNAL_JOBS_SECRET = originalSecret
})
test("6.3 actual scanner creates one daily enabled eligible UTC identity, never recreates exhausted generation", async () => {
  denied.add("b")
  await scan.scanCommitGuardWork({}); revision++
  await scan.scanCommitGuardWork({})
  assert.deepEqual([...daily], [["a:daily:2026-10-19", { revision: 7, date: "2026-10-19" }]])
  date = "2026-10-20"; await scan.scanCommitGuardWork({})
  assert.equal(daily.size, 2)
  enabled = false; date = "2026-10-21"; await scan.scanCommitGuardWork({})
  assert.equal(daily.size, 2)
})
test("6.3 bounded keyset daily scan advances beyond denied tenants independently of pending recovery", async () => {
  tenants = Array.from({ length: 101 }, (_, i) => `tenant-${String(i).padStart(3, "0")}`)
  denied = new Set(tenants.slice(0, 100))
  const first = await scan.scanCommitGuardWork({})
  assert.equal(first.dailyCursor, "tenant-099"); assert.equal(daily.size, 0)
  const second = await scan.scanCommitGuardWork({ dailyCursor: first.dailyCursor })
  assert.equal(second.dailyCursor, null); assert.equal(daily.size, 1)
})
test("6.3 lost enqueue is rediscovered, expired recovery independent, safe queue DTO only", async () => {
  tenants = []
  pending = [{ userId: "a", workItemId: "one", kind: "detect", supplier: "private", fence: 99 }]
  expired = [{ userId: "b", workItemId: "expired", kind: "evaluate" }]
  const first = await scan.scanCommitGuardWork({})
  const second = await scan.scanCommitGuardWork({})
  assert.deepEqual(first.jobs, [{ userId: "a", workItemId: "one", kind: "detect" }])
  assert.deepEqual(second.jobs, first.jobs); assert.equal(first.recovered, 1)
  assert.deepEqual(recoveries, ["expired", "expired"])
  assert.ok(trace.indexOf("source-repair") < trace.indexOf("pending"))
  assert.ok(trace.indexOf("expired") < trace.indexOf("pending"))
})
test("6.3 real scan route authenticates before metadata queries and rejects authority overrides", async () => {
  const request = (body: unknown, authorization: string) => new Request("http://localhost/dispatch", {
    method: "POST", headers: { authorization }, body: JSON.stringify(body),
  })
  assert.equal((await route.POST(request({}, "wrong"))).status, 401)
  assert.equal((await route.POST(request({ allowAccess: true }, `Bearer ${secret}`))).status, 400)
  assert.deepEqual(trace, [])
  assert.equal((await route.POST(request({}, `Bearer ${secret}`))).status, 200)
  assert.ok((trace as string[]).includes("tenants"))
})