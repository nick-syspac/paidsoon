import assert from "node:assert/strict"
import { after, before, beforeEach, mock, test } from "node:test"
import type { PrismaTx } from "@/lib/db/withUserContext"
import type { CommitGuardDetectionSource } from "@/lib/commitguard/detectionRequest"

type Kind = CommitGuardDetectionSource["sourceKind"]
type Source = { id: string; userId: string; status: string; completedAt: Date | null;
  invoicesSkipped: number; rowsFailed: number; rowsSkipped: number }
type Work = { state: string; attempts: number; generation: number; sourceId?: string }
let repair: typeof import("@/lib/commitguard/sourceRepair")
let scan: typeof import("@/lib/commitguard/workScan")
let route: typeof import("@/app/api/internal/jobs/commitguard/dispatch/route")
let sources: Record<Kind, Source[]>, work: Map<string, Work>, fail: Set<string>
let date: string, sourceQueries: string[], validated: string[], logs: unknown[][]
let beforeTenant: (() => void) | null
const key = (userId: string, kind: Kind, id: string) => `${userId}:detection:${kind}:${id}`
const fixture = (id: string, kind: Kind, patch: Partial<Source> = {}): Source => ({
  id, userId: "tenant-a", status: kind === "accounting_sync_run" ? "success" : "completed",
  completedAt: new Date("2026-10-19T01:00:00Z"), invoicesSkipped: 0, rowsFailed: 0, rowsSkipped: 0, ...patch,
})
const eligible = (s: Source, kind: Kind) => s.completedAt !== null && (kind === "accounting_sync_run"
  ? s.status === "success" && s.invoicesSkipped === 0
  : s.status === "completed" && s.rowsFailed === 0 && s.rowsSkipped === 0)

function tenantTx(userId: string): PrismaTx {
  const findFirst = (kind: Kind) => async ({ where, select }: {
    where: { id: string; userId: string }; select: object
  }) => {
    // Exercise the real 5.4 helper, including ALL predicates and tenant identity.
    assert.equal(where.userId, userId)
    assert.deepEqual(select, { id: true })
    assert.deepEqual(where, { id: where.id, userId,
      ...(kind === "accounting_sync_run"
        ? { status: "success", completedAt: { not: null }, invoicesSkipped: 0 }
        : { status: "completed", completedAt: { not: null }, rowsFailed: 0, rowsSkipped: 0 }) })
    validated.push(key(userId, kind, where.id))
    return sources[kind].find(s => s.id === where.id && s.userId === userId && eligible(s, kind)) ?? null
  }
  return {
    accountingSyncRun: { findFirst: findFirst("accounting_sync_run") },
    spendImportBatch: { findFirst: findFirst("spend_import_batch") },
    $executeRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      assert.match(sql.join("?"), /pg_advisory_xact_lock/)
      assert.deepEqual(values, [`commitguard:${userId}`]); return 1
    },
    $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      const text = sql.join("?")
      assert.match(text, /INSERT INTO public.commit_guard_work_items/)
      assert.match(text, /\(id, user_id, kind, dedupe_key, source_kind, source_id, calculation_revision, updated_at\)/)
      assert.match(text, /'detect'/); assert.match(text, /ON CONFLICT DO NOTHING/)
      assert.doesNotMatch(text, /DO UPDATE|generation|attempts|fence|lease|state|next_attempt_at/)
      const [id, tenant, dedupeKey, kind, sourceId] = values as string[]
      assert.equal(tenant, userId)
      assert.equal(dedupeKey, `detection:${kind}:${sourceId}`)
      const identity = `${tenant}:${dedupeKey}`
      if (fail.has(identity)) throw new Error("PRIVATE database error supplier/amount/recipient")
      if (work.has(identity)) return []
      work.set(identity, { state: "pending", attempts: 0, generation: 0, sourceId })
      return [{ id }]
    },
  } as unknown as PrismaTx
}

before(async () => {
  mock.method(console, "error", (...args: unknown[]) => { logs.push(args) })
  await mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async (userId: string, callback: (tx: PrismaTx) => Promise<unknown>) => {
      beforeTenant?.()
      return callback(tenantTx(userId))
    },
  } })
  await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
    commitGuardSetting: { findMany: async () => [] },
    $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      const text = sql.join("?")
      if (text.includes("to_char")) return [{ date }]
      if (text.includes("FROM public.commit_guard_work_items\n")) {
        if (text.includes("lease_expires_at")) return []
        return [...work].filter(([, w]) => w.state === "pending").map(([identity]) => ({
          userId: identity.split(":")[0], workItemId: identity, kind: "detect",
        })).slice(0, 100)
      }
      const kind: Kind = text.includes("accounting_sync_runs") ? "accounting_sync_run" : "spend_import_batch"
      sourceQueries.push(kind)
      assert.match(text, /SELECT s.id, s\.("userId"|user_id) AS "userId"/)
      assert.match(text, /s.completed_at IS NOT NULL/)
      assert.match(text, /AND s.id > \?/); assert.match(text, /ORDER BY s.id LIMIT \?/)
      assert.match(text, /NOT EXISTS \(SELECT 1 FROM public.commit_guard_work_items w/)
      assert.match(text, /w.user_id = s\.("userId"|user_id) AND w.kind = 'detect'/)
      assert.ok(text.includes(`w.dedupe_key = 'detection:${kind}:' || s.id`))
      assert.doesNotMatch(text, /w.state|w.generation|w.source_id|supplier|amount|SELECT \*/)
      if (kind === "accounting_sync_run") assert.match(text, /s.status = 'success'.*s.invoices_skipped = 0/)
      else assert.match(text, /s.status = 'completed'.*s.rows_failed = 0 AND s.rows_skipped = 0/)
      const [cursor, limit] = values as [string, number]
      assert.equal(limit, 100)
      return sources[kind].filter(s => s.id > cursor && eligible(s, kind) && !work.has(key(s.userId, kind, s.id)))
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit).map(({ id, userId }) => ({ id, userId }))
    },
  } } })
  repair = await import("@/lib/commitguard/sourceRepair")
  scan = await import("@/lib/commitguard/workScan")
  route = await import("@/app/api/internal/jobs/commitguard/dispatch/route")
})
beforeEach(() => {
  sources = { accounting_sync_run: [], spend_import_batch: [] }; work = new Map(); fail = new Set()
  date = "2026-10-19"; sourceQueries = []; validated = []; logs = []; beforeTenant = null
})
after(() => mock.restoreAll())

test("6.4 repairs committed sources missing canonical work after crash, replay/restart/concurrent scans are idempotent", async () => {
  sources.accounting_sync_run = [fixture("run", "accounting_sync_run")]
  sources.spend_import_batch = [fixture("batch", "spend_import_batch", { userId: "tenant-b" })]
  const results = await Promise.all([repair.repairCommitGuardSources(), repair.repairCommitGuardSources()])
  assert.equal(results.reduce((n, r) => n + r.repaired, 0), 2)
  assert.deepEqual([...work.keys()].sort(), [key("tenant-a", "accounting_sync_run", "run"), key("tenant-b", "spend_import_batch", "batch")])
  assert.equal((await repair.repairCommitGuardSources()).repaired, 0)
  assert.equal(work.size, 2)
})

test("6.4 exact 5.4 eligibility excludes running, partial, failed, incomplete and skipped/failed-row sources", async () => {
  for (const kind of ["accounting_sync_run", "spend_import_batch"] as const) {
    sources[kind] = ["running", "partial", "failed", "uploaded"].map(status => fixture(status, kind, { status }))
    sources[kind].push(fixture("no-completion", kind, { completedAt: null }))
    sources[kind].push(fixture("skipped", kind, kind === "accounting_sync_run" ? { invoicesSkipped: 1 } : { rowsSkipped: 1 }))
    if (kind === "spend_import_batch") sources[kind].push(fixture("failed-rows", kind, { rowsFailed: 1 }))
  }
  assert.equal((await repair.repairCommitGuardSources()).repaired, 0)
  assert.deepEqual(validated, []); assert.equal(work.size, 0)
})

test("6.4 every existing canonical state/generation is preserved, including exhausted and forged-source rows", async () => {
  for (const kind of ["accounting_sync_run", "spend_import_batch"] as const) {
    for (const state of ["pending", "processing", "completed", "skipped", "failed"]) {
      sources[kind].push(fixture(state, kind))
      work.set(key("tenant-a", kind, state), { state, attempts: 6, generation: 4, sourceId: "forged" })
    }
  }
  const original = [...work].map(([k, v]) => [k, { ...v }])
  const first = await repair.repairCommitGuardSources()
  date = "2026-10-20"
  assert.equal((await repair.repairCommitGuardSources(first.repairState)).repaired, 0)
  assert.deepEqual([...work], original); assert.deepEqual(validated, [])
})

test("6.4 noncanonical spoof and another tenant's identical source ID cannot suppress repair", async () => {
  sources.accounting_sync_run = [fixture("run", "accounting_sync_run")]
  work.set("tenant-a:forged-key", { state: "failed", attempts: 6, generation: 0, sourceId: "run" })
  work.set(key("tenant-b", "accounting_sync_run", "run"), { state: "failed", attempts: 6, generation: 0 })
  assert.equal((await repair.repairCommitGuardSources()).repaired, 1)
  assert.ok(work.has(key("tenant-a", "accounting_sync_run", "run")))
})

test("6.4 tenant ownership/completion are revalidated after discovery, concurrent exhausted insertion stays untouched", async () => {
  sources.accounting_sync_run = [fixture("run", "accounting_sync_run")]
  beforeTenant = () => { sources.accounting_sync_run[0].userId = "foreign" }
  assert.equal((await repair.repairCommitGuardSources()).repaired, 0)
  sources.accounting_sync_run[0].userId = "tenant-a"
  beforeTenant = () => { sources.accounting_sync_run[0].status = "partial" }
  assert.equal((await repair.repairCommitGuardSources()).repaired, 0)
  sources.accounting_sync_run[0].status = "success"
  beforeTenant = () => { work.set(key("tenant-a", "accounting_sync_run", "run"), { state: "failed", attempts: 6, generation: 9 }) }
  assert.equal((await repair.repairCommitGuardSources()).repaired, 0)
  assert.deepEqual([...work.values()], [{ state: "failed", attempts: 6, generation: 9 }])
})

test("6.4 independently bounded keysets pass 100 failing first rows without starving either source stream", async () => {
  for (const kind of ["accounting_sync_run", "spend_import_batch"] as const) {
    sources[kind] = Array.from({ length: 201 }, (_, i) => fixture(`source-${String(i).padStart(3, "0")}`, kind))
    for (const s of sources[kind].slice(0, 100)) fail.add(key(s.userId, kind, s.id))
  }
  const first = await repair.repairCommitGuardSources()
  assert.equal(first.repairFailed, 200); assert.equal(first.repaired, 0)
  assert.equal(first.repairState.accountingCursor, "source-099"); assert.equal(first.repairState.importCursor, "source-099")
  const second = await repair.repairCommitGuardSources(first.repairState)
  assert.equal(second.repaired, 200); assert.equal(second.repairState.accountingDone, false)
  const third = await repair.repairCommitGuardSources(second.repairState)
  assert.equal(third.repaired, 2); assert.equal(third.repairState.accountingDone, true); assert.equal(third.repairState.importDone, true)
  assert.equal(sourceQueries.length, 6)
  assert.ok(logs.every(args => JSON.stringify(args) === '["[commitguard] source_repair_failed"]'))
})

test("6.4 completed pass waits for server UTC next day, late completions and failed rows are revisited", async () => {
  sources.spend_import_batch = [fixture("a", "spend_import_batch")]
  fail.add(key("tenant-a", "spend_import_batch", "a"))
  const first = await repair.repairCommitGuardSources()
  fail.clear()
  sources.spend_import_batch.push(fixture("0-late", "spend_import_batch"))
  assert.equal((await repair.repairCommitGuardSources(first.repairState)).repaired, 0)
  assert.equal(sourceQueries.length, 2)
  date = "2026-10-20"
  const next = await repair.repairCommitGuardSources(first.repairState)
  assert.equal(next.repairState.date, date); assert.equal(next.repaired, 2)
})

test("6.4 actual five-minute scanner discovers repaired pending jobs immediately and on lost-enqueue replay", async () => {
  sources.accounting_sync_run = [fixture("run", "accounting_sync_run")]
  const result = await scan.scanCommitGuardWork({})
  assert.equal(result.repaired, 1)
  assert.deepEqual(result.jobs, [{ userId: "tenant-a", workItemId: key("tenant-a", "accounting_sync_run", "run"), kind: "detect" }])
  const next = await scan.scanCommitGuardWork({ repairState: result.repairState })
  assert.equal(next.repaired, 0); assert.deepEqual(next.jobs, result.jobs)
})

test("6.4 real dispatch route rejects malformed repair hints and unauthenticated requests before source queries", async () => {
  const original = process.env.INTERNAL_JOBS_SECRET
  process.env.INTERNAL_JOBS_SECRET = "synthetic-repair-secret"
  const request = (body: unknown, secret = "synthetic-repair-secret") => new Request("http://localhost/dispatch", {
    method: "POST", headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body),
  })
  try {
    assert.equal((await route.POST(request({}, "wrong"))).status, 401)
    for (const repairState of [{ date: "bad" }, { date: "2026-02-30" }, { allowAccess: true }, {
      date, accountingCursor: "x".repeat(201), accountingDone: false, importCursor: null, importDone: false,
    }]) assert.equal((await route.POST(request({ repairState }))).status, 400)
    assert.deepEqual(sourceQueries, [])
    assert.equal((await route.POST(request({}))).status, 200)
  } finally {
    if (original === undefined) delete process.env.INTERNAL_JOBS_SECRET
    else process.env.INTERNAL_JOBS_SECRET = original
  }
})