import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { workspaceCommitment, workspaceSettings, workspaceNow, syntheticWorkspace } from "@/tests/helpers/commitGuardWorkspace"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { selectWorkspaceCommitments, WorkspaceQuerySchema, type WorkspaceQuery } from "@/lib/commitguard/workspaceFilters"
import { createWorkspaceStore } from "@/lib/commitguard/workspaceClient"
import { CommitGuardUpcoming } from "@/components/dashboard/commitguard/CommitGuardUpcoming"

let user: { id: string } | null = { id: "tenant-a" }
let core = true
let fail = false
let transactions = 0
let revision = 3
let commitmentRows = [workspaceCommitment]
let loader: typeof import("@/lib/commitguard/workspaceLoader").loadCommitGuardWorkspace
let GET: typeof import("@/app/api/commitguard/workspace/route").GET
let Dashboard: typeof import("@/components/dashboard/commitguard/CommitGuardDashboard").CommitGuardDashboard
let Editor: typeof import("@/components/dashboard/commitguard/CommitGuardCommitmentEditor").CommitGuardCommitmentEditor
before(async () => {
  await mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh: () => {} }) } })
  await mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) } })
  await mock.module("@/lib/billing", { namedExports: {
    requireFeature: async (_id: string, feature: string) => feature === "commitguard_core" ? core : feature !== "tax_buffer_basic",
    getCommitmentLimitForTier: () => 100, getCommitmentDetectionCandidateLimitForTier: () => 100,
    getSubscriptionTier: async () => "business_pro",
  } })
  await mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: {
    getEffectiveAccess: async () => resolveEffectiveAccess({ profile: { subscriptionTier: "business_pro", subscriptionStatus: "active",
      stripeSubscriptionId: "synthetic", trialEndsAt: null, billingAccessVersion: 1 }, grant: null, billingRisks: [] }, workspaceNow),
  } })
  await mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async (tenant: string, callback: (tx: object) => Promise<unknown>, options: unknown) => {
      assert.equal(tenant, "tenant-a"); assert.deepEqual(options, { isolationLevel: "RepeatableRead" }); transactions++
      if (fail) throw new Error("PRIVATE database internals")
      const snapshotRevision = revision
      const read = <T>(value: T) => async (args: { where: { userId: string } }) => { assert.equal(args.where.userId, tenant); return value }
      // No writes/nested transactions provided: production orchestration and
      // actual summary/coverage/cash/history services execute against read-only delegates.
      return callback({
        commitGuardSetting: { findUnique: read({ ...workspaceSettings, calculationRevision: snapshotRevision }) },
        commitGuardCashContext: { findUnique: read({ ...syntheticWorkspace(3).cashContext, balanceAsOf: new Date("2026-10-19Z"), revision: snapshotRevision }) },
        commitment: { findMany: read(commitmentRows), findFirst: read(workspaceCommitment) },
        commitmentCoverage: { findMany: read([]) }, importedBill: { findMany: read([]) },
        taxReserveCategory: { findMany: read([]) }, taxBufferObligation: { findMany: read([]) },
        commitGuardEvaluationState: { findUnique: read(null) },
        commitmentEvent: { count: read(0), findMany: read([]), findFirst: read(null) },
        commitmentDetectionCandidate: { findMany: read([{ id: "candidate-1", name: "Synthetic detected", category: "software",
          frequency: "monthly", typicalAmountCents: 1000, currency: "usd", source: "import", confidence: "medium", status: "pending",
          supplierName: null, suggestedDueDate: null, latestObservedAt: null, recurrenceAnchor: null, evidence: {}, userCorrections: {},
          conversionReviewRequired: false, userId: "PRIVATE", rawSourceData: "PRIVATE" }]) },
      })
    },
  } })
  ;({ loadCommitGuardWorkspace: loader } = await import("@/lib/commitguard/workspaceLoader"))
  ;({ GET } = await import("@/app/api/commitguard/workspace/route"))
  ;({ CommitGuardDashboard: Dashboard } = await import("@/components/dashboard/commitguard/CommitGuardDashboard"))
  ;({ CommitGuardCommitmentEditor: Editor } = await import("@/components/dashboard/commitguard/CommitGuardCommitmentEditor"))
})
beforeEach(() => { user = { id: "tenant-a" }; core = true; fail = false; transactions = 0; revision = 3; commitmentRows = [workspaceCommitment] })
test("7.2 actual loader runs cash/summary/ledger/renewals/candidates/history in one read-only tenant snapshot", async () => {
  const dto = await loader("tenant-a", { commitmentId: "commitment-1" }, workspaceNow)
  assert.equal(transactions, 1)
  assert.equal(dto.calculationRevision, 3); assert.equal(dto.cashInputRevision, 3)
  assert.equal(dto.summary.inputRevision, dto.cashContext.revision)
  assert.equal(dto.summary.calculationRevision, dto.calculationRevision)
  assert.equal(dto.settings, dto.summary.settings)
  assert.deepEqual({ renewalDate: dto.commitments[0].renewalDate, noticePeriodDays: dto.commitments[0].noticePeriodDays,
    autoRenew: dto.commitments[0].autoRenew, source: dto.commitments[0].source, confidence: dto.commitments[0].confidence,
    essentiality: dto.commitments[0].essentiality, startDate: dto.commitments[0].startDate, endDate: dto.commitments[0].endDate },
  { renewalDate: workspaceCommitment.renewalDate!.toISOString(), noticePeriodDays: 7, autoRenew: true,
    source: "manual", confidence: "confirmed", essentiality: "operational", startDate: null, endDate: null })
  assert.equal(dto.reviewCount, 1); assert.equal(dto.summary.renewals.length, 1)
  assert.equal(dto.linkedCommitment?.name, "Synthetic subscription")
  const json = JSON.stringify(dto)
  for (const forbidden of ["userId", "tenant-a", "PRIVATE", "leaseOwner", "rawSourceData"]) assert.equal(json.includes(forbidden), false, forbidden)
  // Changing the delegate revision only affects the next coherent snapshot.
  revision = 4
  assert.equal(dto.calculationRevision, 3)
  assert.equal((await loader("tenant-a", {}, workspaceNow)).calculationRevision, 4)
})
test("7.2 authenticated workspace endpoint denies missing auth/core and malformed/duplicate queries before reads", async () => {
  const req = (query = "") => new Request(`http://localhost/api/commitguard/workspace${query}`)
  user = null; assert.equal((await GET(req())).status, 401)
  user = { id: "tenant-a" }; core = false; assert.equal((await GET(req())).status, 403)
  core = true
  for (const query of ["?userId=foreign", "?alertPage=1.5", "?eventId=../foreign", "?search=a&search=b", "?cashAvailableCents=1"]) assert.equal((await GET(req(query))).status, 400)
  assert.equal(transactions, 0)
  const response = await GET(req("?status=paused"))
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store")
  fail = true
  const failure = await GET(req())
  assert.equal(failure.status, 500); assert.equal((await failure.text()).includes("PRIVATE"), false)
})
test("7.2 actual dashboard renderer includes all coherent surfaces, dated cash, history and renewal context", async () => {
  const dto = await loader("tenant-a", {}, workspaceNow)
  const html = renderToStaticMarkup(createElement(Dashboard, { initial: dto, params: {} }))
  for (const text of ["Available cash", "Committed (next 30 days)", "Protected cash", "Free cash", "commitment horizons",
    "Upcoming commitments", "Detected commitments", "1 pending review", "Owner-entered cash inputs", "Renewals and notice windows",
    "Synthetic subscription", "data-workspace-revision=\"3\"", "data-input-revision=\"3\""]) assert.ok(html.includes(text), text)
})

test("7.3 actual loader filters before paging all matches and preserves unfiltered financial surfaces", async () => {
  commitmentRows = Array.from({ length: 39 }, (_, index) => ({ ...workspaceCommitment,
    id: `row-${String(index).padStart(2, "0")}`, name: `Record ${index}`, category: index < 14 ? "other" : "software",
    amountCents: index + 1, essentiality: "essential", source: "import", supplierName: "Synthetic supplier",
    linkedSpendInsightId: "insight-1", linkedCostGuardAlertId: "alert-1" }))
  const query: WorkspaceQuery = { category: "software", essentiality: "essential", source: "import", frequency: "monthly",
    currency: "AUD", duePeriod: "7", search: "SUPPLIER", sortBy: "amountCents", sortOrder: "desc",
    costGuardAlertId: "alert-1", linkedSpendInsightId: "insight-1" }
  const first = await loader("tenant-a", query, workspaceNow)
  const second = await loader("tenant-a", { ...query, page: "2" }, workspaceNow)
  const last = await loader("tenant-a", { ...query, page: "9007199254740991" }, workspaceNow)
  assert.equal(first.upcoming.total, 25); assert.equal(first.upcoming.totalPages, 3)
  assert.deepEqual(first.upcoming.items.map((row) => row.id), commitmentRows.slice(27).reverse().map((row) => row.id))
  assert.equal(second.upcoming.items.length, 12); assert.equal(last.upcoming.items.length, 1); assert.equal(last.upcoming.page, 3)
  assert.equal(new Set([...first.upcoming.items, ...second.upcoming.items, ...last.upcoming.items].map((row) => row.id)).size, 25)
  assert.deepEqual(first.summary, last.summary); assert.deepEqual(first.alerts, last.alerts)
  assert.equal(first.commitments.length, 39); assert.equal(first.reviewCount, last.reviewCount)
  assert.equal((await loader("tenant-a", { ...query, page: "-9" }, workspaceNow)).upcoming.page, 1)
})

test("7.3 actual endpoint rejects tampered enums, flags, duplicates, dates, pages and identities before tenant reads", async () => {
  for (const query of ["source=arbitrary", "status=true", "frequency=every_day", "essentiality=high", "sortBy=__proto__", "sortOrder=DROP%20TABLE",
    "currency=US", "duePeriod=8", "dueFrom=2026-02-30", "dueFrom=2026-10-20&dueTo=2026-10-19", "dueFrom=2026-10-19&dueTo=2026-10-19",
    "page=1.2", "page=NaN", "page=Infinity", "page=1e2", "page=9007199254740992", "page=1&page=2", "source[]=manual",
    "__proto__=bad", "constructor=bad", "prototype=bad", "linkedSpendInsightId=../foreign", "costGuardAlertId=a%27%20OR%201=1",
    "userId=foreign", "archived=true", "cashAvailableCents=100"]) {
    const response = await GET(new Request(`http://localhost/api/commitguard/workspace?${query}`))
    assert.equal(response.status, 400, query); assert.deepEqual(await response.json(), { error: "Invalid workspace query" })
  }
  assert.equal(transactions, 0)
  user = null
  assert.equal((await GET(new Request("http://localhost/api/commitguard/workspace?page=NaN"))).status, 401)
  assert.equal(transactions, 0)
})

test("7.3 real route/client store refresh uses the same filters and publishes clamped selection after matching rows disappear", async () => {
  commitmentRows = Array.from({ length: 13 }, (_, index) => ({ ...workspaceCommitment, id: `row-${index}`, source: "import" }))
  const query = "source=import&page=2&alertPage=1&sortBy=name&sortOrder=desc&linkedSpendInsightId=insight-1"
  commitmentRows = commitmentRows.map((row) => ({ ...row, linkedSpendInsightId: "insight-1" }))
  const initial = await loader("tenant-a", WorkspaceQuerySchema.parse(Object.fromEntries(new URLSearchParams(query))), new Date("2026-10-19T00:00:00Z"))
  assert.equal(initial.upcoming.page, 2)
  const store = createWorkspaceStore(initial, query, async (url) => {
    assert.equal(url, `/api/commitguard/workspace?${query}`)
    return GET(new Request(`http://localhost${url}`))
  })
  commitmentRows = commitmentRows.slice(0, 12)
  await store.refresh()
  assert.equal(store.getSnapshot().workspace.upcoming.page, 1)
  assert.equal(store.getSnapshot().workspace.upcoming.total, 12)
  assert.equal(store.getSnapshot().workspace.upcoming.items.length, 12)
})

test("7.3 actual renderer exposes labeled controls, preserved links/form parameters and distinct empty states", async () => {
  commitmentRows = Array.from({ length: 13 }, (_, index) => ({ ...workspaceCommitment, id: `row-${index}`, category: "ops & tools" }))
  const params: WorkspaceQuery = { category: "ops & tools", page: "1", alertPage: "3", eventId: "event-1", commitmentId: "row-1", sortBy: "name", sortOrder: "desc" }
  const dto = await loader("tenant-a", params, workspaceNow)
  const html = renderToStaticMarkup(createElement(CommitGuardUpcoming, { upcoming: dto.upcoming, params }))
  for (const text of ['aria-label="Commitment pagination"', 'rel="next"', 'aria-disabled="true"', 'scope="col"', 'name="alertPage" value="3"',
    'name="eventId" value="event-1"', 'name="commitmentId" value="row-1"', "category=ops+%26+tools", "page=2", "sortBy=name", "sortOrder=desc", "no FX"]) assert.ok(html.includes(text), text)
  for (const name of ["search", "category", "status", "essentiality", "frequency", "source", "currency", "duePeriod", "dueFrom", "dueTo", "sortBy", "sortOrder"]) assert.match(html, new RegExp(`name="${name}"`))
  assert.doesNotMatch(html, /name="page"/)
  const filteredEmpty = selectWorkspaceCommitments(dto.commitments, { category: "missing" }, dto.asOf)
  assert.match(renderToStaticMarkup(createElement(CommitGuardUpcoming, { upcoming: filteredEmpty, params: { category: "missing" } })), /No commitments match these filters/)
  assert.match(renderToStaticMarkup(createElement(CommitGuardUpcoming, { upcoming: selectWorkspaceCommitments([], {}, dto.asOf), params: {} })), /No commitments yet. Add a commitment below/)
})

test("7.5 actual editor renderer exposes writable source/classification/renewal and UTC dates without lifecycle status writes", () => {
  const row = { ...syntheticWorkspace().commitments[0], status: "expired", frequency: "custom" }
  const html = renderToStaticMarkup(createElement(Editor, { row, blocked: false, onSaved: async () => {}, onConflict: () => {}, onCancel: () => {} }))
  for (const field of ["name", "description", "category", "amountCents", "currency", "frequency", "nextDueDate", "startDate", "endDate",
    "confidence", "essentiality", "source", "renewalDate", "noticePeriodDays", "autoRenew", "cancellable", "supplierName", "notes"]) {
    assert.ok(html.includes(`id="commitguard-edit-${field}"`), field)
    assert.ok(html.includes(`for="commitguard-edit-${field}"`), field)
  }
  assert.match(html, /<select id="commitguard-edit-source"/)
  assert.match(html, /Unsupported custom — unchanged/)
  assert.match(html, /Editing does not reopen cancelled or expired commitments/)
  assert.doesNotMatch(html, /id="commitguard-edit-status"|readOnly|type="checkbox"/)
})

test("7.5 actual dashboard keeps terminal non-status edits but exposes no resume or mutations of archived records", () => {
  const dto = syntheticWorkspace()
  dto.commitments = ["cancelled", "expired"].map((status) => ({ ...dto.commitments[0], id: status, status }))
  dto.commitments.push({ ...dto.commitments[0], id: "archived", archivedAt: workspaceNow.toISOString() })
  const html = renderToStaticMarkup(createElement(Dashboard, { initial: dto, params: {} }))
  for (const id of ["cancelled", "expired"]) {
    const row = html.split(`id="commitment-${id}"`)[1].split(`id="commitment-`)[0]
    assert.match(row, />Edit<\/button>/)
    assert.doesNotMatch(row, />Resume<\/button>|>Pause<\/button>/)
  }
  const archived = html.split('id="commitment-archived"')[1].split("Detected commitments review")[0]
  assert.match(archived, /Archived \(read-only\)/)
  assert.doesNotMatch(archived, />Edit<\/button>|>Resume<\/button>|>Cancel<\/button>/)
})