import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { candidateIdentity, evidenceObject } from "@/lib/commitguard/candidateEvidence"
import type { DetectionBillRow } from "@/lib/commitguard/detectionEvidence"

// Real detector, evidence builder, recurrence engine, review, entitlement and
// legacy-audit reconciliation. Only storage/access loading are offline boundaries.
type Row = Record<string, unknown>
const tenant = "synthetic-memory-tenant"
let now: Date, bills: DetectionBillRow[], candidates: Row[], commitments: Row[], events: Row[]
let updates: Row[], failAudit: boolean, revision: number, work: unknown[][]
let detection: typeof import("@/lib/commitguard/detection")
let reviewRoute: typeof import("@/app/api/commitguard/detections/[id]/review/route")
let detectionRoute: typeof import("@/app/api/commitguard/detections/route")
let authenticated = true
const settings = { enabled: true, detectRecurringCommitments: true, detectionMinOccurrences: 3,
  detectionAmountVariancePercent: 100, detectionIntervalToleranceDays: 30, detectionConfidenceThreshold: "low" }

function merge(row: Row, data: Row): Row {
  Object.assign(row, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)))
  return row
}
function series(dates = ["2026-01-31", "2026-02-28", "2026-03-31"], amount = 10000,
  connection = "connection-a", currency = "aud", name = "Synthetic Supplier"): DetectionBillRow[] {
  return dates.map((date) => ({ accountingConnectionId: connection, accountingConnection: { provider: "xero" },
    sourceId: `${date}`, supplierName: name, sourceContactId: null, amountCents: amount, currency,
    dueDate: new Date(`${date}T00:00:00Z`), paidDate: null, sourceUpdatedAt: null,
    createdAt: new Date("2026-01-01"), supplierReference: null, documentNumber: date, status: "paid" }))
}
const run = () => detection.detectCommitmentCandidates(tenant, now)
function review(action: "edit" | "ignore" | "not_a_commitment" | "confirm", patch?: {
  name?: string; frequency?: string; typicalAmountCents?: number; category?: string; suggestedDueDate?: string;
  confidence?: string; source?: string
}) {
  return detection.reviewDetectedCommitmentCandidate({ userId: tenant,
    candidateId: String(candidates[0].id), action, ...(patch ? { patch } : {}), now })
}
function row(): Row { return candidates[0] }
function legacy(overrides: Row = {}): Row {
  return { ...row(), candidateKey: null, ...overrides }
}

before(async () => {
  await mock.module("@/lib/supabase/server", { namedExports: {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: authenticated ? { id: tenant } : null } }) } }),
  } })
  await mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: {
    getEffectiveAccess: async (userId: string) => {
      assert.equal(userId, tenant)
      return resolveEffectiveAccess({ profile: { subscriptionStatus: "active", subscriptionTier: "business_pro",
        stripeSubscriptionId: "sub_synthetic", trialEndsAt: null, billingAccessVersion: 1 }, grant: null,
        billingRisks: [] }, now)
    },
  } })
  await mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async (userId: string, callback: (tx: unknown) => Promise<unknown>) => {
      assert.equal(userId, tenant)
      const baseline = structuredClone({ candidates, commitments, events, revision, work })
      let locked = false
      const tx = {
        $executeRaw: async (sql: TemplateStringsArray, key: string) => {
          assert.match(sql.join("?"), /pg_advisory_xact_lock/)
          assert.equal(key, `commitguard:${tenant}`); locked = true
        },
        $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
          assert.equal(locked, true)
          if (sql.join("").includes("INSERT INTO public.commit_guard_work_items")) {
            work.push(values); return [{ id: "work" }]
          }
          assert.match(sql.join("?"), /WHERE user_id = \? AND id = \? FOR UPDATE/)
          assert.equal(values[0], tenant)
          return candidates.filter((candidate) => candidate.userId === values[0] && candidate.id === values[1])
        },
        commitGuardSetting: { findUnique: async () => settings,
          upsert: async () => ({ calculationRevision: ++revision }) },
        importedBill: { findMany: async () => { assert.equal(locked, true); return bills } },
        importedBankTransaction: { findMany: async () => [] },
        commitmentDetectionCandidate: {
          findUnique: async ({ where }: { where: { userId_candidateKey: { userId: string; candidateKey: string } } }) => {
            assert.equal(locked, true); assert.equal(where.userId_candidateKey.userId, tenant)
            return candidates.find((candidate) => candidate.userId === tenant &&
              candidate.candidateKey === where.userId_candidateKey.candidateKey) ?? null
          },
          findFirst: async ({ where }: { where: Row }) => candidates.find((candidate) =>
            candidate.userId === where.userId && candidate.id === where.id) ?? null,
          findMany: async ({ where }: { where: Row }) => {
            assert.equal(where.userId, tenant)
            return candidates.filter((candidate) => candidate.userId === tenant &&
              (where.candidateKey !== null || candidate.candidateKey === null))
          },
          create: async ({ data }: { data: Row }) => {
            assert.equal(data.userId, tenant); assert.equal(locked, true)
            assert.match(String(data.candidateKey), /^[a-f0-9]{64}$/)
            assert.equal(candidates.some((candidate) => candidate.userId === tenant &&
              candidate.candidateKey === data.candidateKey), false, "tenant unique identity")
            const candidate = { suppressionEvidence: null, userCorrections: null, correctionsEvidenceFingerprint: null,
              rejectionEvidenceFingerprint: null, reviewNote: null, nextSuggestedAt: null,
              conversionReviewRequired: false, ...data, id: `candidate-${candidates.length}` }
            candidates.push(candidate); return candidate
          },
          update: async ({ where, data }: { where: Row; data: Row }) => {
            assert.equal(locked, true)
            updates.push(data)
            return merge(candidates.find((candidate) => candidate.id === where.id)!, data)
          },
        },
        commitment: {
          findUnique: async ({ where }: { where: { userId_sourceDetectionCandidateId: Row } }) => {
            const key = where.userId_sourceDetectionCandidateId
            assert.equal(key.userId, tenant)
            return commitments.find((commitment) => commitment.userId === tenant &&
              commitment.sourceDetectionCandidateId === key.sourceDetectionCandidateId) ?? null
          },
          findMany: async ({ where }: { where: Row }) => {
            assert.equal(where.userId, tenant); return commitments.filter((commitment) => commitment.userId === tenant)
          },
          count: async () => commitments.length,
          create: async ({ data }: { data: Row }) => {
            const commitment = { ...data, id: `commitment-${commitments.length}` }
            commitments.push(commitment); return commitment
          },
          update: async ({ where, data }: { where: { userId_id: Row }; data: Row }) =>
            merge(commitments.find((commitment) => commitment.id === where.userId_id.id)!, data),
        },
        commitmentEvent: {
          findMany: async ({ where }: { where: Row }) => {
            assert.equal(where.userId, tenant)
            return events.filter((event) => event.userId === tenant && event.eventType === where.eventType)
          },
          create: async ({ data }: { data: Row }) => {
            if (failAudit) throw new Error("synthetic audit failure")
            events.push({ ...data, id: `event-${events.length}` })
          },
          upsert: async ({ create }: { create: Row }) => {
            if (failAudit) throw new Error("synthetic audit failure")
            if (!events.some((event) => event.userId === create.userId && event.dedupeKey === create.dedupeKey)) {
              events.push({ ...create, id: `event-${events.length}` })
            }
          },
        },
      }
      try { return await callback(tx) } catch (error) {
        ;({ candidates, commitments, events, revision, work } = baseline)
        throw error
      }
    },
  } })
  detection = await import("@/lib/commitguard/detection")
  reviewRoute = await import("@/app/api/commitguard/detections/[id]/review/route")
  detectionRoute = await import("@/app/api/commitguard/detections/route")
})
beforeEach(() => {
  now = new Date("2026-04-01T12:00:00Z"); bills = series(); candidates = []; commitments = []
  events = []; updates = []; failAudit = false; revision = 0; work = []
  authenticated = true
})

function reviewRequest(action: string, patch?: unknown, id = String(row().id)): Promise<Response> {
  return reviewRoute.POST(new Request("http://synthetic.test/api/commitguard/detections/review", {
    method: "POST", body: JSON.stringify({ action, ...(patch === undefined ? {} : { patch }) }),
  }), { params: Promise.resolve({ id }) })
}

test("5.5 actual detection route and service return safe candidates/results with review fields", async () => {
  const response = await detectionRoute.POST()
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.detection.created, 1)
  const candidate = payload.candidates[0]
  assert.equal(candidate.currency, "aud")
  assert.equal(candidate.supplierName, "Synthetic Supplier")
  assert.equal(candidate.suggestedDueDate.slice(0, 10), "2026-10-31")
  assert.equal(candidate.evidenceReviewRequired, false)
  assert.equal(candidate.conversionReviewRequired, false)
  assert.equal(candidate.evidence.observations.length, 3)
  const json = JSON.stringify(candidate)
  for (const internal of ["userId", "connectionId", "candidateKey", "evidenceFingerprint", "suppressionEvidence"]) {
    assert.equal(json.includes(`"${internal}"`), false, internal)
  }
})

test("5.5 actual route/service persist all allowed corrections and confirmation uses them", async () => {
  await run()
  const patch = { name: "Owner correction", category: "rent", typicalAmountCents: 12345,
    frequency: "quarterly", confidence: "low", source: "manual", suggestedDueDate: "2026-12-31" }
  assert.equal((await reviewRequest("edit", patch)).status, 200)
  for (const [key, value] of Object.entries(patch)) {
    assert.equal(key === "suggestedDueDate" ? (row()[key] as Date).toISOString().slice(0, 10) : row()[key], value)
  }
  assert.equal((await reviewRequest("confirm")).status, 200)
  assert.equal(commitments[0].amountCents, 12345)
  assert.equal(commitments[0].currency, "aud")
  assert.equal(commitments[0].frequency, "quarterly")
  assert.equal((commitments[0].nextDueDate as Date).toISOString().slice(0, 10), "2026-12-31")
})

for (const patch of [undefined, {}, { typicalAmountCents: -1 }, { typicalAmountCents: 2_147_483_648 },
  { typicalAmountCents: 1.5 }, { frequency: "custom" }, { suggestedDueDate: "2026-02-30" },
  { name: " " }, { category: "" }, { confidence: "guessed" }, { source: "forged" },
  { currency: "usd" }, { supplierName: "Other" }, { notes: "New unapproved field" }, { userId: "foreign" }]) {
  test(`5.5 actual route rejects invalid/unapproved edit ${JSON.stringify(patch)}`, async () => {
    await run(); const baseline = structuredClone({ candidates, commitments, events, revision, work })
    assert.equal((await reviewRequest("edit", patch)).status, 400)
    assert.deepEqual({ candidates, commitments, events, revision, work }, baseline)
  })
}

test("5.5 real route/service return original conversion and conflict for edit/ignore/reject", async () => {
  await run()
  const first = await (await reviewRequest("confirm")).json()
  const baseline = structuredClone({ candidates, commitments, events, revision, work })
  assert.deepEqual(await (await reviewRequest("confirm")).json(), first)
  for (const action of ["edit", "ignore", "not_a_commitment"]) {
    const response = await reviewRequest(action, action === "edit" ? { name: "Reopen" } : undefined)
    assert.equal(response.status, 409)
    assert.equal((await response.json()).commitmentId, first.commitmentId)
    assert.deepEqual({ candidates, commitments, events, revision, work }, baseline)
  }
})

for (const action of ["ignore", "not_a_commitment"] as const) {
  test(`5.5 real route/service ${action} retry is no-op; deliberate edit reopens`, async () => {
    await run(); assert.equal((await reviewRequest(action)).status, 200)
    const baseline = structuredClone({ candidates, events, updates, revision, work })
    assert.equal((await reviewRequest(action)).status, 200)
    assert.deepEqual({ candidates, events, updates, revision, work }, baseline)
    assert.equal((await reviewRequest("confirm")).status, 409)
    assert.equal((await reviewRequest("edit", { name: "Deliberately reviewed" })).status, 200)
    assert.equal(row().status, "pending")
    assert.equal(revision, 0)
    assert.deepEqual(work, [])
  })
}

test("5.5 actual review route maps auth, foreign/missing, schedule and legacy conflicts safely", async () => {
  await run(); authenticated = false
  assert.equal((await reviewRequest("ignore")).status, 401)
  authenticated = true
  assert.equal((await reviewRequest("ignore", undefined, "foreign")).status, 404)
  row().conversionReviewRequired = true
  const response = await reviewRequest("confirm")
  assert.equal(response.status, 409)
  assert.equal((await response.json()).reason, "conversion_review_required")
  row().conversionReviewRequired = false
  row().frequency = "one_off"; row().suggestedDueDate = null
  row().recurrenceAnchor = null; row().evidence = null
  assert.equal((await reviewRequest("confirm")).status, 409)
})

test("5.5 actual route/service rollback audit failure returns safe 500 and no partial edit", async () => {
  await run(); const baseline = structuredClone({ candidates, commitments, events, revision, work })
  failAudit = true
  const response = await reviewRequest("edit", { name: "Must roll back" })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "Internal server error" })
  assert.deepEqual({ candidates, commitments, events, revision, work }, baseline)
})

test("5.3 stable key scopes connection, normalized supplier, currency and supported frequency, never owner fields", async () => {
  await run(); const key = row().candidateKey
  assert.equal(key, candidateIdentity({ connectionId: "connection-a", supplierKey: "name:synthetic supplier",
    currency: "aud", frequency: "monthly" }))
  await review("edit", { name: "Owner title", frequency: "quarterly", typicalAmountCents: 9000 })
  bills = series(undefined, 10000, "connection-a", "AUD", " SYNTHETIC--Supplier ")
  assert.equal((await run()).created, 0); assert.equal(candidates.length, 1); assert.equal(row().candidateKey, key)
  assert.equal(row().name, "Owner title"); assert.equal(row().frequency, "quarterly")
  bills.push(...series(undefined, 10000, "connection-b"), ...series(undefined, 10000, "connection-a", "usd"))
  assert.equal((await run()).created, 2)
  bills = series(["2026-01-01", "2026-01-08", "2026-01-15"])
  assert.equal((await run()).created, 1)
  assert.equal(new Set(candidates.map((candidate) => candidate.candidateKey)).size, 4)
  assert.equal(candidateIdentity({ connectionId: "a", supplierKey: "b", currency: "aud", frequency: "custom" }), null)
})

test("5.3 corrections survive unchanged and new evidence; safe list identifies changed evidence for review", async () => {
  await run()
  await review("edit", { name: "Corrected", typicalAmountCents: 1234, category: "rent", frequency: "annual",
    confidence: "low", source: "manual", suggestedDueDate: "2026-05-17" })
  const corrections = structuredClone(row().userCorrections)
  const original = row().correctionsEvidenceFingerprint
  await run()
  assert.equal(row().reviewNote, null)
  assert.equal((await detection.listDetectedCommitmentCandidates(tenant))[0].evidenceReviewRequired, false)
  bills.push(...series(["2026-04-30"]))
  await run()
  assert.equal(row().reviewNote, "evidence_changed_since_correction")
  assert.equal(row().correctionsEvidenceFingerprint, original)
  assert.deepEqual(row().userCorrections, corrections)
  assert.equal(row().name, "Corrected"); assert.equal(row().typicalAmountCents, 1234)
  assert.equal(row().category, "rent"); assert.equal(row().frequency, "annual")
  assert.equal(row().source, "manual"); assert.equal(row().confidence, "low")
  assert.equal((row().suggestedDueDate as Date).toISOString(), "2026-05-17T00:00:00.000Z")
  const dto = (await detection.listDetectedCommitmentCandidates(tenant))[0]
  assert.equal(dto.evidenceReviewRequired, true)
  assert.equal("userId" in dto, false)
  assert.equal(evidenceObject(dto.evidence).sampleCount, 4)
  await review("confirm")
  assert.equal(commitments[0].amountCents, 1234); assert.equal(commitments[0].frequency, "annual")
  assert.equal((commitments[0].nextDueDate as Date).toISOString(), "2026-05-17T00:00:00.000Z")
})

for (const action of ["ignore", "not_a_commitment"] as const) {
  test(`5.3 ${action}: immutable baseline, no-op retry, one new ID suppressed, two distinct IDs reactivate`, async () => {
    await run(); await review("edit", { typicalAmountCents: 2000 }); await review(action)
    const baseline = structuredClone(row().suppressionEvidence)
    const count = events.length
    await review(action)
    assert.equal(events.length, count)
    assert.equal(evidenceObject(baseline).typicalAmountCents, 10000, "observed amount, not corrected amount")
    bills.push(...series(["2026-04-30"]))
    for (let index = 0; index < 3; index++) {
      assert.equal((await run()).updated, 0)
      assert.deepEqual(row().suppressionEvidence, baseline)
      assert.equal(row().status, action === "ignore" ? "ignored" : "not_a_commitment")
    }
    // Duplicate rows/retries and informational alternates do not count as new samples.
    bills.push({ ...bills[3] })
    assert.equal((await run()).updated, 0)
    bills.push(...series(["2026-05-31"]))
    assert.equal((await run()).updated, 1); assert.equal(row().status, "pending")
    assert.equal(row().typicalAmountCents, 2000)
    await review(action)
    assert.notDeepEqual(row().suppressionEvidence, baseline, "new deliberate action captures current evidence")
    assert.equal((await run()).updated, 0)
  })

  for (const [oldAmount, delta, reopened] of [[1000, 499, false], [1000, 500, true],
    [10000, 1499, false], [10000, 1500, true], [10010, 1501, false], [10010, 1502, true],
    [10000, -1499, false], [10000, -1500, true]] as const) {
    test(`5.3 ${action}: actual engine amount boundary ${oldAmount} delta ${delta}`, async () => {
      bills = series(undefined, oldAmount); await run(); await review(action)
      const baseline = structuredClone(row().suppressionEvidence)
      bills = series(undefined, oldAmount + delta) // Same IDs, changed observed amounts.
      const result = await run()
      assert.equal(result.updated, reopened ? 1 : 0)
      assert.equal(row().status, reopened ? "pending" : action === "ignore" ? "ignored" : "not_a_commitment")
      assert.deepEqual(row().suppressionEvidence, baseline)
    })
  }
}

test("5.3 new distinct IDs use set difference, not sample-count increase", async () => {
  await run(); await review("ignore")
  bills = series(["2026-02-28", "2026-03-31", "2026-04-30"])
  assert.equal((await run()).updated, 0)
  bills = series(["2026-03-31", "2026-04-30", "2026-05-31"])
  assert.equal((await run()).updated, 1)
})

test("5.3 absent legacy suppression baseline never reopens from guessed count or amount", async () => {
  await run(); row().status = "ignored"; row().suppressionEvidence = null
  bills = series(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"], 20000)
  assert.equal((await run()).updated, 0); assert.equal(row().status, "ignored")
})

for (const [dates, today, expected] of [
  [["2026-01-31", "2026-02-28", "2026-03-31"], "2026-04-01", "2026-04-30"],
  [["2026-01-31", "2026-02-28", "2026-03-31"], "2026-03-31", "2026-03-31"],
  [["2028-01-31", "2028-02-29", "2028-03-31"], "2028-04-01", "2028-04-30"],
  [["2000-01-03", "2000-01-10", "2000-01-17"], "2026-10-19", "2026-10-19"],
  [["2020-02-29", "2021-02-28", "2022-02-28"], "2028-02-01", "2028-02-29"],
] as const) {
  test(`5.3 real observed schedule ${dates[0]} evaluated ${today} suggests ${expected}`, async () => {
    bills = series([...dates]); now = new Date(`${today}T23:59:59Z`)
    await run()
    assert.equal((row().suggestedDueDate as Date).toISOString().slice(0, 10), expected)
    assert.equal((row().recurrenceAnchor as Date).toISOString().slice(0, 10), dates[0])
    assert.equal((row().latestObservedAt as Date).toISOString().slice(0, 10), dates[2])
    const observations = evidenceObject(row().evidence).observations as Row[]
    assert.equal(observations.length, 3)
    assert.equal(new Set(observations.map((observation) => observation.observationId)).size, 3)
    assert.ok(observations.every((observation) => typeof observation.date === "string"))
    await review("confirm")
    assert.equal((commitments[0].nextDueDate as Date).toISOString().slice(0, 10), expected)
  })
}

test("5.3 delayed confirmation advances from January 31 anchor, never February clamp or today plus period", async () => {
  now = new Date("2026-02-01"); await run()
  assert.equal((row().suggestedDueDate as Date).toISOString().slice(0, 10), "2026-02-28")
  now = new Date("2026-03-01T17:00:00Z"); await review("confirm")
  assert.equal((commitments[0].nextDueDate as Date).toISOString().slice(0, 10), "2026-03-31")
  const original = structuredClone(row()), count = events.length
  bills.push(...series(["2026-04-30", "2026-05-31"], 15000))
  assert.equal((await run()).updated, 0); assert.deepEqual(row(), original)
  assert.equal(events.length, count)
  assert.deepEqual(await review("confirm"), { status: "updated", commitmentId: commitments[0].id })
  assert.equal(commitments.length, 1)
})

test("5.3 frequency correction recomputes suggested schedule and explicit old due date is never advanced", async () => {
  await run(); await review("edit", { frequency: "quarterly" })
  assert.equal((row().suggestedDueDate as Date).toISOString().slice(0, 10), "2026-04-30")
  now = new Date("2026-05-01"); await run()
  assert.equal((row().suggestedDueDate as Date).toISOString().slice(0, 10), "2026-07-31")
  await review("edit", { suggestedDueDate: "2026-04-14" }); await run(); await review("confirm")
  assert.equal((commitments[0].nextDueDate as Date).toISOString().slice(0, 10), "2026-04-14")
})

test("5.3 owner can correct an inferred recurrence to a one-off using its valid saved suggestion", async () => {
  await run(); await review("edit", { frequency: "one_off" })
  now = new Date("2026-05-01")
  await review("confirm")
  assert.equal(commitments[0].frequency, "one_off")
  assert.equal((commitments[0].nextDueDate as Date).toISOString().slice(0, 10), "2026-04-30")
})

test("5.3 legacy stored suggestion advances but missing schedule returns review conflict, never guessed dates", async () => {
  await run(); row().recurrenceAnchor = null; row().suggestedDueDate = null
  assert.deepEqual(await review("confirm"), { status: "conflict", reason: "candidate_schedule_review_required" })
  assert.equal(commitments.length, 0)
  row().suggestedDueDate = new Date("2026-01-31")
  await review("confirm")
  assert.equal((commitments[0].nextDueDate as Date).toISOString().slice(0, 10), "2026-04-30")
})

test("5.3 legacy complete unique identity is adopted; ambiguous or missing identity never chooses newest or creates duplicate", async () => {
  await run(); candidates = [legacy()]
  assert.equal((await run()).updated, 1); assert.ok(row().candidateKey)
  candidates = [legacy(), legacy({ id: "second" })]
  const before = structuredClone(candidates)
  assert.deepEqual((await run()).warnings, ["candidate_identity_review_required"])
  assert.deepEqual(candidates, before)
  candidates = [legacy({ evidence: { sampleCount: 3 }, connectionId: null })]
  assert.deepEqual((await run()).warnings, ["candidate_identity_review_required"])
  assert.equal(candidates.length, 1); assert.equal(row().candidateKey, null)
})

test("5.3 unique contact identity survives supplier rename without grouping another connection", async () => {
  bills = series().map((bill) => ({ ...bill, sourceContactId: "contact-a" }))
  await run(); const key = row().candidateKey
  bills = bills.map((bill) => ({ ...bill, supplierName: "Renamed synthetic" }))
  assert.equal((await run()).updated, 1); assert.equal(row().candidateKey, key); assert.equal(candidates.length, 1)
})

for (const count of [0, 1, 2]) {
  test(`5.3 converted legacy with ${count} audit proofs stays frozen; task 4.2 unique-audit rule retained`, async () => {
    await run(); candidates = [legacy({ status: "converted" })]
    commitments = [{ id: "legacy-commitment", userId: tenant, sourceDetectionCandidateId: null }]
    events = Array.from({ length: count }, (_, index) => ({ id: `audit-${index}`, userId: tenant,
      eventType: "COMMITMENT_CREATED_FROM_DETECTION", commitmentId: "legacy-commitment",
      detectionCandidateId: row().id, metadata: { sourceCandidateId: row().id } }))
    const before = structuredClone(row())
    assert.equal((await run()).updated, 0); assert.deepEqual(row(), before)
    const result = await review("confirm")
    assert.equal(result.status, count === 1 ? "updated" : "conflict")
    if (count === 1) assert.equal(commitments[0].sourceDetectionCandidateId, row().id)
    else assert.ok(result.status === "conflict" && result.reason === "conversion_review_required")
    assert.equal(commitments.length, 1); assert.equal(events.length, count)
  })
}

test("5.3 pending row with conversion audit/link is never refreshed or reopened", async () => {
  await run()
  commitments = [{ id: "existing", userId: tenant, sourceDetectionCandidateId: row().id }]
  const original = structuredClone(row())
  bills.push(...series(["2026-04-30", "2026-05-31"]))
  assert.equal((await run()).updated, 0); assert.deepEqual(row(), original)
  assert.deepEqual(await review("confirm"), { status: "updated", commitmentId: "existing" })
})

test("5.3 incomplete legacy identity cannot borrow an edited frequency; different known connections remain independent", async () => {
  await run()
  candidates = [legacy({ frequency: "annual", userCorrections: null,
    evidence: { connectionId: "connection-a", supplierKey: "name:synthetic supplier", currency: "aud",
      averageIntervalDays: 29.5 } })]
  assert.equal((await run()).updated, 1)
  assert.equal(candidates.length, 1)
  candidates = [legacy({ evidence: { connectionId: "connection-a", supplierKey: "name:synthetic supplier" } })]
  assert.deepEqual((await run()).warnings, ["candidate_identity_review_required"])
  assert.equal(row().candidateKey, null)
  bills = series(undefined, 10000, "connection-b")
  assert.equal((await run()).created, 1, "proven different connection is not an ambiguous match")
})

test("5.3 unsupported observed intervals create no candidate without a supported stable identity", async () => {
  bills = series(["2026-01-01", "2026-01-21", "2026-02-10"])
  assert.deepEqual(await run(), { created: 0, updated: 0, skipped: 1,
    warnings: ["unsupported_candidate_frequency"] })
  assert.deepEqual(candidates, []); assert.deepEqual(events, [])
})

test("5.3 original anchor survives removal of the first observed source row", async () => {
  await run()
  bills = series(["2026-02-28", "2026-03-31", "2026-04-30"])
  now = new Date("2026-05-01")
  await run()
  assert.equal((row().recurrenceAnchor as Date).toISOString().slice(0, 10), "2026-01-31")
  assert.equal((row().suggestedDueDate as Date).toISOString().slice(0, 10), "2026-05-31")
})

test("5.3 one missing-date legacy candidate can be explicitly repaired; invalid due dates never persist", async () => {
  await run(); row().recurrenceAnchor = null; row().suggestedDueDate = null
  const original = structuredClone(row())
  for (const suggestedDueDate of ["2026-02-30", "2026-13-01", "2026-10-19T00:00:00Z", "today"]) {
    await assert.rejects(review("edit", { suggestedDueDate }), (error: unknown) => error instanceof Error && error.name === "ZodError")
    assert.deepEqual(row(), original)
  }
  await review("edit", { suggestedDueDate: "2026-10-31" })
  await review("confirm")
  assert.equal((commitments[0].nextDueDate as Date).toISOString().slice(0, 10), "2026-10-31")
})

test("5.3 review baselines/corrections and conversion roll back together with failed audit", async () => {
  await run(); const original = structuredClone(row())
  failAudit = true
  for (const action of ["ignore", "not_a_commitment", "edit", "confirm"] as const) {
    await assert.rejects(review(action, action === "edit" ? { typicalAmountCents: 20 } : undefined), /synthetic audit failure/)
    assert.deepEqual(row(), original); assert.equal(commitments.length, 0); assert.equal(work.length, 0)
    assert.equal(revision, 0)
  }
})