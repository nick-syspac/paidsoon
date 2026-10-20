import "@/tests/helpers/subscriptionAccess"
import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import { Prisma, type Commitment } from "@/lib/generated/prisma/client"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { buildCommitGuardSummary } from "@/lib/commitguard/summary"
import { syntheticWorkspace, workspaceNow } from "@/tests/helpers/commitGuardWorkspace"
import { CommitGuardRenewals } from "@/components/dashboard/commitguard/CommitGuardRenewals"
import { CommitGuardUpcoming } from "@/components/dashboard/commitguard/CommitGuardUpcoming"
import { selectWorkspaceCommitments } from "@/lib/commitguard/workspaceFilters"
import { commitmentDraftPatch, commitmentEditDraft } from "@/lib/commitguard/commitmentEditor"

const now = new Date("2026-10-19T12:00:00Z")
const base: Commitment = {
  id: "owned", userId: "tenant-a", name: "Synthetic", description: null, category: "other",
  amountCents: 1000, currency: "aud", frequency: "monthly", nextDueDate: null,
  startDate: null, endDate: null, recurrenceRule: null, supplierName: null, supplierId: null,
  accountId: null, source: "manual", status: "active", confidence: "high", noticePeriodDays: null,
  renewalDate: null, autoRenew: false, cancellable: true, essentiality: "operational", notes: null,
  linkedSpendInsightId: null, linkedCostGuardAlertId: null, sourceDetectionCandidateId: null,
  archivedAt: null, pausedAt: null, cancelledAt: null, expiredAt: null, createdAt: now, updatedAt: now,
}
let row: Commitment, audits: Array<{ inputRevision?: number; metadata: {
  changedFields: Record<string, unknown>; currency?: string; previousCurrency?: string
} }>
let failAudit: boolean, allowed: boolean, user: { id: string } | null
let revision: number, work: unknown[][], failRevision: boolean, failWork: boolean
let writes: number, transactions: number
let tail = Promise.resolve()
let service: typeof import("@/lib/commitguard/service")
let item: typeof import("@/app/api/commitguard/commitments/[id]/route")
let actions: typeof import("@/app/api/commitguard/commitments/[id]/actions/route")
let CommitmentMutationConflict: typeof import("@/lib/commitguard/commitmentMutation").CommitmentMutationConflict

before(async () => {
  await mock.module("@/lib/commitguard/entitlements", { namedExports: {
    requireCommitGuardCoreAccess: async () => { if (!allowed) throw new Error("Upgrade required") },
    getCommitGuardEntitlements: async () => ({ hasCoreAccess: allowed }),
  } })
  await mock.module("@/lib/billing", { namedExports: { requireFeature: async () => allowed } })
  await mock.module("@/lib/supabase/server", { namedExports: {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
  } })
  await mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async (tenant: string, fn: (tx: unknown) => Promise<unknown>) => {
      transactions++
      let release!: () => void, locked = false, rowLocked = false
      let draft: Commitment, pending: typeof audits
      let draftRevision = revision
      const pendingWork: unknown[][] = []
      const tx = {
        $executeRaw: async (sql: TemplateStringsArray, key: string) => {
          assert.equal(sql.join("?"), "SELECT pg_advisory_xact_lock(hashtext(?))")
          assert.equal(key, `commitguard:${tenant}`)
          const previous = tail
          tail = new Promise<void>((resolve) => { release = resolve })
          await previous
          locked = true; draft = structuredClone(row); pending = []
          draftRevision = revision
        },
        $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
          assert.equal(locked, true)
          if (sql.join("").includes("INSERT INTO public.commit_guard_work_items")) {
            assert.equal(rowLocked, true)
            assert.deepEqual(values.slice(1), [tenant, `evaluation:${draftRevision}`, draftRevision])
            if (failWork) throw new Error("synthetic work failure")
            pendingWork.push(values)
            return [{ id: "work" }]
          }
          const [userId, id] = values
          assert.match(sql.join("?"), /SELECT id FROM commitments WHERE user_id = \? AND id = \? FOR UPDATE/)
          assert.equal(userId, tenant)
          rowLocked = true
          return draft.userId === tenant && draft.id === id ? [{ id }] : []
        },
        commitment: {
          findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
            assert.equal(rowLocked, true)
            assert.deepEqual(where, { id: draft.id, userId: tenant })
            return draft
          },
          update: async ({ where, data }: { where: object; data: object }) => {
            assert.equal(rowLocked, true)
            assert.deepEqual(where, { id: draft.id, userId: tenant })
            writes++
            draft = { ...draft, ...Object.fromEntries(Object.entries(data)
              .filter(([, value]) => value !== undefined)
              .map(([key, value]) => [key, value === Prisma.DbNull ? null : value])), updatedAt: new Date(now.getTime() + 1) }
            return draft
          },
        },
        commitmentEvent: { create: async ({ data }: { data: typeof audits[number] }) => {
          if (failAudit) throw new Error("synthetic private database error")
          pending.push(data)
        } },
        commitGuardSetting: {
          findUnique: async () => ({ alertCommitmentAmountChanged: false }),
          upsert: async ({ where, update }: { where: object; update: object }) => {
            assert.equal(rowLocked, true)
            assert.deepEqual(where, { userId: tenant })
            assert.deepEqual(update, { calculationRevision: { increment: 1 } })
            if (failRevision) throw new Error("synthetic revision failure")
            return { calculationRevision: ++draftRevision }
          },
        },
      }
      try {
        const result = await fn(tx)
        if (locked) { row = draft!; audits.push(...pending!); revision = draftRevision; work.push(...pendingWork) }
        return result
      } finally { release?.() }
    },
  } })
  ;({ CommitmentMutationConflict } = await import("@/lib/commitguard/commitmentMutation"))
  service = await import("@/lib/commitguard/service")
  item = await import("@/app/api/commitguard/commitments/[id]/route")
  actions = await import("@/app/api/commitguard/commitments/[id]/actions/route")
})
beforeEach(() => {
  row = structuredClone(base); audits = []; writes = 0; transactions = 0
  failAudit = false; allowed = true; user = { id: "tenant-a" }; tail = Promise.resolve()
  revision = 7; work = []; failRevision = false; failWork = false
})
const statuses = ["active", "upcoming", "ending", "review", "paused", "cancelled", "expired"]
const eligible = statuses.slice(0, 4)
const act = (action: "pause" | "resume" | "cancel" | "confirm") => service.transitionCommitment("tenant-a", "owned", action, "tenant-a")

for (const status of statuses) for (const action of ["pause", "resume", "cancel", "confirm"] as const) {
  for (const confidence of ["high", "confirmed"]) test(`4.3 real service ${action} from ${status}/${confidence}`, async () => {
    row.status = status; row.confidence = confidence
    row.pausedAt = status === "paused" ? now : null
    row.cancelledAt = status === "cancelled" ? now : null
    const before = structuredClone(row)
    const valid = action === "pause" ? eligible.includes(status) || status === "paused"
      : action === "resume" ? status === "paused"
        : action === "cancel" ? status !== "expired" : eligible.includes(status)
    const noop = action === "pause" && status === "paused" || action === "cancel" && status === "cancelled"
      || action === "confirm" && confidence === "confirmed"
    if (!valid) {
      await assert.rejects(act(action), CommitmentMutationConflict)
      assert.deepEqual(row, before); assert.equal(writes, 0); assert.equal(audits.length, 0)
      assert.equal(revision, 7); assert.equal(work.length, 0)
    } else {
      const result = await act(action)
      assert.ok(result)
      if (noop) { assert.equal(result.audit, null); assert.deepEqual(row, before); assert.equal(writes, 0) }
      else {
        assert.equal(audits.length, 1)
        assert.equal(row.status, action === "confirm" ? status : action === "pause" ? "paused" : action === "resume" ? "active" : "cancelled")
        if (action === "confirm") {
          assert.equal(row.confidence, "confirmed")
          assert.deepEqual(row.pausedAt, before.pausedAt); assert.deepEqual(row.cancelledAt, before.cancelledAt)
          assert.deepEqual(audits[0].metadata.changedFields, { confidence: { before: "high", after: "confirmed" } })
        }
        if (action === "resume") assert.equal(row.pausedAt, null)
      }
      assert.equal(revision, noop ? 7 : 8); assert.equal(work.length, noop ? 0 : 1)
    }
  })
}

test("4.3 concurrent pause/cancel/confirm and identical PATCH retries persist one audit only", async () => {
  for (const action of ["pause", "cancel", "confirm"] as const) {
    row = structuredClone(base); audits = []; writes = 0
    revision = 7; work = []
    const results = await Promise.all([act(action), act(action)])
    assert.equal(results.filter((result) => result?.audit !== null).length, 1)
    assert.equal(audits.length, 1); assert.equal(writes, 1)
    assert.equal(revision, 8); assert.equal(work.length, 1)
  }
  row = structuredClone(base); audits = []; writes = 0
  revision = 7; work = []
  await Promise.all([service.updateCommitment("tenant-a", "owned", { notes: "Reviewed" }),
    service.updateCommitment("tenant-a", "owned", { notes: "Reviewed" })])
  assert.equal(audits.length, 1); assert.equal(writes, 1)
  assert.equal(revision, 8); assert.equal(work.length, 1)
})

for (const failure of ["revision", "work", "audit"] as const) {
  for (const kind of ["patch", "pause", "resume", "cancel", "confirm"] as const) {
    test(`4.4 ${kind}: ${failure} failure rolls back commitment, audit, revision and work`, async () => {
      if (kind === "resume") row = { ...row, status: "paused", pausedAt: now }
      const before = structuredClone(row)
      failRevision = failure === "revision"; failWork = failure === "work"; failAudit = failure === "audit"
      await assert.rejects(kind === "patch"
        ? service.updateCommitment("tenant-a", "owned", { notes: "Rollback" }) : act(kind),
      failure === "audit" ? /synthetic private database error/ : new RegExp(`synthetic ${failure} failure`))
      assert.deepEqual(row, before); assert.deepEqual(audits, []); assert.equal(revision, 7); assert.deepEqual(work, [])
    })
  }
}

test("4.4 small and large amount edits request evaluation even with amount alerts disabled", async () => {
  for (const amountCents of [1001, 10000]) {
    await service.updateCommitment("tenant-a", "owned", { amountCents })
  }
  assert.equal(revision, 9); assert.equal(work.length, 2); assert.equal(audits.length, 2)
  assert.deepEqual(audits.map((audit) => audit.inputRevision), [8, 9])
  assert.deepEqual(audits.map((audit) => audit.metadata.changedFields.amountCents), [
    { before: 1000, after: 1001 }, { before: 1001, after: 10000 },
  ])
  assert.ok(audits.every((audit) => audit.metadata.currency === "aud" && audit.metadata.previousCurrency === "aud"))
})

test("4.3 changed-field audit covers every date, recurrence, renewal and classification field; retry keeps updatedAt", async () => {
  const patch = { nextDueDate: new Date("2026-11-01Z"), startDate: new Date("2026-10-01Z"),
    endDate: new Date("2027-01-01Z"), frequency: "annual", renewalDate: new Date("2027-01-01Z"),
    noticePeriodDays: 30, autoRenew: true, confidence: "confirmed", essentiality: "critical" }
  await service.updateCommitment("tenant-a", "owned", patch)
  for (const [key, value] of Object.entries(patch)) {
    assert.deepEqual(audits[0].metadata.changedFields[key], {
      before: base[key as keyof Commitment], after: value instanceof Date ? value.toISOString() : value,
    })
  }
  assert.equal(Object.keys(audits[0].metadata.changedFields).length, Object.keys(patch).length)
  const before = structuredClone(row)
  assert.equal((await service.updateCommitment("tenant-a", "owned", patch))?.audit, null)
  assert.deepEqual(row, before); assert.equal(audits.length, 1)
})

test("4.3 terminal records retain edits and custom repair; archived records reject all mutations", async () => {
  for (const status of ["cancelled", "expired"]) {
    row = { ...structuredClone(base), status, frequency: "custom", recurrenceRule: { legacy: true } }
    await service.updateCommitment("tenant-a", "owned", { notes: "Review" })
    assert.deepEqual(row.recurrenceRule, { legacy: true }); assert.equal(row.status, status)
    await service.updateCommitment("tenant-a", "owned", { frequency: "monthly", recurrenceRule: null })
    assert.equal(row.recurrenceRule, null); assert.equal(row.status, status)
  }
  row.archivedAt = now
  const before = structuredClone(row), count = audits.length
  for (const action of ["pause", "resume", "cancel", "confirm"] as const) await assert.rejects(act(action), CommitmentMutationConflict)
  await assert.rejects(service.updateCommitment("tenant-a", "owned", { notes: "No" }), CommitmentMutationConflict)
  assert.deepEqual(row, before); assert.equal(audits.length, count)
})

function request(body: object, method = "POST"): Request {
  return new Request("http://localhost/api/commitguard/commitments/owned", { method,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
}
const context = (id = "owned") => ({ params: Promise.resolve({ id }) })

test("4.3 real routes: auth, denied access, strict bodies, safe 409/404, safe DTO and 500 rollback", async () => {
  user = null
  assert.equal((await actions.POST(request({ action: "pause" }), context())).status, 401)
  assert.equal((await item.PATCH(request({ notes: "No" }, "PATCH"), context())).status, 401)
  assert.equal(transactions, 0)
  user = { id: "tenant-a" }; allowed = false
  assert.equal((await actions.POST(request({ action: "pause" }), context())).status, 403)
  allowed = true
  for (const body of [{ status: "active" }, { archivedAt: now }, { userId: "forged" }]) {
    assert.equal((await item.PATCH(request(body, "PATCH"), context())).status, 400)
  }
  assert.equal((await actions.POST(request({ action: "archive" }), context())).status, 400)
  for (const id of ["missing", "foreign"]) {
    assert.equal((await actions.POST(request({ action: "pause" }), context(id))).status, 404)
    assert.equal((await item.PATCH(request({ notes: "No" }, "PATCH"), context(id))).status, 404)
  }
  row.status = "expired"
  const conflict = await actions.POST(request({ action: "resume" }), context())
  assert.equal(conflict.status, 409)
  assert.deepEqual(await conflict.json(), { error: "Commitment cannot be changed in its current state", reason: "invalid_commitment_transition" })
  row.archivedAt = now
  assert.equal((await item.PATCH(request({ notes: "No" }, "PATCH"), context())).status, 409)
  row = structuredClone(base)
  const success = await actions.POST(request({ action: "confirm" }), context())
  assert.equal(success.status, 200)
  assert.equal("userId" in (await success.json()).commitment, false)
  failAudit = true
  const before = structuredClone(row), count = audits.length
  const log = mock.method(console, "error", () => {})
  try {
    for (const response of [await actions.POST(request({ action: "pause" }), context()),
      await item.PATCH(request({ notes: "Rollback" }, "PATCH"), context())]) {
      assert.equal(response.status, 500); assert.deepEqual(await response.json(), { error: "Internal server error" })
    }
  } finally { log.mock.restore() }
  assert.deepEqual(row, before); assert.equal(audits.length, count)
})

test("7.5 actual editor patch -> PATCH route -> service -> audit/revision -> summary and renewal/upcoming render", async () => {
  row = { ...row, currency: "usd", renewalDate: new Date("2026-11-01Z"), noticePeriodDays: 7,
    nextDueDate: new Date("2026-10-21Z"), autoRenew: true }
  const dto = syntheticWorkspace()
  const summary = async () => {
    const commitment = (await service.updateCommitment("tenant-a", "owned", {}))!.commitment
    return buildCommitGuardSummary({ cashContext: dto.cashContext, settings: dto.settings, now: workspaceNow,
      calculationRevision: revision, commitments: [commitment],
      tax: { asOf: workspaceNow.toISOString(), applicable: false, amountCents: 0, currency: null, categories: [], quality: { state: "not_applicable", reasons: ["not_applicable"] } },
      coverage: { sources: { userId: "tenant-a", taxApplicable: false, commitments: [commitment], bills: [], taxCategories: [] }, rows: [] } })
  }
  const before = await summary()
  assert.equal(before.renewals[0].severity, "urgent")
  const editorRow = { ...dto.commitments[0], ...row, nextDueDate: row.nextDueDate!.toISOString(),
    renewalDate: row.renewalDate!.toISOString(), startDate: null, endDate: null, archivedAt: null, updatedAt: row.updatedAt.toISOString() }
  const draft = { ...commitmentEditDraft(editorRow), category: "insurance", source: "import", confidence: "low",
    essentiality: "critical", renewalDate: "2027-07-01", noticePeriodDays: "30", autoRenew: "false", frequency: "quarterly" }
  const { patch, errors } = commitmentDraftPatch(editorRow, draft)
  assert.deepEqual(errors, {})
  const response = await item.PATCH(request(patch, "PATCH"), context())
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal("userId" in payload.commitment, false)
  assert.equal(row.status, "active"); assert.equal(row.source, "import"); assert.equal(row.confidence, "low")
  assert.equal(revision, 8); assert.equal(work.length, 1); assert.equal(audits.length, 1)
  assert.deepEqual(Object.keys(audits[0].metadata.changedFields).sort(), Object.keys(patch).sort())
  for (const [field, value] of Object.entries(patch)) assert.deepEqual(
    (audits[0].metadata.changedFields[field] as { after: unknown }).after, value)
  const after = await summary()
  assert.equal(after.renewals[0].severity, "info")
  const serialized = after.renewals.map((entry) => ({ ...entry, renewalDate: entry.renewalDate.toISOString(), noticeCloseDate: entry.noticeCloseDate.toISOString() }))
  const renewalHtml = renderToStaticMarkup(createElement(CommitGuardRenewals, { renewals: serialized, commitments: [payload.commitment], params: {} }))
  for (const text of ["Info", "USD source currency; quarterly", "40.00", "Notice period: 30 days", "Auto-renews: No"]) assert.ok(renewalHtml.includes(text), text)
  const upcoming = selectWorkspaceCommitments([payload.commitment], { category: "insurance", source: "import" }, after.asOf)
  const upcomingHtml = renderToStaticMarkup(createElement(CommitGuardUpcoming, { upcoming, params: {} }))
  for (const text of ["insurance", "import", "critical", "quarterly", "low"]) assert.ok(upcomingHtml.includes(text), text)
  const current = structuredClone(row)
  assert.equal((await item.PATCH(request(patch, "PATCH"), context())).status, 200)
  assert.deepEqual(row, current); assert.equal(audits.length, 1); assert.equal(revision, 8)
})

test("7.5 real PATCH returns field-level errors for malformed dates, notice and classification without writes", async () => {
  for (const field of ["renewalDate", "startDate", "endDate", "nextDueDate"]) {
    for (const value of ["2026-02-30", "2026-02-30T00:00:00Z", "garbage", 1]) {
      const response = await item.PATCH(request({ [field]: value }, "PATCH"), context())
      assert.equal(response.status, 400)
      assert.ok((await response.json()).error.fieldErrors[field].length)
    }
  }
  for (const [field, value] of Object.entries({ noticePeriodDays: 366, confidence: "potential", essentiality: "high", source: "guessed", autoRenew: "false" })) {
    const response = await item.PATCH(request({ [field]: value }, "PATCH"), context())
    assert.equal(response.status, 400); assert.ok((await response.json()).error.fieldErrors[field].length)
  }
  row.startDate = new Date("2026-10-19Z")
  const response = await item.PATCH(request({ endDate: "2026-10-18" }, "PATCH"), context())
  assert.equal(response.status, 400); assert.ok((await response.json()).error.fieldErrors.endDate.length)
  assert.equal(writes, 0); assert.equal(audits.length, 0); assert.equal(revision, 7)
})

for (const status of ["cancelled", "expired"]) test(`7.5 actual PATCH allows full non-status edits for ${status}, but archived remains read-only`, async () => {
  row.status = status; row.frequency = "custom"; row.recurrenceRule = { legacy: true }
  const patch = { category: "tax", confidence: "low", essentiality: "essential", source: "costguard",
    renewalDate: "2027-01-31", noticePeriodDays: 0, autoRenew: false, description: "Terminal review", notes: "Preserved", cancellable: false }
  const response = await item.PATCH(request(patch, "PATCH"), context())
  assert.equal(response.status, 200); assert.equal(row.status, status)
  assert.deepEqual(row.recurrenceRule, { legacy: true }); assert.equal(row.frequency, "custom")
  assert.equal(audits.length, 1)
  row.archivedAt = now
  const before = structuredClone(row), count = audits.length
  for (const body of [patch, {}, { frequency: "annual" }]) assert.equal((await item.PATCH(request(body, "PATCH"), context())).status, 409)
  assert.deepEqual(row, before); assert.equal(audits.length, count)
})