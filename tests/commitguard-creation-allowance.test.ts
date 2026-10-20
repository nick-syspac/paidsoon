import assert from "node:assert/strict"
import { AsyncLocalStorage } from "node:async_hooks"
import { before, beforeEach, mock, test } from "node:test"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { getPlanByTier, type SubscriptionTier } from "@/lib/subscriptionPlans"

// Offline transaction/lock model only. The separate storage script proves the
// same services against PostgreSQL, actual withUserContext and canonical ACLs.
const context = new AsyncLocalStorage<{ tenant: string; locked: boolean; trace: string[] }>()
const tiers = new Map<string, SubscriptionTier | null>()
const tails = new Map<string, Promise<void>>()
let rows: Array<{ id?: string; userId: string; archivedAt: Date | null; status: string; sourceDetectionCandidateId?: string }>
let candidates: Map<string, Record<string, unknown>>
let audits: unknown[]
let traces: string[][]
let failAudit: boolean
let revisions: Map<string, number>, work: unknown[][], failRevision: boolean, failWork: boolean
let lockRequested: (() => void) | undefined
let service: typeof import("@/lib/commitguard/service")
let detection: typeof import("@/lib/commitguard/detection")
const limit = getPlanByTier("business_control").limits.commitmentsTracked
const input = { name: "Synthetic", category: "other", amountCents: 1000, currency: "aud", frequency: "monthly" }

async function hold(tenant: string): Promise<() => void> {
  const previous = tails.get(tenant) ?? Promise.resolve()
  let release!: () => void
  tails.set(tenant, new Promise<void>((resolve) => { release = resolve }))
  await previous
  return release
}
function seed(tenant = "tenant-a", count = limit - 1, status = "active", archivedAt: Date | null = null): void {
  rows.push(...Array.from({ length: count }, (_, index) => ({ id: `seed-${rows.length}-${index}`, userId: tenant, archivedAt, status })))
}
function candidate(id: string, tenant = "tenant-a"): void {
  candidates.set(id, { id, userId: tenant, ...input, typicalAmountCents: 1000,
    recurrenceAnchor: new Date("2026-01-31T00:00:00Z"),
    supplierName: null, supplierId: null, source: "system_inferred", status: "pending", conversionReviewRequired: false })
}
const manual = (tenant = "tenant-a") => service.createCommitment(tenant, input)
const convert = (id: string, tenant = "tenant-a") => detection.reviewDetectedCommitmentCandidate({
  userId: tenant, candidateId: id, action: "confirm",
})

before(async () => {
  await mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: {
    getEffectiveAccess: async (tenant: string) => {
      context.getStore()?.trace.push("access")
      return resolveEffectiveAccess({ profile: {
        subscriptionStatus: "active", subscriptionTier: tiers.has(tenant) ? tiers.get(tenant)! : "essentials",
        stripeSubscriptionId: "sub_synthetic", trialEndsAt: null, billingAccessVersion: 1,
      }, grant: null, billingRisks: [] }, new Date("2026-10-19T12:00:00Z"))
    },
  } })
  await mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async (tenant: string, callback: (tx: unknown) => Promise<unknown>) => {
      const state = { tenant, locked: false, trace: [] as string[] }
      traces.push(state.trace)
      let release: (() => void) | undefined
      const pendingRows: typeof rows = [], pendingAudits: unknown[] = []
      let draftRevision = 0
      const pendingWork: unknown[][] = []
      const pendingCandidates = new Map<string, Record<string, unknown>>()
      return context.run(state, async () => {
        const tx = {
          $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
            assert.equal(state.locked, true, "tenant lock precedes candidate row lock")
            if (sql.join("").includes("INSERT INTO public.commit_guard_work_items")) {
              assert.deepEqual(values.slice(1), [tenant, `evaluation:${draftRevision}`, draftRevision])
              if (failWork) throw new Error("synthetic work failure")
              pendingWork.push(values)
              return [{ id: "work" }]
            }
            const [userId, id] = values as [string, string]
            assert.match(sql.join("?"), /WHERE user_id = \? AND id = \? FOR UPDATE/)
            state.trace.push("candidate_locked")
            return candidates.get(id)?.userId === userId ? [{ id }] : []
          },
          $executeRaw: async (sql: TemplateStringsArray, key: string) => {
            assert.equal(sql.join("?"), "SELECT pg_advisory_xact_lock(hashtext(?))")
            assert.equal(key, `commitguard:${tenant}`)
            state.trace.push("lock_requested")
            lockRequested?.()
            release = await hold(tenant)
            state.locked = true
            draftRevision = revisions.get(tenant) ?? 7
            state.trace.push("locked")
          },
          commitment: {
            findUnique: async ({ where }: { where: { userId_sourceDetectionCandidateId: { userId: string; sourceDetectionCandidateId: string } } }) => {
              assert.ok(state.trace.includes("candidate_locked"))
              const key = where.userId_sourceDetectionCandidateId
              return rows.find((row) => row.userId === key.userId && row.sourceDetectionCandidateId === key.sourceDetectionCandidateId) ?? null
            },
            findMany: async () => rows.filter((row) => row.userId === tenant),
            count: async (query: unknown) => {
              assert.equal(state.locked, true)
              assert.deepEqual(query, { where: { userId: tenant, archivedAt: null } })
              state.trace.push("count")
              return rows.filter((row) => row.userId === tenant && row.archivedAt === null).length
            },
            create: async ({ data }: { data: { userId: string; status: string } }) => {
              assert.equal(state.locked, true)
              state.trace.push("create")
              const row = { ...data, id: `new-${rows.length}`, archivedAt: null,
                createdAt: new Date(), updatedAt: new Date() }
              pendingRows.push(row)
              return row
            },
          },
          commitmentDetectionCandidate: {
            findMany: async () => [...candidates.values()].filter((row) => row.userId === tenant),
            findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
              assert.equal(state.locked, true)
              const row = candidates.get(where.id)
              return row?.userId === where.userId ? row : null
            },
            update: async ({ where, data }: { where: { id: string }; data: object }) => {
              pendingCandidates.set(where.id, { ...candidates.get(where.id), ...Object.fromEntries(
                Object.entries(data).filter(([, value]) => value !== undefined),
              ) })
            },
          },
          commitmentEvent: {
            findMany: async () => [],
            create: async ({ data }: { data: unknown }) => {
              if (failAudit) throw new Error("synthetic audit failure")
              pendingAudits.push(data)
            },
            createMany: async ({ data }: { data: unknown[] }) => {
              if (failAudit) throw new Error("synthetic audit failure")
              pendingAudits.push(...data)
            },
          },
          commitGuardSetting: { upsert: async ({ where, update }: { where: object; update: object }) => {
            assert.equal(state.locked, true)
            assert.deepEqual(where, { userId: tenant })
            assert.deepEqual(update, { calculationRevision: { increment: 1 } })
            if (failRevision) throw new Error("synthetic revision failure")
            return { calculationRevision: ++draftRevision }
          } },
        }
        try {
          const result = await callback(tx)
          rows.push(...pendingRows)
          audits.push(...pendingAudits)
          if (state.locked) revisions.set(tenant, draftRevision)
          work.push(...pendingWork)
          for (const [id, row] of pendingCandidates) candidates.set(id, row)
          return result
        } finally { release?.() }
      })
    },
  } })
  service = await import("@/lib/commitguard/service")
  detection = await import("@/lib/commitguard/detection")
})
beforeEach(() => {
  rows = []; audits = []; traces = []; candidates = new Map(); failAudit = false
  revisions = new Map(); work = []; failRevision = false; failWork = false
  lockRequested = undefined
  tiers.clear(); tails.clear()
  tiers.set("tenant-a", "business_control"); tiers.set("tenant-b", "business_control")
})

for (const pair of ["manual/manual", "manual/convert", "convert/convert"] as const) {
  test(`4.1 real services, offline last-slot ${pair}`, async () => {
    seed(); candidate("first"); candidate("second")
    const operations = pair === "manual/manual" ? [manual, manual]
      : pair === "manual/convert" ? [manual, () => convert("first")]
        : [() => convert("first"), () => convert("second")]
    const results = await Promise.allSettled(operations.map((operation) => operation()))
    assert.equal(results.filter((row) => row.status === "fulfilled").length, 1)
    const failure = results.find((row) => row.status === "rejected") as PromiseRejectedResult
    assert.equal(failure.reason.message, "Commitment limit reached")
    assert.equal(rows.length, limit)
    assert.equal(audits.length, 1)
    assert.equal(revisions.get("tenant-a"), 8); assert.equal(work.length, 1)
    for (const trace of traces) {
      assert.ok(trace.indexOf("locked") < trace.indexOf("access"))
      assert.ok(trace.indexOf("access") < trace.indexOf("count"))
    }
    if (pair === "convert/convert") {
      assert.equal([...candidates.values()].filter((row) => row.status === "converted").length, 1)
    }
  })
}

test("4.1 cancelled unarchived rows count; archived rows of any status do not", async () => {
  seed("tenant-a", limit, "cancelled")
  seed("tenant-a", 10, "active", new Date())
  candidate("first")
  await assert.rejects(manual(), /Commitment limit reached/)
  await assert.rejects(convert("first"), /Commitment limit reached/)
  assert.equal(audits.length, 0)
  rows[0].archivedAt = new Date()
  await convert("first")
  assert.equal(rows.filter((row) => row.archivedAt === null).length, limit)
})

for (const kind of ["manual", "convert"] as const) {
  test(`4.1 ${kind} refreshes access/plan after waiting and rolls back on audit failure`, async () => {
    seed(); candidate("first")
    const release = await hold("tenant-a")
    const operation = kind === "manual" ? manual : () => convert("first")
    // Run admission before downgrading; the lock-time check must see Essentials.
    let entered!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    lockRequested = entered
    const result = operation()
    await started
    lockRequested = undefined
    tiers.set("tenant-a", "essentials")
    release()
    await assert.rejects(result, kind === "manual" ? /Commitment limit reached/ : /Upgrade required/)
    assert.equal(rows.length, limit - 1)
    assert.equal(candidates.get("first")?.status, "pending")
    tiers.set("tenant-a", "business_control")
    failAudit = true
    await assert.rejects(operation(), /synthetic audit failure/)
    assert.equal(rows.length, limit - 1)
    assert.equal(audits.length, 0)
    assert.equal(candidates.get("first")?.status, "pending")
    failAudit = false
    await operation()
    assert.equal(rows.length, limit)
  })
}

test("4.1 tenant lock and allowance are independent", async () => {
  seed(); seed("tenant-b"); candidate("other", "tenant-b")
  const release = await hold("tenant-a")
  const blocked = manual()
  try {
    await convert("other", "tenant-b")
    assert.equal(rows.filter((row) => row.userId === "tenant-b").length, limit)
    assert.equal(rows.filter((row) => row.userId === "tenant-a").length, limit - 1)
  } finally { release() }
  await blocked
})

test("4.1 foreign candidate is not found and does not consume allowance", async () => {
  candidate("other", "tenant-b")
  assert.deepEqual(await convert("other"), { status: "not_found" })
  assert.deepEqual(rows, [])
  assert.deepEqual(audits, [])
})

test("4.2 sequential and concurrent real-service confirms return the unique original even at full allowance", async () => {
  seed(); candidate("first")
  const results = await Promise.all([convert("first"), convert("first")])
  assert.deepEqual(results[0], results[1])
  assert.equal(rows.length, limit)
  assert.equal(audits.length, 1)
  candidates.get("first")!.frequency = "custom"
  assert.deepEqual(await convert("first"), results[0], "retry bypasses schedule and allowance")
  assert.equal(audits.length, 1)
  assert.equal(traces.at(-1)!.includes("count"), false)
  assert.equal(revisions.get("tenant-a"), 8); assert.equal(work.length, 1)
  const event = audits[0] as { eventType: string; metadata: { sourceCandidateId: string }; dedupeKey: string }
  assert.equal(event.eventType, "COMMITMENT_CREATED_FROM_DETECTION")
  assert.equal(event.metadata.sourceCandidateId, "first")
  assert.equal(event.dedupeKey, "commitguard:conversion:first")
})

test("4.2 converted candidate cannot be reopened, ignored or rejected; non-edit patches are rejected", async () => {
  candidate("first")
  const original = await convert("first")
  for (const action of ["edit", "ignore", "not_a_commitment"] as const) {
    assert.deepEqual(await detection.reviewDetectedCommitmentCandidate({ userId: "tenant-a", candidateId: "first", action }),
      { status: "conflict", reason: "candidate_already_converted", commitmentId: "commitmentId" in original ? original.commitmentId : undefined })
  }
  await assert.rejects(detection.reviewDetectedCommitmentCandidate({ userId: "tenant-a", candidateId: "first", action: "confirm", patch: { name: "Ignored correction" } }), /Patch is only supported/)
  assert.equal(audits.length, 1)
})

test("4.2 converted legacy candidate without audit proof fails closed, not another creation", async () => {
  candidate("first")
  candidates.get("first")!.status = "converted"
  assert.deepEqual(await convert("first"), { status: "conflict", reason: "conversion_review_required", reviewReasons: ["missing_audit_evidence"] })
  assert.equal(rows.length, 0)
  assert.equal(audits.length, 0)
})

test("4.2 ignored/rejected candidates require deliberate edit before conversion", async () => {
  candidate("first")
  for (const status of ["ignored", "not_a_commitment"]) {
    candidates.get("first")!.status = status
    assert.deepEqual(await convert("first"), { status: "conflict", reason: "invalid_candidate_transition" })
  }
  assert.equal(rows.length, 0)
  assert.equal(audits.length, 0)
})

for (const failure of ["revision", "work", "audit"] as const) for (const kind of ["manual", "convert"] as const) {
  test(`4.4 ${kind}: ${failure} failure rolls back creation, conversion, audit, revision and work`, async () => {
    candidate("first")
    failRevision = failure === "revision"; failWork = failure === "work"; failAudit = failure === "audit"
    await assert.rejects(kind === "manual" ? manual() : convert("first"), new RegExp(`synthetic ${failure} failure`))
    assert.deepEqual(rows, []); assert.deepEqual(audits, []); assert.deepEqual(work, [])
    assert.equal(revisions.has("tenant-a"), false); assert.equal(candidates.get("first")!.status, "pending")
    failRevision = false; failWork = false; failAudit = false
    await (kind === "manual" ? manual() : convert("first"))
    assert.equal(revisions.get("tenant-a"), 8); assert.equal(work.length, 1); assert.equal(audits.length, 1)
  })
}

test("4.4 candidate review edits/ignore/reject do not change calculation inputs until conversion", async () => {
  candidate("first")
  for (const action of ["ignore", "edit", "not_a_commitment", "edit"] as const) {
    await detection.reviewDetectedCommitmentCandidate({ userId: "tenant-a", candidateId: "first", action,
      ...(action === "edit" ? { patch: { typicalAmountCents: 2000 } } : {}) })
    assert.equal(work.length, 0); assert.equal(revisions.get("tenant-a"), 7)
  }
  await convert("first")
  assert.equal(revisions.get("tenant-a"), 8); assert.equal(work.length, 1)
})