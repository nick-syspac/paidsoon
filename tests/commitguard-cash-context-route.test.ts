import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"
import type { CommitGuardCashContextRecord } from "@/lib/commitguard/cashContext"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"

const now = new Date("2026-01-05T12:00:00Z")
const balance = { amountCents: -12500, currency: "aud", balanceAsOf: "2026-01-01" }
const empty = (): CommitGuardCashContextRecord => ({
  amountCents: null, currency: null, balanceAsOf: null,
  weeklyOperatingExpensesCents: null, weeklyExpensesCurrency: null,
  weeklyExpensesAsOf: null, taxProtectionCurrency: null, revision: 0,
})
interface State {
  cash: CommitGuardCashContextRecord | null
  calculationRevision: number
  audits: Array<Record<string, unknown>>
  work: Array<{ sql: string; values: unknown[] }>
}
interface Call { tenant: string; op: string; args?: unknown }
let states: Map<string, State>
let locks: Map<string, Promise<void>>
let calls: Call[]
let user: { id: string } | null
let authError = false
let core = true
let subscription = true
let failure: string | null
let logs: unknown[][]
let GET: typeof import("@/app/api/commitguard/cash-context/route").GET
let PUT: typeof import("@/app/api/commitguard/cash-context/route").PUT
let save: typeof import("@/lib/commitguard/cashContextMutation").saveCommitGuardCashContext

function state(tenant = "tenant-a"): State {
  if (!states.has(tenant)) states.set(tenant, { cash: null, calculationRevision: 0, audits: [], work: [] })
  return states.get(tenant)!
}

/** Transaction double with rollback and a tenant advisory-lock queue, not a service stub. */
async function transaction<T>(tenant: string, fn: (tx: object) => Promise<T>): Promise<T> {
  let staged: State | null = null
  let release: (() => void) | undefined
  const current = (): State => staged ?? state(tenant)
  const call = (op: string, args?: unknown): void => { calls.push({ tenant, op, args }) }
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      assert.match(strings.join("?"), /pg_advisory_xact_lock/)
      assert.deepEqual(values, [`commitguard:${tenant}`])
      call("tenant-lock", values)
      const previous = locks.get(tenant) ?? Promise.resolve()
      locks.set(tenant, new Promise<void>((resolve) => { release = resolve }))
      await previous
      staged = structuredClone(state(tenant))
      return 1
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      assert.ok(staged, "writes/row locks must follow the advisory lock")
      const sql = strings.join("?").replace(/\s+/g, " ").trim()
      if (sql.startsWith("SELECT revision")) {
        assert.match(sql, /WHERE user_id = \? FOR UPDATE/)
        assert.deepEqual(values, [tenant])
        call("cash-row-lock")
        return current().cash ? [{ revision: current().cash!.revision }] : []
      }
      assert.match(sql, /RETURNING id$/)
      assert.equal(values[1], tenant)
      if (sql.includes("INSERT INTO public.commit_guard_cash_contexts")) {
        call("cash-insert", { sql, values })
        if (failure === "P2002") throw { code: "P2002" }
        if (failure === "23505") throw { code: "P2010", meta: { code: "23505" } }
        if (failure === "adapter-23505") throw { code: "P2010", meta: {
          driverAdapterError: { name: "DriverAdapterError", cause: {
            kind: "UniqueConstraintViolation", originalCode: "23505",
          } },
        } }
        if (failure === "permission") throw { code: "P2010", meta: { code: "42501" } }
        current().cash = {
          amountCents: values[2] as number | null, currency: values[3] as string | null,
          balanceAsOf: values[4] as Date | null,
          weeklyOperatingExpensesCents: values[5] as number | null,
          weeklyExpensesCurrency: values[6] as string | null,
          weeklyExpensesAsOf: values[7] as Date | null,
          taxProtectionCurrency: values[8] as string | null, revision: values[9] as number,
        }
      } else {
        assert.match(sql, /INSERT INTO public.commit_guard_work_items/)
        const columns = sql.slice(sql.indexOf("("), sql.indexOf(")") + 1)
        assert.equal(columns, "(id, user_id, kind, dedupe_key, source_kind, calculation_revision, updated_at)")
        call("work-insert", { sql, values })
        if (failure === "work") throw new Error("sensitive 987654 USD")
        current().work.push({ sql, values })
      }
      return [{ id: "internal-id" }]
    },
    commitGuardCashContext: {
      findUnique: async (args: { where: { userId: string }; select: Record<string, boolean> }) => {
        assert.equal(args.where.userId, tenant)
        assert.deepEqual(Object.keys(args.select).sort(), [...Object.keys(empty())].sort())
        call("cash-read", args)
        if (failure === "read") throw new Error("sensitive 987654 USD")
        // Include private fields to verify DTO projection even with a permissive mock.
        return current().cash && { ...current().cash, userId: tenant, id: "private", leaseOwner: "secret" }
      },
      updateMany: async (args: { where: { userId: string; revision: number }; data: CommitGuardCashContextRecord }) => {
        assert.equal(args.where.userId, tenant)
        call("cash-update", args)
        if (failure === "cas") return { count: 0 }
        assert.equal(args.where.revision, current().cash?.revision)
        current().cash = args.data
        return { count: 1 }
      },
    },
    commitGuardSetting: {
      upsert: async (args: { where: { userId: string }; create: object; update: object; select: object }) => {
        assert.deepEqual(args, {
          where: { userId: tenant }, create: { userId: tenant, calculationRevision: 1 },
          update: { calculationRevision: { increment: 1 } }, select: { calculationRevision: true },
        })
        call("settings-increment")
        if (failure === "settings") throw new Error("sensitive 987654 USD")
        return { calculationRevision: ++current().calculationRevision }
      },
    },
    commitmentEvent: {
      create: async (args: { data: Record<string, unknown>; select: object }) => {
        assert.equal(args.data.userId, tenant)
        assert.equal(args.data.actorId, tenant)
        assert.deepEqual(args.select, { id: true })
        call("audit", args)
        if (failure === "audit") throw new Error("sensitive 987654 USD")
        current().audits.push(args.data)
        return { id: "audit-id" }
      },
    },
  }
  try {
    const result = await fn(tx)
    if (staged) states.set(tenant, staged)
    return result
  } finally {
    release?.()
  }
}

function request(input?: unknown, query = ""): Request {
  return new Request(`http://localhost/api/commitguard/cash-context${query}`, input === undefined ? {} : {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  })
}

describe("CommitGuard cash-context route and real transactional mutation", () => {
  before(async () => {
    await mock.module("@/lib/db/withUserContext", { namedExports: { withUserContext: transaction } })
    await mock.module("@/lib/supabase/server", { namedExports: {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: authError }) } }),
    } })
    await mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: {
      getEffectiveAccess: async () => resolveEffectiveAccess({
        profile: {
          subscriptionStatus: subscription ? "active" : "cancelled", subscriptionTier: "business_pro",
          stripeSubscriptionId: subscription ? "sub_test" : null, trialEndsAt: null, billingAccessVersion: 1,
        }, grant: null, billingRisks: [],
      }, now),
    } })
    await mock.module("@/lib/billing", { namedExports: {
      requireFeature: async (tenant: string, feature: string) => {
        assert.equal(tenant, user?.id)
        assert.equal(feature, "commitguard_core", "no Tax Buffer/detection/advanced entitlement dependency")
        return core
      },
    } })
    ;({ GET, PUT } = await import("@/app/api/commitguard/cash-context/route"))
    ;({ saveCommitGuardCashContext: save } = await import("@/lib/commitguard/cashContextMutation"))
  })
  beforeEach(() => {
    states = new Map(); locks = new Map(); calls = []; logs = []
    user = { id: "tenant-a" }; authError = false; core = true; subscription = true; failure = null
    mock.method(console, "error", (...args: unknown[]) => { logs.push(args) })
  })

  test("GET/PUT reject unauthenticated and invalid sessions before transaction access", async () => {
    for (const invalid of ["missing", "error"]) {
      user = invalid === "missing" ? null : { id: "tenant-a" }; authError = invalid === "error"
      assert.equal((await GET(request())).status, 401)
      assert.equal((await PUT(request({ expectedRevision: 0, ...balance }))).status, 401)
    }
    assert.deepEqual(calls, [])
  })

  test("GET/PUT independently enforce current subscription and core feature access", async () => {
    for (const denied of ["subscription", "core"]) {
      subscription = denied !== "subscription"; core = denied !== "core"
      assert.equal((await GET(request())).status, 403)
      assert.equal((await PUT(request({ expectedRevision: 0, ...balance }))).status, 403)
    }
    assert.deepEqual(calls, [])
  })

  test("strict validation rejects malformed, foreign identity, partial clear, unsupported and unsafe inputs", async () => {
    for (const input of [
      null, {}, { expectedRevision: -1 }, { expectedRevision: "0" },
      { expectedRevision: 0, userId: "tenant-b" }, { expectedRevision: 0, state: "completed" },
      { expectedRevision: 0, amountCents: null },
      { expectedRevision: 0, ...balance, currency: "jpy" },
      { expectedRevision: 0, ...balance, amountCents: 2_147_483_648 },
      { expectedRevision: 0, ...balance, amountCents: 1.5 },
      { expectedRevision: 0, ...balance, balanceAsOf: "9999-01-01" },
      { expectedRevision: 0, weeklyOperatingExpensesCents: -1, weeklyExpensesCurrency: "aud", weeklyExpensesAsOf: "2026-01-01" },
    ]) assert.equal((await PUT(request(input))).status, 400)
    assert.equal((await PUT(new Request("http://localhost/api/commitguard/cash-context", { method: "PUT", body: "{" }))).status, 400)
    assert.equal((await GET(request(undefined, "?userId=tenant-b"))).status, 400)
    assert.equal((await PUT(request({ expectedRevision: 0 }, "?revision=0"))).status, 400)
    assert.deepEqual(calls, [])
    assert.deepEqual(logs, [])
  })

  test("GET is a read-only safe DTO, including missing context without default settings writes", async () => {
    for (const cash of [null, { ...empty(), amountCents: 0, currency: "cad", balanceAsOf: new Date("2026-01-01"), revision: 3 }]) {
      state().cash = cash
      const res = await GET(request())
      assert.equal(res.status, 200)
      const dto = (await res.json()).cashContext
      assert.equal(dto.amountCents, cash?.amountCents ?? null)
      assert.equal(dto.revision, cash?.revision ?? 0)
      assert.equal(dto.source, "owner_entered")
      for (const key of ["id", "userId", "leaseOwner", "createdAt", "expectedRevision"]) assert.equal(key in dto, false)
    }
    assert.ok(calls.every((call) => call.op === "cash-read"))
    assert.equal(state().calculationRevision, 0)
    assert.deepEqual(state().audits, [])
    assert.deepEqual(state().work, [])
  })

  test("PUT creates atomically, emits only changed-field names and uses safe INSERT/RETURNING columns", async () => {
    const res = await PUT(request({ expectedRevision: 0, ...balance }))
    assert.equal(res.status, 200)
    const dto = (await res.json()).cashContext
    assert.equal(dto.revision, 1)
    assert.equal(dto.amountCents, -12500)
    assert.equal("userId" in dto, false)
    assert.equal("expectedRevision" in dto, false)
    assert.equal(state().calculationRevision, 1)
    assert.deepEqual(state().audits, [{
      userId: "tenant-a", actorId: "tenant-a", eventType: "COMMITGUARD_CASH_CONTEXT_UPDATED",
      title: "Cash context updated", message: "Owner-attested cash inputs changed",
      metadata: { changedFields: ["amountCents", "currency", "balanceAsOf"] },
    }])
    assert.deepEqual(state().work[0].values.slice(1), ["tenant-a", "evaluation:1", 1])
    assert.deepEqual(calls.map((call) => call.op), [
      "tenant-lock", "cash-row-lock", "cash-read", "cash-insert", "settings-increment", "work-insert", "audit",
    ])
    const insert = calls.find((call) => call.op === "cash-insert")!.args as { sql: string }
    assert.doesNotMatch(insert.sql, /created_at/)
    assert.match(insert.sql, /RETURNING id$/)
    assert.deepEqual(logs, [])
  })

  test("cash changes and clear preserve independently tagged expenses and tax attestation", async () => {
    await save("tenant-a", { expectedRevision: 0, ...balance, currency: "aud",
      weeklyOperatingExpensesCents: 20000, weeklyExpensesCurrency: "aud", weeklyExpensesAsOf: "2026-01-01",
      taxProtectionCurrency: "nzd" }, now)
    await save("tenant-a", { expectedRevision: 1, ...balance, currency: "usd" }, now)
    assert.equal(state().cash?.weeklyExpensesCurrency, "aud")
    const cleared = await save("tenant-a", { expectedRevision: 2, amountCents: null, currency: null, balanceAsOf: null }, now)
    assert.equal(cleared.amountCents, null)
    assert.equal(cleared.freshness, "missing")
    assert.equal(cleared.weeklyOperatingExpensesCents, 20000)
    assert.equal(cleared.weeklyExpensesCurrency, "aud")
    assert.equal(cleared.taxProtectionCurrency, "nzd")
    assert.equal(cleared.revision, 3)
    const expenseClear = await save("tenant-a", { expectedRevision: 3,
      weeklyOperatingExpensesCents: null, weeklyExpensesCurrency: null, weeklyExpensesAsOf: null }, now)
    assert.equal(expenseClear.weeklyOperatingExpensesCents, null)
    assert.equal(expenseClear.taxProtectionCurrency, "nzd")
  })

  test("stale revision and conditional-update race return 409 with no durable changes", async () => {
    await save("tenant-a", { expectedRevision: 0, ...balance, currency: "aud" }, now)
    const before = structuredClone(state())
    assert.equal((await PUT(request({ expectedRevision: 0, amountCents: null, currency: null, balanceAsOf: null }))).status, 409)
    failure = "cas"
    assert.equal((await PUT(request({ expectedRevision: 1, ...balance, amountCents: 0 }))).status, 409)
    assert.deepEqual(state(), before)
  })

  test("initial P2002 and raw Postgres unique races translate to 409, never 500", async () => {
    for (failure of ["P2002", "23505", "adapter-23505"]) {
      const res = await PUT(request({ expectedRevision: 0, ...balance }))
      assert.equal(res.status, 409)
      assert.deepEqual(state(), { cash: null, calculationRevision: 0, audits: [], work: [] })
    }
    assert.deepEqual(logs, [])
  })

  test("permission failures are not mislabeled revision conflicts or bypassed", async () => {
    failure = "permission"
    const res = await PUT(request({ expectedRevision: 0, ...balance }))
    assert.equal(res.status, 500)
    assert.deepEqual(await res.json(), { error: "Internal server error" })
    assert.equal(state().cash, null)
    assert.deepEqual(state().work, [])
  })

  test("revision overflow conflicts before writes and date-only reattestation audits only the date", async () => {
    state().cash = { ...empty(), amountCents: -12500, currency: "aud",
      balanceAsOf: new Date("2026-01-01"), revision: 2_147_483_647 }
    assert.equal((await PUT(request({ expectedRevision: 2_147_483_647, ...balance, amountCents: 0 }))).status, 409)
    assert.deepEqual(state().work, [])
    state().cash!.revision = 1
    await save("tenant-a", { expectedRevision: 1, ...balance, currency: "aud", balanceAsOf: "2026-01-02" }, now)
    assert.deepEqual(state().audits[0].metadata, { changedFields: ["balanceAsOf"] })
    assert.equal(state().cash?.revision, 2)
  })

  test("competing initial PUTs and existing-row PUTs produce exactly one winner per revision", async () => {
    for (const expectedRevision of [0, 1]) {
      const responses = await Promise.all([
        PUT(request({ expectedRevision, ...balance, amountCents: 100 + expectedRevision })),
        PUT(request({ expectedRevision, ...balance, amountCents: 200 + expectedRevision })),
      ])
      assert.deepEqual(responses.map((res) => res.status).sort(), [200, 409])
      assert.equal(state().cash?.revision, expectedRevision + 1)
      assert.equal(state().calculationRevision, expectedRevision + 1)
      assert.equal(state().audits.length, expectedRevision + 1)
      assert.equal(state().work.length, expectedRevision + 1)
    }
  })

  test("no-op preserves revision with no audit/work/settings creation, but stale no-op conflicts", async () => {
    await save("tenant-a", { expectedRevision: 0, amountCents: null, currency: null, balanceAsOf: null }, now)
    assert.equal(state().cash, null)
    await save("tenant-a", { expectedRevision: 0, ...balance, currency: "aud" }, now)
    const before = structuredClone(state())
    await save("tenant-a", { expectedRevision: 1, ...balance, currency: "aud" }, now)
    await save("tenant-a", { expectedRevision: 1 }, now)
    assert.deepEqual(state(), before)
    assert.equal((await PUT(request({ expectedRevision: 0 }))).status, 409)
  })

  test("settings, enqueue and audit failures roll back create/update, revision, work and audit", async () => {
    for (const existing of [false, true]) {
      if (existing) await save("tenant-a", { expectedRevision: 0, ...balance, currency: "aud" }, now)
      const before = structuredClone(state())
      for (failure of ["settings", "work", "audit"]) {
        const res = await PUT(request({ expectedRevision: existing ? 1 : 0, ...balance, amountCents: 987654 }))
        assert.equal(res.status, 500)
        assert.deepEqual(await res.json(), { error: "Internal server error" })
        assert.deepEqual(state(), before)
      }
      failure = null
    }
    assert.ok(logs.length > 0)
    assert.doesNotMatch(JSON.stringify(logs), /987654|USD|tenant-a/)
  })

  test("tenant-scoped real mutations cannot change another tenant's balance or work", async () => {
    await save("tenant-b", { expectedRevision: 0, ...balance, currency: "cad" }, now)
    const other = structuredClone(state("tenant-b"))
    await save("tenant-a", { expectedRevision: 0, ...balance, currency: "usd" }, now)
    assert.deepEqual(state("tenant-b"), other)
    assert.equal(state("tenant-a").cash?.currency, "usd")
  })

  test("read errors are safe 500s rather than fabricated missing context or financial logs", async () => {
    failure = "read"
    const res = await GET(request())
    assert.equal(res.status, 500)
    assert.deepEqual(await res.json(), { error: "Internal server error" })
    assert.doesNotMatch(JSON.stringify(logs), /987654|USD/)
  })
})