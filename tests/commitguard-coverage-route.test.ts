import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import type { CoverageRecord } from "@/lib/commitguard/coverage"

const now = new Date("2026-10-19T12:00:00Z")
const input = { commitmentId: "commitment", occurrenceDate: "2026-10-19", currency: "aud" as const, coveredCents: 6000,
  target: { kind: "tax_reserve_category" as const, id: "tax" } }
function seed(tenant: string) {
  return { coverage: [] as CoverageRecord[], revision: 0, work: [] as unknown[][], audits: [] as unknown[],
    commitments: [{ id: "commitment", userId: tenant, name: "Synthetic", category: "tax", amountCents: 10000,
      currency: "aud", frequency: "one_off", confidence: "confirmed", status: "active", archivedAt: null,
      nextDueDate: new Date("2026-10-19Z"), startDate: null, endDate: null }],
    categories: [{ id: "tax", userId: tenant, categoryType: "custom", name: "Synthetic", enabled: true,
      calculationMethod: "manual", manualAmountCents: 12000, ratePercent: null, fixedAmountCents: null, updatedAt: now }],
    bills: [{ id: "bill", userId: tenant, amountCents: 10000, currency: "aud", status: "open", paidDate: null,
      rawSourceData: { AmountDue: 100 }, accountingConnection: { userId: tenant, provider: "xero" } }],
    attributions: [{ importedBillId: "bill", reserveCategoryId: "tax", status: "open" }],
  }
}
type State = ReturnType<typeof seed>
let states: Map<string, State>
let queues: Map<string, Promise<void>>
let calls: string[]
let user: { id: string } | null
let authError: boolean
let core: boolean
let subscription: boolean
let tax: boolean
let failure: string | null
let routes: typeof import("@/app/api/commitguard/coverage/route")
let services: typeof import("@/lib/commitguard/coverageService")
function state(tenant = "a"): State {
  if (!states.has(tenant)) states.set(tenant, seed(tenant))
  return states.get(tenant)!
}
async function transaction<T>(tenant: string, fn: (tx: object) => Promise<T>): Promise<T> {
  calls.push(`transaction:${tenant}`)
  let staged = structuredClone(state(tenant))
  let release: (() => void) | undefined
  const own = (args: { where: { userId?: string } }): void => { assert.equal(args.where.userId, tenant) }
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      assert.match(strings.join("?"), /pg_advisory_xact_lock/)
      assert.deepEqual(values, [`commitguard:${tenant}`])
      const previous = queues.get(tenant) ?? Promise.resolve()
      queues.set(tenant, new Promise<void>((resolve) => { release = resolve }))
      await previous
      staged = structuredClone(state(tenant)); calls.push("tenant-lock")
      return 1
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      assert.ok(release, "write/row locks must follow tenant lock")
      const sql = strings.join("?").replace(/\s+/g, " ").trim()
      if (sql.startsWith("SELECT id")) { assert.deepEqual(values, [tenant]); assert.match(sql, /FOR SHARE$/); calls.push("source-lock"); return [] }
      assert.equal(values[1], tenant)
      if (sql.includes("INSERT INTO public.commitment_coverages")) {
        assert.doesNotMatch(sql, /created_at/)
        staged.coverage.push({ id: values[0] as string, userId: tenant, commitmentId: values[2] as string,
          occurrenceDate: values[3] as Date, currency: values[4] as string, coveredCents: values[5] as number,
          targetKind: values[6] as string, importedBillId: values[7] as string | null, taxReserveCategoryId: values[8] as string | null })
      } else {
        assert.match(sql, /INSERT INTO public.commit_guard_work_items/)
        if (failure === "work") throw new Error("private sensitive data")
        staged.work.push(values)
      }
      return [{ id: values[0] }]
    },
    commitmentCoverage: {
      findMany: async (args: { where: { userId: string } }) => { own(args); return structuredClone(staged.coverage) },
      update: async (args: { where: { id: string; userId: string }; data: Partial<CoverageRecord> }) => {
        own(args); Object.assign(staged.coverage.find((row) => row.id === args.where.id)!, args.data); return { id: args.where.id }
      },
      delete: async (args: { where: { id: string; userId: string } }) => { own(args); staged.coverage = staged.coverage.filter((row) => row.id !== args.where.id) },
    },
    commitment: { findMany: async (args: { where: { userId: string } }) => { own(args); return staged.commitments } },
    importedBill: { findMany: async (args: { where: { userId: string; id: { in: string[] } } }) => {
      own(args); return staged.bills.filter((row) => args.where.id.in.includes(row.id))
    } },
    taxReserveCategory: { findMany: async (args: { where: { userId: string } }) => { own(args); return staged.categories } },
    taxBufferObligation: { findMany: async (args: { where: { userId: string } }) => { own(args); return staged.attributions } },
    taxBufferConfiguration: { findUnique: async (args: { where: { userId: string } }) => { own(args); return { enabled: true, accountingBasis: "cash" } } },
    taxBufferOverride: { findMany: async (args: { where: { userId: string } }) => { own(args); return [] } },
    commitGuardCashContext: { findUnique: async (args: { where: { userId: string } }) => { own(args); return { taxProtectionCurrency: "aud" } } },
    commitGuardSetting: { upsert: async (args: { where: { userId: string } }) => {
      own(args); if (failure === "revision") throw new Error("private sensitive data"); return { calculationRevision: ++staged.revision }
    } },
    commitmentEvent: { create: async (args: { data: { userId: string; actorId: string }; select: object }) => {
      assert.equal(args.data.userId, tenant); assert.equal(args.data.actorId, tenant)
      if (failure === "audit") throw new Error("private sensitive data")
      staged.audits.push(args.data); return { id: "audit" }
    } },
  }
  try { const result = await fn(tx); if (release) states.set(tenant, staged); return result }
  finally { release?.() }
}
function request(method = "GET", body?: unknown, query = ""): Request {
  return new Request(`http://localhost/api/commitguard/coverage${query}`, { method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) })
}

describe("coverage boundary uses real CRUD, D2 adapter, recurrence and reconciliation", () => {
  before(async () => {
    await mock.module("@/lib/db/withUserContext", { namedExports: { withUserContext: transaction } })
    await mock.module("@/lib/supabase/server", { namedExports: {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: authError }) } }),
    } })
    await mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: {
      getEffectiveAccess: async () => resolveEffectiveAccess({ profile: { subscriptionStatus: subscription ? "active" : "cancelled",
        subscriptionTier: "business_pro", stripeSubscriptionId: subscription ? "sub_synthetic" : null,
        trialEndsAt: null, billingAccessVersion: 1 }, grant: null, billingRisks: [] }, now),
    } })
    await mock.module("@/lib/billing", { namedExports: { requireFeature: async (_tenant: string, feature: string) =>
      feature === "commitguard_core" ? core : feature === "tax_buffer_basic" ? tax : false } })
    routes = await import("@/app/api/commitguard/coverage/route")
    services = await import("@/lib/commitguard/coverageService")
  })
  beforeEach(() => {
    states = new Map(); queues = new Map(); calls = []; user = { id: "a" }; authError = false
    core = true; subscription = true; tax = true; failure = null
    mock.method(console, "error", () => {})
  })

  test("all methods reject missing/error auth and denied subscription/core before financial work", async () => {
    for (const mode of ["missing", "auth", "subscription", "core"]) {
      user = mode === "missing" ? null : { id: "a" }; authError = mode === "auth"
      subscription = mode !== "subscription"; core = mode !== "core"
      for (const method of ["GET", "POST", "PUT", "DELETE"] as const) {
        assert.equal((await routes[method](request(method, method === "GET" ? undefined : input))).status,
          mode === "missing" || mode === "auth" ? 401 : 403)
      }
    }
    assert.deepEqual(calls, [])
  })

  test("strict route validation returns safe 400 with no transaction", async () => {
    for (const body of [null, {}, { ...input, userId: "b" }, { ...input, fence: 1 }, { ...input, coveredCents: 0 },
      { ...input, occurrenceDate: "2026-02-30" }, { ...input, currency: "jpy" }, { ...input, id: "forged" }]) {
      assert.equal((await routes.POST(request("POST", body))).status, 400)
    }
    assert.equal((await routes.POST(new Request("http://localhost/api/commitguard/coverage", { method: "POST", body: "{" }))).status, 400)
    assert.equal((await routes.GET(request("GET", undefined, "?userId=b"))).status, 400)
    assert.equal((await routes.DELETE(request("DELETE", { id: "x", userId: "b" }))).status, 400)
    assert.deepEqual(calls, [])
  })

  test("create/read/update/delete map safe DTOs and atomically append one revision/work/audit per change", async () => {
    const res = await routes.POST(request("POST", input))
    assert.equal(res.status, 201)
    const created = (await res.json()).coverage
    assert.deepEqual(Object.keys(created).sort(), ["id", "commitmentId", "occurrenceDate", "currency", "coveredCents", "target", "reviewReasons"].sort())
    assert.deepEqual(calls.slice(1, 4), ["tenant-lock", "source-lock", "source-lock"])
    const snapshot = structuredClone(state())
    assert.equal((await routes.GET(request())).status, 200)
    assert.deepEqual(state(), snapshot, "GET makes no financial writes")
    assert.equal((await routes.PUT(request("PUT", { ...input, id: created.id, coveredCents: 7000 }))).status, 200)
    assert.equal(state().coverage[0].coveredCents, 7000)
    const updated = structuredClone(state())
    assert.equal((await routes.PUT(request("PUT", { ...input, id: created.id, coveredCents: 7000 }))).status, 200)
    assert.deepEqual(state(), updated, "no-op changes do not multiply audit/work")
    assert.equal((await routes.DELETE(request("DELETE", { id: created.id }))).status, 200)
    assert.equal(state().coverage.length, 0)
    assert.equal(state().revision, 3); assert.equal(state().work.length, 3); assert.equal(state().audits.length, 3)
    assert.equal((await routes.DELETE(request("DELETE", { id: created.id }))).status, 404)
  })

  test("foreign/missing target, commitment and coverage identity is a safe 404", async () => {
    for (const body of [{ ...input, commitmentId: "foreign" }, { ...input, target: { kind: "tax_reserve_category", id: "foreign" } },
      { ...input, target: { kind: "imported_bill", id: "foreign" } }]) assert.equal((await routes.POST(request("POST", body))).status, 404)
    assert.equal((await routes.PUT(request("PUT", { ...input, id: "foreign" }))).status, 404)
    assert.equal((await routes.DELETE(request("DELETE", { id: "foreign" }))).status, 404)
    assert.equal(state().revision, 0)
  })

  test("real services reject nonprojected dates, stale targets, unsupported currency and duplicate identities", async () => {
    assert.equal((await routes.POST(request("POST", { ...input, occurrenceDate: "2026-10-20" }))).status, 409)
    assert.equal((await routes.POST(request("POST", { ...input, currency: "usd" }))).status, 409)
    state().categories[0].enabled = false
    assert.equal((await routes.POST(request("POST", input))).status, 409)
    state().categories[0].enabled = true
    assert.equal((await routes.POST(request("POST", input))).status, 201)
    assert.equal((await routes.POST(request("POST", { ...input, coveredCents: 1 }))).status, 409)
    state().categories[0].enabled = false
    const list = (await (await routes.GET(request())).json()).coverage
    assert.ok(list[0].reviewReasons.includes("coverage_target_stale"))
    assert.equal((await routes.DELETE(request("DELETE", { id: list[0].id }))).status, 200, "stale rows remain removable")
  })

  test("disjoint coverage cap rejects over-allocation, bill paid/missing attribution remain review-required", async () => {
    assert.equal((await routes.POST(request("POST", input))).status, 201)
    const bill = { ...input, coveredCents: 5000, target: { kind: "imported_bill", id: "bill" } }
    assert.equal((await routes.POST(request("POST", bill))).status, 409)
    assert.equal((await routes.POST(request("POST", { ...bill, coveredCents: 4000 }))).status, 201)
    state().bills[0].status = "paid"
    const result = await services.loadCommitGuardCoverageReconciliation("a", new Date("2026-10-19Z"), new Date("2026-11-18Z"), now)
    assert.equal(result.quality.state, "incomplete")
    assert.equal(result.groups[0].committedCents, 10000)
    assert.equal(result.groups[0].combinedProtectionCents, 16000, "paid bill portion causes no tax overlap deduction")
  })

  test("work, revision and audit failures roll back the entire real-service mutation", async () => {
    for (failure of ["revision", "work", "audit"]) {
      const before = structuredClone(state())
      const res = await routes.POST(request("POST", input))
      assert.equal(res.status, 500)
      assert.deepEqual(await res.json(), { error: "Internal server error" })
      assert.deepEqual(state(), before)
    }
  })

  test("same-tenant concurrent caps serialize while independent tenant state stays isolated", async () => {
    state().commitments[0].amountCents = 10000
    state().categories.push({ ...state().categories[0], id: "tax-two" })
    const results = await Promise.all([routes.POST(request("POST", input)),
      routes.POST(request("POST", { ...input, target: { kind: "tax_reserve_category", id: "tax-two" } }))])
    assert.deepEqual(results.map((res) => res.status).sort(), [201, 409])
    assert.equal(state().coverage.length, 1)
    assert.deepEqual(state("b"), seed("b"))
  })
})