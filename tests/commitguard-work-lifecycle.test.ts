import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { before, beforeEach, mock, test } from "node:test"

let lifecycle: typeof import("@/lib/commitguard/workLifecycle")
let route: typeof import("@/app/api/admin/tenants/[id]/commitguard/retry/route")
const identity = { userId: "tenant", workItemId: "work", kind: "detect" as const,
  leaseOwner: "owner", fence: 3, expectedCalculationRevision: 9 }
let now: Date, work: { state: string; attempts: number; fence: number; owner: string | null;
  expiry: Date | null; next: Date; generation: number; history: unknown[]; reason: string | null }
let trace: string[], authorized: boolean, sessionCurrent: boolean
class SyntheticAdminGuardError extends Error { readonly code = "insufficient_role" }

before(async () => {
  await mock.module("@/lib/admin/guard", { namedExports: {
    AdminGuardError: SyntheticAdminGuardError,
    requireAdminElevation: async (options: object) => {
      assert.deepEqual(options, { minRole: "platform_admin" })
      if (!authorized) throw new SyntheticAdminGuardError("denied")
      return { userId: "admin", adminSession: { id: "session" } }
    },
  } })
  await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      trace = []
      return callback({
        $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
          const text = sql.join("?")
          if (text.includes("FOR UPDATE")) {
            assert.deepEqual(trace, ["tenant"]); trace.push("work")
            assert.deepEqual(values, ["work", "tenant"]); return [{ id: "work" }]
          }
          assert.match(text, /attempt_history = coalesce\(attempt_history, '\[\]'::jsonb\)/)
          assert.deepEqual(trace, ["tenant", "work"])
          assert.match(text, /generation = generation \+ 1, attempts = 0/)
          assert.match(text, /state = 'failed' AND generation = \?/)
          assert.match(text, /s.revoked_at IS NULL AND s.expires_at > \(clock_timestamp/)
          assert.match(text, /r.role IN \('platform_admin', 'platform_owner'\)/)
          // jsonb_build_object is variadic "any": adapter-pg requires explicit
          // parameter types even though these strings recur in WHERE clauses.
          assert.match(text, /'actorUserId', \?::text, 'adminSessionId', \?::text/)
          assert.doesNotMatch(text, /SET[\s\S]*dedupe_key =|SET[\s\S]*calculation_revision =|SET[\s\S]*fence =/)
          assert.deepEqual(values.slice(0, 4), ["admin", "session", "work", "tenant"])
          if (work.state !== "failed" || work.generation !== values[4] || !sessionCurrent || work.fence >= 2147483647) return []
          work.history.push({ generation: work.generation, attempts: work.attempts, reason: work.reason })
          work.generation++; work.attempts = 0; work.state = "pending"; work.reason = null
          return [{ id: "work" }]
        },
        $executeRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
          const text = sql.join("?")
          if (text.includes("pg_advisory_xact_lock")) {
            assert.deepEqual(values, ["commitguard:tenant"]); trace.push("tenant"); return 1
          }
          assert.deepEqual(trace, ["tenant", "work"])
          assert.doesNotMatch(text, /now\(\)|CURRENT_TIMESTAMP|\$executeRawUnsafe/)
          if (text.includes("safe_error_code = 'lease_expired'")) {
            assert.match(text, /state = 'processing' AND lease_expires_at <= \(clock_timestamp/)
            if (!(work.state === "processing" && work.expiry! <= now) && !(work.state === "pending" && work.attempts >= 6)) return 0
            work.state = work.attempts >= 6 ? "failed" : "pending"
            work.reason = "lease_expired"
            work.next = new Date(now.getTime() + lifecycle.commitGuardRetrySeconds(work.attempts) * 1000)
          } else {
            assert.match(text, /AND state = 'processing' AND lease_owner = \? AND fence = \?/)
            assert.match(text, /AND lease_expires_at > \(clock_timestamp/)
            assert.deepEqual(values.slice(7), ["work", "tenant", "detect", "owner", 3])
            if (work.state !== "processing" || work.owner !== values[10] || work.fence !== values[11] || work.expiry! <= now) return 0
            const deferred = values[1]
            work.state = values[0] ? "skipped" : !deferred && work.attempts >= 6 ? "failed" : "pending"
            if (deferred) work.attempts--
            work.next = new Date(now.getTime() + (deferred ? 300 : lifecycle.commitGuardRetrySeconds(work.attempts)) * 1000)
            work.reason = values[6] as string
          }
          work.owner = null; work.expiry = null; return 1
        },
      })
    },
  } } })
  lifecycle = await import("@/lib/commitguard/workLifecycle")
  route = await import("@/app/api/admin/tenants/[id]/commitguard/retry/route")
})
beforeEach(() => {
  now = new Date("2026-10-19T12:00:00Z"); trace = []; authorized = true; sessionCurrent = true
  work = { state: "processing", attempts: 1, fence: 3, owner: "owner", expiry: new Date(now.getTime() + 60_000),
    next: now, generation: 0, history: [], reason: null }
})

test("6.3 actual retry delays are exponential and bounded", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(lifecycle.commitGuardRetrySeconds), [60, 120, 240, 480, 960, 1920])
})
test("6.3 explicit defer releases lease, refunds claim, and delays discovery without success", async () => {
  work.attempts = 6
  await lifecycle.settleCommitGuardWork(identity, "deferred")
  assert.equal(work.state, "pending"); assert.equal(work.attempts, 5)
  assert.equal(work.next.getTime(), now.getTime() + 300_000)
  assert.equal(work.owner, null); assert.equal(work.reason, "evaluation_pipeline_pending")
})
test("6.3 execution failure exhausts exactly sixth attempt, never auto-resets generation", async () => {
  for (let attempt = 1; attempt <= 6; attempt++) {
    work.attempts = attempt; work.state = "processing"; work.owner = "owner"; work.expiry = new Date(now.getTime() + 60_000)
    await lifecycle.settleCommitGuardWork(identity, "execution_failed")
    assert.equal(work.state, attempt === 6 ? "failed" : "pending")
    assert.equal(work.attempts, attempt); assert.equal(work.generation, 0)
  }
})
test("6.3 stale owners/fences and expired lease cannot settle or resurrect successor", async () => {
  for (const invalidate of [() => { work.fence++ }, () => { work.owner = "replacement" },
    () => { work.expiry = now }, () => { work.state = "completed" }]) {
    work.state = "processing"; work.fence = 3; work.owner = "owner"; work.expiry = new Date(now.getTime() + 60_000)
    invalidate(); const before = structuredClone(work)
    await lifecycle.settleCommitGuardWork(identity, "deferred")
    assert.deepEqual(work, before)
  }
})
test("6.3 expired lease recovers with backoff and six-attempt recovery fails safely", async () => {
  await lifecycle.recoverCommitGuardWork(identity)
  assert.equal(work.state, "processing", "unexpired lease untouched")
  work.expiry = now
  await lifecycle.recoverCommitGuardWork(identity)
  assert.equal(work.state, "pending"); assert.equal(work.next.getTime(), now.getTime() + 60_000)
  work.state = "processing"; work.attempts = 6; work.expiry = now
  await lifecycle.recoverCommitGuardWork(identity)
  assert.equal(work.state, "failed"); assert.equal(work.reason, "lease_expired")
  const failed = structuredClone(work)
  await lifecycle.recoverCommitGuardWork(identity)
  assert.deepEqual(work, failed)
})
test("6.3 retry requires elevation, current session, failed state, matching generation; history retained", async () => {
  const request = { userId: "tenant", workItemId: "work", expectedGeneration: 0 }
  authorized = false
  await assert.rejects(lifecycle.retryCommitGuardWork(request), /denied/)
  assert.deepEqual(trace, [])
  authorized = true
  assert.equal(await lifecycle.retryCommitGuardWork(request), false)
  work.state = "failed"; work.attempts = 6; work.reason = "execution_failed"
  sessionCurrent = false
  assert.equal(await lifecycle.retryCommitGuardWork(request), false)
  sessionCurrent = true
  assert.equal(await lifecycle.retryCommitGuardWork(request), true)
  assert.equal(work.generation, 1); assert.equal(work.attempts, 0); assert.equal(work.fence, 3)
  assert.deepEqual(work.history, [{ generation: 0, attempts: 6, reason: "execution_failed" }])
  assert.equal(await lifecycle.retryCommitGuardWork(request), false)
  work.state = "failed"; work.attempts = 6; work.reason = "lease_expired"
  assert.equal(await lifecycle.retryCommitGuardWork({ ...request, expectedGeneration: 1 }), true)
  assert.equal(work.history.length, 2)
})

test("6.3 actual retry route rejects tenant/authority overrides and returns safe conflict/pending DTOs", async () => {
  const request = (body: unknown) => new Request("http://localhost/retry", {
    method: "POST", body: JSON.stringify(body),
  })
  const context = { params: Promise.resolve({ id: "tenant" }) }
  assert.equal((await route.POST(request({ workItemId: "work", expectedGeneration: 0, userId: "foreign" }), context)).status, 400)
  assert.deepEqual(trace, [])
  authorized = false
  const denied = await route.POST(request({ workItemId: "work", expectedGeneration: 0 }), context)
  assert.equal(denied.status, 403); assert.deepEqual(await denied.json(), { error: "Unauthorized" })
  assert.deepEqual(trace, []); authorized = true
  const conflict = await route.POST(request({ workItemId: "work", expectedGeneration: 0 }), context)
  assert.equal(conflict.status, 409); assert.deepEqual(await conflict.json(), { status: "not_retryable" })
  work.state = "failed"; work.attempts = 6
  const response = await route.POST(request({ workItemId: "work", expectedGeneration: 0 }), context)
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: "pending" })
})

test("6.3 canonical and targeted SQL reserve daily identity and keep protected lifecycle fields private", () => {
  for (const path of ["../prisma/rls-policies.sql", "../prisma/rls-commitguard-policies.sql"]) {
    const sql = readFileSync(new URL(path, import.meta.url), "utf8")
    const policy = sql.slice(sql.indexOf('CREATE POLICY "commitguard work insert pending own"'))
      .split(";")[0]
    assert.match(policy, /source_kind <> 'daily' AND dedupe_key NOT LIKE 'daily:%'/)
    assert.match(policy, /attempts = 0 AND fence = 0 AND generation = 0/)
    const grants = [...sql.matchAll(/GRANT[^;]+ON (?:TABLE )?public\.commit_guard_work_items[^;]+;/g)].map(match => match[0])
    assert.equal(grants.length, 2)
    assert.doesNotMatch(grants.join("\n"), /UPDATE|DELETE|lease_owner|lease_expires_at|attempt_history|generation|fence/)
  }
})