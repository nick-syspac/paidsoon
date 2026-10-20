import "@/tests/helpers/subscriptionAccess"
import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"
import type { CommitGuardSettingsSnapshot } from "@/lib/commitguard/types"
import type { CommitGuardCashContextRecord } from "@/lib/commitguard/cashContext"
import { getCommitGuardBufferPolicyReasons } from "@/lib/commitguard/bufferPolicyQuality"
import { buildCommitGuardSummary, buildCommitGuardCashPlanAdapter } from "@/lib/commitguard/summary"
import { workspaceCommitment } from "@/tests/helpers/commitGuardWorkspace"

const now = new Date("2026-10-19T12:00:00Z")
type SettingsRow = CommitGuardSettingsSnapshot & { calculationRevision: number; userId: string }
interface State {
  settings: SettingsRow | null
  cash: CommitGuardCashContextRecord
  work: unknown[][]
  audits: object[]
}
function defaults(): SettingsRow {
  return {
    userId: "tenant-a", calculationRevision: 0, enabled: false, defaultHorizonDays: 30,
    safetyBufferMode: "fixed_amount", safetyBufferFixedCents: 0, safetyBufferCurrency: null,
    safetyBufferPercent: null, safetyBufferWeeks: null, detectRecurringCommitments: false,
    detectionMinOccurrences: 3, detectionAmountVariancePercent: 12, detectionIntervalToleranceDays: 3,
    detectionConfidenceThreshold: "medium", alertCommitmentDueSoon: true, alertRenewalApproaching: true,
    alertNoticePeriodApproaching: true, alertCommitmentAmountChanged: true,
    alertCommitmentBufferLow: true, alertCommitmentShortfall: true, renewalWarningDays: [90, 60, 30, 14, 7],
  }
}
let state: State
let calls: string[]
let queue: Promise<void>
let failWork: boolean
let user: { id: string } | null
let entitled: boolean
let save: typeof import("@/lib/commitguard/service").saveCommitGuardSettings
let get: typeof import("@/lib/commitguard/service").getCommitGuardSettings
let saveCash: typeof import("@/lib/commitguard/cashContextMutation").saveCommitGuardCashContext
let loadCash: typeof import("@/lib/commitguard/cashContextLoader").loadCommitGuardCashContext
let PUT: typeof import("@/app/api/commitguard/settings/route").PUT
let GET: typeof import("@/app/api/commitguard/settings/route").GET

/** Real services, tenant lock and work-request helper over a rollback-capable DB double. */
async function transaction<T>(tenant: string, fn: (tx: object) => Promise<T>): Promise<T> {
  assert.equal(tenant, "tenant-a")
  let staged: State | undefined
  let release: (() => void) | undefined
  const current = (): State => staged ?? state
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      assert.match(strings.join("?"), /pg_advisory_xact_lock/)
      assert.deepEqual(values, [`commitguard:${tenant}`])
      const previous = queue
      queue = new Promise<void>((resolve) => { release = resolve })
      await previous
      staged = structuredClone(state)
      calls.push("lock")
      return 1
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      assert.ok(staged, "row/work access must follow shared tenant lock")
      if (strings.join("").includes("SELECT revision")) return [{ revision: current().cash.revision }]
      assert.match(strings.join("?"), /INSERT INTO public.commit_guard_work_items/)
      assert.equal(values[1], tenant)
      calls.push("work")
      if (failWork) throw new Error("mock work failure")
      current().work.push(values)
      return [{ id: "work-id" }]
    },
    commitGuardSetting: {
      findUnique: async ({ where }: { where: { userId: string } }) => {
        assert.ok(staged)
        assert.equal(where.userId, tenant)
        calls.push("settings-read")
        return current().settings
      },
      upsert: async (args: { where: { userId: string }; create: Record<string, unknown>; update: Record<string, unknown>; select: Record<string, boolean> }) => {
        assert.equal(args.where.userId, tenant)
        const updating = current().settings !== null
        const changes = updating ? args.update : args.create
        if (Object.keys(changes).some((key) => changes[key] !== undefined)) assert.ok(staged)
        const row = { ...(current().settings ?? defaults()) }
        for (const [key, value] of Object.entries(changes)) {
          if (value !== undefined) {
            if (key === "calculationRevision" && typeof value === "object") row.calculationRevision++
            else Object.assign(row, { [key]: value })
          }
        }
        calls.push("calculationRevision" in changes ? "revision" : "settings-write")
        current().settings = row
        return Object.fromEntries(Object.keys(args.select).map((key) => [key, row[key as keyof SettingsRow]]))
      },
    },
    commitGuardCashContext: {
      findUnique: async ({ where }: { where: { userId: string } }) => {
        assert.equal(where.userId, tenant)
        return current().cash
      },
      updateMany: async ({ where, data }: { where: { userId: string; revision: number }; data: CommitGuardCashContextRecord }) => {
        assert.ok(staged)
        assert.equal(where.userId, tenant)
        assert.equal(where.revision, current().cash.revision)
        current().cash = data
        return { count: 1 }
      },
    },
    commitmentEvent: {
      create: async ({ data }: { data: object }) => {
        assert.ok(staged)
        current().audits.push(data)
        return { id: "event-id" }
      },
    },
  }
  try {
    const result = await fn(tx)
    if (staged) state = staged
    return result
  } finally { release?.() }
}

function request(body?: unknown): Request {
  return new Request("http://localhost/api/commitguard/settings", body === undefined ? {} : {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
}

function importRequest(body: unknown): Request {
  const result = request(body)
  result.headers.set("X-CommitGuard-Settings-Transfer", "import")
  return result
}

describe("CommitGuard settings policy with current real service and mocked storage", () => {
  before(async () => {
    await mock.module("@/lib/db/withUserContext", { namedExports: { withUserContext: transaction } })
    await mock.module("@/lib/billing", { namedExports: { requireFeature: async () => entitled } })
    await mock.module("@/lib/commitguard/entitlements", { namedExports: {
      requireCommitGuardCoreAccess: async () => { if (!entitled) throw new Error("Upgrade required") },
      getCommitGuardEntitlements: async () => { throw new Error("unexpected entitlement call") },
    } })
    await mock.module("@/lib/taxBuffer/service", { namedExports: {
      loadTaxBufferSummary: async () => { throw new Error("no Tax Buffer dependency allowed") },
    } })
    await mock.module("@/lib/supabase/server", { namedExports: {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
    } })
    ;({ saveCommitGuardSettings: save, getCommitGuardSettings: get } = await import("@/lib/commitguard/service"))
    ;({ saveCommitGuardCashContext: saveCash } = await import("@/lib/commitguard/cashContextMutation"))
    ;({ loadCommitGuardCashContext: loadCash } = await import("@/lib/commitguard/cashContextLoader"))
    ;({ PUT, GET } = await import("@/app/api/commitguard/settings/route"))
  })
  beforeEach(() => {
    state = { settings: defaults(), cash: {
      amountCents: 100000, currency: "aud", balanceAsOf: new Date("2026-10-19"), revision: 0,
      weeklyOperatingExpensesCents: 20000, weeklyExpensesCurrency: "aud", weeklyExpensesAsOf: new Date("2026-10-12"),
      taxProtectionCurrency: null,
    }, work: [], audits: [] }
    calls = []; queue = Promise.resolve(); failWork = false; user = { id: "tenant-a" }; entitled = true
  })

  test("settings PUT validates explicit supported currency and maps a safe persisted DTO", async () => {
    const response = await PUT(request({ safetyBufferFixedCents: 50000, safetyBufferCurrency: "aud" }))
    assert.equal(response.status, 200)
    const dto = (await response.json()).settings
    assert.equal(dto.safetyBufferCurrency, "aud")
    assert.equal(dto.safetyBufferFixedCents, 50000)
    assert.equal("userId" in dto, false)
    assert.equal("calculationRevision" in dto, false)
    assert.equal((await get("tenant-a")).safetyBufferCurrency, "aud")
    assert.equal((await (await GET()).json()).settings.safetyBufferCurrency, "aud")
    assert.deepEqual(state.work[0].slice(1), ["tenant-a", "evaluation:1", 1])
    assert.deepEqual(calls.slice(0, 5), ["lock", "settings-read", "settings-write", "revision", "work"])
  })

  test("invalid currency, overflow and financial fields return 400 before storage; unauthenticated/denied writes stop", async () => {
    for (const body of [{ safetyBufferCurrency: "jpy" }, { safetyBufferCurrency: "AUD" },
      { safetyBufferFixedCents: 2_147_483_648 }, { amountCents: 123 }, { weeklyExpensesCurrency: "usd" }]) {
      assert.equal((await PUT(request(body))).status, 400)
    }
    user = null
    assert.equal((await PUT(request({ safetyBufferCurrency: "usd" }))).status, 401)
    user = { id: "tenant-a" }; entitled = false
    assert.equal((await PUT(request({ safetyBufferCurrency: "usd" }))).status, 403)
    assert.deepEqual(calls, [])
  })

  test("legacy positive untagged amount is retained on partial saves and requires explicit attestation", async () => {
    state.settings!.safetyBufferFixedCents = 50000
    const saved = await save("tenant-a", { defaultHorizonDays: 60 })
    assert.equal(saved.safetyBufferFixedCents, 50000)
    assert.equal(saved.safetyBufferCurrency, null)
    assert.deepEqual(getCommitGuardBufferPolicyReasons(saved, await loadCash("tenant-a", now), now), ["fixed_buffer_currency_review_required"])
    const confirmed = await save("tenant-a", { safetyBufferCurrency: "aud" })
    assert.deepEqual(getCommitGuardBufferPolicyReasons(confirmed, await loadCash("tenant-a", now), now), [])
    const cleared = await save("tenant-a", { safetyBufferCurrency: null })
    assert.equal(cleared.safetyBufferFixedCents, 50000)
    assert.deepEqual(getCommitGuardBufferPolicyReasons(cleared, await loadCash("tenant-a", now), now), ["fixed_buffer_currency_review_required"])
  })

  test("cash currency change and balance clear never relabel fixed buffer or refresh the weekly date", async () => {
    await save("tenant-a", { safetyBufferFixedCents: 50000, safetyBufferCurrency: "aud" })
    const cash = await saveCash("tenant-a", {
      expectedRevision: 0, amountCents: 100000, currency: "usd", balanceAsOf: "2026-10-19",
    }, now)
    const policy = await get("tenant-a")
    assert.equal(policy.safetyBufferCurrency, "aud")
    assert.deepEqual(getCommitGuardBufferPolicyReasons(policy, cash, now), ["fixed_buffer_currency_mismatch"])
    assert.deepEqual(getCommitGuardBufferPolicyReasons({ ...policy, safetyBufferMode: "weeks_operating_expenses" }, cash, now), ["weekly_expenses_currency_mismatch"])
    const cleared = await saveCash("tenant-a", { expectedRevision: 1, amountCents: null, currency: null, balanceAsOf: null }, now)
    assert.equal((await get("tenant-a")).safetyBufferCurrency, "aud")
    assert.equal(cleared.weeklyOperatingExpensesCents, 20000)
    assert.equal(cleared.weeklyExpensesCurrency, "aud")
    assert.equal(cleared.weeklyExpensesAsOf, "2026-10-12")
    assert.equal(cleared.weeklyExpensesFreshness, "fresh")
  })

  test("policy edits and fresh cash do not renew the saved weekly attestation on day eight", async () => {
    const later = new Date("2026-10-20T00:00:00Z")
    await save("tenant-a", { safetyBufferMode: "weeks_operating_expenses", safetyBufferWeeks: 4 })
    await saveCash("tenant-a", { expectedRevision: 0, amountCents: 100000, currency: "aud", balanceAsOf: "2026-10-20" }, later)
    const loaded = await loadCash("tenant-a", later)
    assert.equal(loaded.freshness, "fresh")
    assert.equal(loaded.weeklyExpensesFreshness, "stale")
    assert.equal(loaded.weeklyExpensesAsOf, "2026-10-12")
    assert.deepEqual(getCommitGuardBufferPolicyReasons(await get("tenant-a"), loaded, later), ["weekly_expenses_stale"])
    const reattested = await saveCash("tenant-a", { expectedRevision: 1,
      weeklyOperatingExpensesCents: 20000, weeklyExpensesCurrency: "aud", weeklyExpensesAsOf: "2026-10-20",
    }, later)
    assert.deepEqual(getCommitGuardBufferPolicyReasons(await get("tenant-a"), reattested, later), [])
  })

  test("omitted currency is preserved on policy amount/mode edits; explicit fixed zero is neutral", async () => {
    await save("tenant-a", { safetyBufferFixedCents: 50000, safetyBufferCurrency: "aud" })
    const updated = await save("tenant-a", { safetyBufferFixedCents: 60000, safetyBufferMode: "weeks_operating_expenses", safetyBufferWeeks: 4 })
    assert.equal(updated.safetyBufferCurrency, "aud")
    const zero = await save("tenant-a", { safetyBufferMode: "fixed_amount", safetyBufferFixedCents: 0 })
    assert.deepEqual(getCommitGuardBufferPolicyReasons(zero, { ...(await loadCash("tenant-a", now)), currency: "usd" }, now), [])
  })

  test("first partial save retains unknown positive currency and queues one revision; no-op retries queue nothing", async () => {
    state.settings = null
    const saved = await save("tenant-a", { safetyBufferFixedCents: 50000 })
    assert.equal(saved.safetyBufferCurrency, null)
    assert.equal(state.settings!.calculationRevision, 1)
    await save("tenant-a", { safetyBufferFixedCents: 50000 })
    await save("tenant-a", {})
    assert.equal(state.settings!.calculationRevision, 1)
    assert.equal(state.work.length, 1)
    assert.equal(calls.filter((call) => call === "settings-write").length, 1, "no-op never updates settings timestamps")
  })

  test("4.4 normalized policy no-op skips settings writes, revision and work", async () => {
    state.settings!.renewalWarningDays = []
    await save("tenant-a", { renewalWarningDays: [90, 60, 30, 14, 7] })
    assert.deepEqual(calls, ["lock", "settings-read"])
    assert.equal(state.settings!.calculationRevision, 0); assert.deepEqual(state.work, [])
  })

  test("work failure rolls back settings/currency/revision together", async () => {
    const previous = structuredClone(state)
    failWork = true
    await assert.rejects(save("tenant-a", { safetyBufferCurrency: "usd", safetyBufferFixedCents: 50000 }), /mock work failure/)
    assert.deepEqual(state, previous)
  })

  test("7.6 invalid warning policy PUT/import never writes; omitted lists survive partial imports", async () => {
    const previous = structuredClone(state)
    for (const makeRequest of [request, importRequest]) {
      for (const renewalWarningDays of [[], [0], [366], [1.5], Array(13).fill(7)]) {
        const response = await PUT(makeRequest({ renewalWarningDays }))
        assert.equal(response.status, 400)
        assert.ok((await response.json()).error.fieldErrors.renewalWarningDays.length)
      }
    }
    assert.deepEqual(state, previous)
    assert.deepEqual(calls, [])
    assert.equal((await PUT(importRequest({ enabled: true, defaultHorizonDays: 60 }))).status, 200)
    assert.deepEqual(state.settings!.renewalWarningDays, previous.settings!.renewalWarningDays)
  })

  test("7.6 persisted policy affects horizon/weekly protection; disable suppresses adapter and re-enable restores retained records", async () => {
    const commitments = [structuredClone(workspaceCommitment)]
    const originalRecords = structuredClone(commitments)
    const originalCash = structuredClone(state.cash)
    const current = async () => {
      const input = { settings: await get("tenant-a"), calculationRevision: state.settings!.calculationRevision,
        cashContext: await loadCash("tenant-a", now), commitments, now,
        tax: { asOf: now.toISOString(), applicable: false, amountCents: 0, currency: null, categories: [],
          quality: { state: "not_applicable" as const, reasons: ["not_applicable" as const] } },
        coverage: { sources: { userId: "tenant-a", taxApplicable: false, commitments, bills: [], taxCategories: [] }, rows: [] } }
      const summary = buildCommitGuardSummary(input)
      return { summary, adapter: buildCommitGuardCashPlanAdapter(input, summary) }
    }
    assert.equal((await PUT(request({ enabled: true, defaultHorizonDays: 60,
      safetyBufferMode: "weeks_operating_expenses", safetyBufferWeeks: 4 }))).status, 200)
    const enabled = await current()
    assert.equal(enabled.summary.selectedHorizonDays, 60)
    assert.equal(enabled.summary.freeCash.safetyBufferCents, 80000)
    assert.equal(enabled.summary.freeCash.committedCashCents, 20000)
    assert.equal(enabled.summary.horizons!.find((row) => row.days === 30)!.totalCents, 10000)
    assert.equal(enabled.summary.freeCash.freeCashCents, 0)
    assert.equal(enabled.adapter.occurrences.length, 3)
    const workBeforeDisable = state.work.length
    await PUT(request({ enabled: false }))
    const disabled = await current()
    assert.equal(state.work.length, workBeforeDisable + 1, "disable queues a revision for current-policy execution checks")
    assert.equal(disabled.summary.quality.state, "disabled")
    assert.equal(disabled.summary.freeCash.status, null)
    assert.equal(disabled.summary.freeCash.protectedCashCents, null)
    assert.equal(disabled.summary.freeCash.freeCashCents, null)
    assert.deepEqual(disabled.adapter.occurrences, [])
    assert.deepEqual(disabled.adapter.horizonsByCurrency, [])
    assert.equal(disabled.adapter.protection, null)
    assert.ok(Object.values(disabled.adapter.committedOutflow).every((value) => value === null))
    assert.deepEqual(commitments, originalRecords)
    assert.deepEqual(state.cash, originalCash)
    await PUT(importRequest({ enabled: true }))
    const restored = await current()
    assert.deepEqual(restored.summary.freeCash, enabled.summary.freeCash)
    assert.deepEqual(restored.adapter.occurrences, enabled.adapter.occurrences)
    assert.equal(restored.summary.selectedHorizonDays, 60)
    assert.deepEqual(commitments, originalRecords)
    assert.deepEqual(state.cash, originalCash)
  })

  test("concurrent cash and settings changes share serialization and keep distinct evaluation revisions", async () => {
    await Promise.all([
      save("tenant-a", { safetyBufferCurrency: "aud", safetyBufferFixedCents: 50000 }),
      saveCash("tenant-a", { expectedRevision: 0, amountCents: 120000, currency: "usd", balanceAsOf: "2026-10-19" }, now),
      save("tenant-a", { safetyBufferWeeks: 4 }),
    ])
    assert.equal(state.settings!.calculationRevision, 3)
    assert.equal(state.settings!.safetyBufferCurrency, "aud")
    assert.equal(state.settings!.safetyBufferWeeks, 4)
    assert.equal(state.cash.currency, "usd")
    assert.equal(state.cash.weeklyExpensesCurrency, "aud")
    assert.deepEqual(state.work.map((values) => values[2]), ["evaluation:1", "evaluation:2", "evaluation:3"])
  })

  test("transfer round-trips each supported lowercase currency through the real exporter/importer without transferring revision", async () => {
    const originalCash = structuredClone(state.cash)
    for (const currency of ["aud", "usd", "nzd", "gbp", "eur", "cad", "sgd", "hkd"]) {
      state.settings = { ...defaults(), safetyBufferFixedCents: 50000, safetyBufferCurrency: currency,
        safetyBufferWeeks: 4, calculationRevision: 97 }
      const response = await GET()
      assert.equal(response.status, 200)
      const exported = (await response.json()).settings
      const { userId: _tenant, calculationRevision: _revision, ...expected } = state.settings
      assert.deepEqual(exported, expected)

      // A different destination policy/revision must receive policy only, not 97.
      state.settings = { ...defaults(), calculationRevision: 12 }
      state.work = []; calls = []
      const imported = await PUT(importRequest(JSON.parse(JSON.stringify(exported))))
      assert.equal(imported.status, 200)
      assert.deepEqual((await imported.json()).settings, exported)
      assert.equal(state.settings!.calculationRevision, 13)
      assert.equal(state.settings!.safetyBufferWeeks, 4, "weeks count is portable policy")
      assert.deepEqual(state.work[0].slice(1), ["tenant-a", "evaluation:13", 13])
      assert.deepEqual(calls.slice(0, 5), ["lock", "settings-read", "settings-write", "revision", "work"])
      assert.deepEqual(state.cash, originalCash)
    }
  })

  test("transfer exporter projects only policy even if storage contains financial and internal fields", async () => {
    Object.assign(state.settings!, {
      id: "settings-id", cashContext: state.cash, amountCents: 100000, balanceAsOf: now,
      weeklyOperatingExpensesCents: 20000, weeklyExpensesCurrency: "aud", weeklyExpensesAsOf: now,
      taxProtectionCurrency: "aud", sourceDetectionCandidateId: "candidate-id", convertedCommitmentId: "commitment-id",
      workItems: [{ state: "processing", fence: 99 }], revision: 42,
    })
    const response = await GET()
    assert.equal(response.status, 200)
    const exported = (await response.json()).settings
    const { userId: _tenant, calculationRevision: _revision, ...expected } = defaults()
    assert.deepEqual(exported, expected)
    assert.equal(exported.safetyBufferCurrency, null)
    assert.equal(state.work.length, 0)
  })

  test("legacy positive imported amounts clear destination currency and require review without guessing from cash", async () => {
    for (const mode of [undefined, "fixed_amount", "percentage_monthly_commitments", "weeks_operating_expenses"]) {
      state.settings = { ...defaults(), safetyBufferFixedCents: 40000, safetyBufferCurrency: "usd" }
      const imported = await PUT(importRequest({ safetyBufferFixedCents: 50000, safetyBufferMode: mode }))
      assert.equal(imported.status, 200)
      const policy = (await imported.json()).settings
      assert.equal(policy.safetyBufferFixedCents, 50000)
      assert.equal(policy.safetyBufferCurrency, null)
      // The retained fixed policy needs confirmation even if imported while inactive.
      assert.deepEqual(getCommitGuardBufferPolicyReasons({ ...policy, safetyBufferMode: "fixed_amount" },
        await loadCash("tenant-a", now), now), ["fixed_buffer_currency_review_required"])
      assert.equal(state.cash.currency, "aud")
    }
    const exported = (await (await GET()).json()).settings
    assert.equal(exported.safetyBufferFixedCents, 50000)
    assert.equal(exported.safetyBufferCurrency, null)
  })

  test("partial imports preserve omitted policy and empty imports are no-ops; currency null explicitly clears", async () => {
    state.settings = { ...defaults(), safetyBufferFixedCents: 50000, safetyBufferCurrency: "usd", calculationRevision: 8 }
    const initial = structuredClone(state.settings)
    assert.equal((await PUT(importRequest({}))).status, 200)
    assert.deepEqual(state.settings, initial)
    assert.equal(state.work.length, 0)
    assert.equal((await PUT(importRequest({ defaultHorizonDays: 60, safetyBufferWeeks: 4 }))).status, 200)
    assert.equal(state.settings!.safetyBufferFixedCents, 50000)
    assert.equal(state.settings!.safetyBufferCurrency, "usd")
    assert.equal(state.settings!.calculationRevision, 9)
    assert.equal((await PUT(importRequest({ safetyBufferCurrency: null }))).status, 200)
    assert.equal(state.settings!.safetyBufferCurrency, null)
    assert.equal(state.settings!.safetyBufferFixedCents, 50000)
    assert.equal(state.settings!.calculationRevision, 10)
    assert.equal((await PUT(importRequest({ safetyBufferCurrency: "eur" }))).status, 200)
    assert.equal(state.settings!.safetyBufferCurrency, "eur")
    assert.equal(state.settings!.safetyBufferFixedCents, 50000)
  })

  test("zero import is currency-neutral and ordinary partial edits still preserve a saved currency", async () => {
    state.settings = { ...defaults(), safetyBufferFixedCents: 50000, safetyBufferCurrency: "usd" }
    assert.equal((await PUT(importRequest({ safetyBufferFixedCents: 0 }))).status, 200)
    assert.equal(state.settings!.safetyBufferCurrency, "usd")
    assert.deepEqual(getCommitGuardBufferPolicyReasons(await get("tenant-a"), await loadCash("tenant-a", now), now), [])
    assert.equal((await PUT(request({ safetyBufferFixedCents: 60000 }))).status, 200)
    assert.equal(state.settings!.safetyBufferCurrency, "usd", "ordinary edit is not a legacy import")
  })

  test("transfer rejects financial inputs, conversion/job state, revisions and malicious unknown keys before storage", async () => {
    const original = structuredClone(state)
    const forbidden = ["cashContext", "amountCents", "currency", "balanceAsOf", "weeklyOperatingExpensesCents",
      "weeklyExpensesCurrency", "weeklyExpensesAsOf", "taxProtectionCurrency", "revision", "expectedRevision",
      "calculationRevision", "inputRevision", "sourceDetectionCandidateId", "convertedCommitmentId", "candidateKey",
      "commitmentId", "detectionCandidateId", "workItems", "kind", "dedupeKey", "sourceKind", "sourceId", "state",
      "attempts", "fence", "leaseOwner", "leaseExpiresAt", "requestedAt", "completedAt", "userId", "id",
      "createdAt", "updatedAt", "prototype", "constructor", "unknownPolicy"]
    for (const key of forbidden) {
      const body = Object.fromEntries([["safetyBufferCurrency", "usd"], [key, { injected: true }]])
      assert.equal((await PUT(importRequest(body))).status, 400, key)
    }
    for (const currency of ["AUD", "jpy", "bhd", "", 12, { code: "usd" }]) {
      assert.equal((await PUT(importRequest({ safetyBufferCurrency: currency }))).status, 400)
    }
    assert.deepEqual(calls, [])
    assert.deepEqual(state, original)
  })

  test("transfer safely strips JSON __proto__ before storage and export", async () => {
    const body: unknown = JSON.parse('{"__proto__":{"injected":true,"calculationRevision":99},"safetyBufferWeeks":4}')
    const response = await PUT(importRequest(body))
    assert.equal(response.status, 200)
    assert.equal(state.settings!.safetyBufferWeeks, 4)
    assert.equal(state.settings!.calculationRevision, 1)
    assert.equal(Object.hasOwn(state.settings!, "__proto__"), false)
    assert.equal("injected" in state.settings!, false)
    const exported = (await (await GET()).json()).settings
    assert.equal(Object.hasOwn(exported, "__proto__"), false)
    assert.equal("injected" in exported, false)
    assert.equal("calculationRevision" in exported, false)
  })

  test("legacy import on missing settings creates unknown currency; retries do not create another evaluation", async () => {
    state.settings = null
    const body = { safetyBufferFixedCents: 50000 }
    const response = await PUT(importRequest(body))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).settings.safetyBufferCurrency, null)
    assert.equal(state.settings!.calculationRevision, 1)
    assert.equal((await PUT(importRequest(body))).status, 200)
    assert.equal(state.settings!.calculationRevision, 1)
    assert.equal(state.work.length, 1)
  })

  test("transfer work failure rolls back imported amount, currency and revision atomically", async () => {
    state.settings = { ...defaults(), safetyBufferFixedCents: 40000, safetyBufferCurrency: "usd", calculationRevision: 6 }
    const original = structuredClone(state)
    failWork = true
    const log = mock.method(console, "error", () => {})
    try {
      const response = await PUT(importRequest({ safetyBufferFixedCents: 50000 }))
      assert.equal(response.status, 500)
      assert.deepEqual(await response.json(), { error: "Internal server error" })
      assert.deepEqual(state, original)
    } finally { log.mock.restore() }
  })

  test("transfer keeps the existing authentication and core feature guards", async () => {
    user = null
    assert.equal((await GET()).status, 401)
    assert.equal((await PUT(importRequest({ safetyBufferFixedCents: 50000 }))).status, 401)
    user = { id: "tenant-a" }; entitled = false
    assert.equal((await GET()).status, 403)
    assert.equal((await PUT(importRequest({ safetyBufferFixedCents: 50000 }))).status, 403)
    assert.deepEqual(calls, [])
  })
})