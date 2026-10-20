import assert from "node:assert/strict"
import { test } from "node:test"
import { selectWorkspaceCommitments, WorkspaceQuerySchema, commitmentPageHref, type WorkspaceQuery } from "@/lib/commitguard/workspaceFilters"
import { syntheticWorkspace } from "@/tests/helpers/commitGuardWorkspace"
import { alertPageHref } from "@/lib/commitguard/alertPresentation"

const asOf = "2026-10-19T23:59:59-00:00"
const row = syntheticWorkspace().commitments[0]

test("7.3 strict URL schema rejects non-string flags/objects/arrays, arbitrary enums and unknown keys", () => {
  for (const value of [true, false, 1, [], ["active"], {}, null]) {
    for (const key of ["page", "search", "status", "source", "category", "currency", "dueFrom"]) {
      assert.equal(WorkspaceQuerySchema.safeParse({ [key]: value }).success, false, `${key}: ${String(value)}`)
    }
  }
  assert.equal(WorkspaceQuerySchema.safeParse({ userId: "foreign" }).success, false)
  assert.equal(WorkspaceQuerySchema.safeParse({ status: "unknown" }).success, false)
  assert.equal(WorkspaceQuerySchema.parse({ page: "0" }).page, "1")
  assert.equal(WorkspaceQuerySchema.parse({ page: "-20" }).page, "1")
  assert.equal(WorkspaceQuerySchema.parse({ page: "0002", alertPage: "0003" }).page, "2")
  const parsed = WorkspaceQuerySchema.parse({ search: "", category: "", status: "", page: "", currency: "USD" })
  assert.equal(parsed.currency, "usd"); assert.equal(parsed.page, undefined); assert.equal(parsed.status, undefined)
})

test("7.3 due windows are exact half-open UTC dates regardless of evaluation time", () => {
  const rows = ["2026-10-18T23:59:59Z", "2026-10-19T00:00:00Z", "2026-10-25T23:59:59Z", "2026-10-26T00:00:00Z", null]
    .map((nextDueDate, index) => ({ ...row, id: `row-${index}`, nextDueDate }))
  const ids = (query: WorkspaceQuery) => selectWorkspaceCommitments(rows, query, asOf).items.map((item) => item.id)
  assert.deepEqual(ids({ duePeriod: "7" }), ["row-1", "row-2"])
  assert.deepEqual(ids({ dueFrom: "2026-10-19", dueTo: "2026-10-26" }), ["row-1", "row-2"])
  assert.deepEqual(ids({ duePeriod: "overdue" }), ["row-0"])
  assert.deepEqual(ids({ duePeriod: "unscheduled" }), ["row-4"])
  assert.deepEqual(ids({ duePeriod: "unscheduled", dueFrom: "2026-10-19" }), [])
  for (const days of [7, 30, 60, 90] as const) {
    const start = Date.parse("2026-10-19Z")
    const boundary = new Date(start + days * 86400000).toISOString()
    assert.equal(selectWorkspaceCommitments([{ ...row, nextDueDate: boundary }], { duePeriod: String(days) as WorkspaceQuery["duePeriod"] }, asOf).total, 0)
  }
})

test("7.3 active default and explicit historical statuses remain independent of matching categories and sources", () => {
  const rows = ["active", "upcoming", "ending", "review", "paused", "cancelled", "expired"].map((status) => ({ ...row, id: status, status }))
  assert.equal(selectWorkspaceCommitments(rows, {}, asOf).total, 4)
  assert.equal(selectWorkspaceCommitments(rows, { status: "all" }, asOf).total, 7)
  for (const item of rows) assert.deepEqual(selectWorkspaceCommitments(rows, { status: item.status as WorkspaceQuery["status"] }, asOf).items, [item])
  for (const key of ["category", "frequency", "source", "essentiality", "currency"] as const) {
    const value = { category: "software", frequency: "monthly", source: "manual", essentiality: "operational", currency: "aud" }[key]
    assert.equal(selectWorkspaceCommitments([row, { ...row, id: "other", [key]: key === "currency" ? "usd" : "other" }], { [key]: value }, asOf).total, 1)
  }
})

test("7.3 sort has stable identity ties and unscheduled dates last in both directions", () => {
  const rows = [{ ...row, id: "b" }, { ...row, id: "a" }, { ...row, id: "c", nextDueDate: null }]
  for (const sortOrder of ["asc", "desc"] as const) {
    assert.deepEqual(selectWorkspaceCommitments(rows, { sortOrder }, asOf).items.map((item) => item.id), ["a", "b", "c"])
  }
  assert.deepEqual(selectWorkspaceCommitments([{ ...row, id: "a", name: "Zebra" }, { ...row, id: "b", name: "Alpha" }], { sortBy: "name" }, asOf).items.map((item) => item.id), ["b", "a"])
  assert.deepEqual(selectWorkspaceCommitments([{ ...row, id: "a", updatedAt: "2026-10-18Z" }, { ...row, id: "b" }], { sortBy: "updatedAt", sortOrder: "desc" }, asOf).items.map((item) => item.id), ["b", "a"])
})

test("7.3 pagers preserve every unrelated parameter and encode search/category without interpreting SQL or HTML", () => {
  const params: WorkspaceQuery = { search: "' OR 1=1; <script>", category: "a & b", status: "paused", essentiality: "critical", frequency: "monthly",
    source: "import", duePeriod: "30", dueFrom: "2026-10-19", dueTo: "2026-11-01", currency: "usd", sortBy: "name", sortOrder: "desc",
    costGuardAlertId: "legacy-alert", linkedSpendInsightId: "insight-1", commitmentId: "commitment-1", eventId: "event-1", alertPage: "4", page: "2" }
  const next = new URL(commitmentPageHref(params, 3), "http://localhost")
  assert.deepEqual(Object.fromEntries(next.searchParams), { ...params, page: "3" })
  assert.equal(next.hash, "#commitguard-upcoming")
  const alerts = new URL(alertPageHref(params, 5), "http://localhost")
  assert.equal(alerts.searchParams.get("page"), "2"); assert.equal(alerts.searchParams.get("alertPage"), "5")
  assert.equal(alerts.searchParams.get("linkedSpendInsightId"), "insight-1")
  assert.equal(selectWorkspaceCommitments([row], params, asOf).total, 0)
})