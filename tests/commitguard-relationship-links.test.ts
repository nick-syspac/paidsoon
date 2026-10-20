import assert from "node:assert/strict"
import { afterEach, before, beforeEach, mock, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SpendLeakFindingsTable } from "@/components/dashboard/spendleak/SpendLeakFindingsTable"
import { CommitGuardUpcoming } from "@/components/dashboard/commitguard/CommitGuardUpcoming"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { createWorkspaceStore } from "@/lib/commitguard/workspaceClient"
import { alertPageHref } from "@/lib/commitguard/alertPresentation"
import type { CommitGuardWorkspaceDTO, WorkspaceQuery } from "@/lib/commitguard/workspace"
import type { SpendInsight } from "@/lib/generated/prisma/client"
import { syntheticWorkspace, workspaceCommitment, workspaceNow, workspaceSettings } from "@/tests/helpers/commitGuardWorkspace"

const insightId = "insight-1"
const alertId = "alert-1"
const summary = "Cloud spend increased & needs review"
const finding: SpendInsight = {
  id: insightId, userId: "tenant-a", accountingConnectionId: null, findingType: "recurring_spend",
  subjectKey: "cloud", severity: "warning", summary, state: "open", reviewAction: null,
  reviewActionAt: null, reviewActionBy: null, reviewNote: null, evidenceFingerprint: null,
  estimatedMonthlyCents: null, estimatedAnnualCents: null, evidence: {}, detectedAt: workspaceNow,
  resolvedAt: null, createdAt: workspaceNow, updatedAt: workspaceNow,
}
let user: { id: string } | null = { id: "tenant-a" }
let rows = [workspaceCommitment]
let reads = 0
let CommitGuardPage: typeof import("@/app/dashboard/commitguard/page").default
let CostGuardPage: typeof import("@/app/dashboard/cost-guard/page").default
let GET: typeof import("@/app/api/commitguard/workspace/route").GET

before(async () => {
  // Only external boundaries are replaced. Source renderers, destination page,
  // loader, DTO mapping, relationship selection, endpoint and refresh store are real.
  await mock.module("next/navigation", { namedExports: {
    useRouter: () => ({ refresh: () => {} }), redirect: () => { throw new Error("REDIRECT") },
  } })
  await mock.module("@/lib/supabase/server", { namedExports: {
    getAuthenticatedUser: async () => ({ data: { user } }),
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }),
  } })
  await mock.module("@/lib/billing", { namedExports: {
    getSubscriptionTier: async () => "business_pro",
    requireFeature: async (_id: string, feature: string) => feature !== "tax_buffer_basic",
    getCommitmentLimitForTier: () => 100, getCommitmentDetectionCandidateLimitForTier: () => 100,
  } })
  await mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: {
    getEffectiveAccess: async () => resolveEffectiveAccess({ profile: {
      subscriptionTier: "business_pro", subscriptionStatus: "active", stripeSubscriptionId: "synthetic",
      trialEndsAt: null, billingAccessVersion: 1,
    }, grant: null, billingRisks: [] }, workspaceNow),
  } })
  await mock.module("@/lib/dashboard/loadSpendLeakDashboard", { namedExports: {
    loadSpendLeakDashboard: async () => ({ findings: [] }),
  } })
  await mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async (tenant: string, callback: (tx: object) => Promise<unknown>) => {
      assert.equal(tenant, "tenant-a")
      reads++
      const read = <T>(value: T) => async (args: { where: { userId: string } }): Promise<T> => {
        assert.equal(args.where.userId, tenant)
        return value
      }
      return callback({
        commitGuardSetting: { findUnique: read({ ...workspaceSettings, calculationRevision: 3 }) },
        commitGuardCashContext: { findUnique: read({ ...syntheticWorkspace(3).cashContext,
          balanceAsOf: new Date("2026-10-19Z"), revision: 3 }) },
        commitment: { findMany: async (args: { where: { userId: string; archivedAt?: null; id?: { in: string[] } } }) => {
          assert.equal(args.where.userId, tenant)
          if (args.where.id) {
            assert.deepEqual(args.where, { userId: tenant, id: { in: [] } })
            return [] // No alert events in this fixture, hence no alert commitment IDs.
          }
          assert.deepEqual(args.where, { userId: tenant, archivedAt: null })
          // Synthetic persistence boundary applies the actual tenant predicate;
          // foreign rows are present in storage, never supplied to the selector.
          return rows.filter((row) => row.userId === args.where.userId && row.archivedAt === null)
        } },
        commitmentCoverage: { findMany: read([]) }, importedBill: { findMany: read([]) },
        taxReserveCategory: { findMany: read([]) }, taxBufferObligation: { findMany: read([]) },
        commitGuardEvaluationState: { findUnique: read(null) },
        commitmentEvent: { count: read(0), findMany: read([]), findFirst: read(null) },
        commitmentDetectionCandidate: { findMany: read([]) },
        costGuardForecast: { findFirst: read(null) },
        costGuardAlert: { findMany: read([{ id: alertId, title: summary, description: "Synthetic alert",
          severity: "warning", varianceAmountCents: 0, variancePercent: 0, alertType: "spike" }]) },
      })
    },
  } })
  ;({ default: CommitGuardPage } = await import("@/app/dashboard/commitguard/page"))
  ;({ default: CostGuardPage } = await import("@/app/dashboard/cost-guard/page"))
  ;({ GET } = await import("@/app/api/commitguard/workspace/route"))
})

beforeEach(() => {
  mock.timers.enable({ apis: ["Date"], now: workspaceNow })
  user = { id: "tenant-a" }; reads = 0
  rows = [
    ...Array.from({ length: 13 }, (_, index) => ({ ...workspaceCommitment,
      id: `linked-${String(index).padStart(2, "0")}`, name: `Renamed subscription ${index}`,
      linkedSpendInsightId: insightId, linkedCostGuardAlertId: alertId })),
    { ...workspaceCommitment, id: "spend-only", name: "Renamed SpendLeak only",
      linkedSpendInsightId: insightId, linkedCostGuardAlertId: "alert-other" },
    { ...workspaceCommitment, id: "cost-only", name: "Renamed CostGuard only",
      linkedSpendInsightId: "insight-other", linkedCostGuardAlertId: alertId },
    { ...workspaceCommitment, id: "same-summary", name: summary, supplierName: summary, notes: summary },
    { ...workspaceCommitment, id: "prefix-decoy", name: summary,
      linkedSpendInsightId: `${insightId}-suffix`, linkedCostGuardAlertId: `${alertId}-suffix` },
    { ...workspaceCommitment, id: "foreign-match", userId: "tenant-b", name: "PRIVATE foreign match",
      linkedSpendInsightId: insightId, linkedCostGuardAlertId: alertId },
    { ...workspaceCommitment, id: "foreign-only", userId: "tenant-b", name: "PRIVATE foreign only",
      linkedSpendInsightId: "insight-foreign", linkedCostGuardAlertId: "alert-foreign" },
    { ...workspaceCommitment, id: "archived-match", name: "Archived match", archivedAt: workspaceNow,
      linkedSpendInsightId: insightId, linkedCostGuardAlertId: alertId },
  ]
})
afterEach(() => { mock.timers.reset() })

function hrefs(html: string): URL[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => new URL(match[1].replaceAll("&amp;", "&"), "http://localhost"))
}
function spendLink(sourceFinding = finding, count = 14): URL {
  const html = renderToStaticMarkup(createElement(SpendLeakFindingsTable, {
    findings: [sourceFinding], selectedModule: null, linkedCommitmentCountsByFindingId: { [sourceFinding.id]: count },
  }))
  const url = hrefs(html).find((href) => href.pathname === "/dashboard/commitguard")
  assert.ok(url, "actual SpendLeak table must render a linked-commitments action")
  return url
}
async function destination(url: URL): Promise<{ initial: CommitGuardWorkspaceDTO; params: WorkspaceQuery; html: string }> {
  const element = await CommitGuardPage({ searchParams: Promise.resolve(Object.fromEntries(url.searchParams)) })
  const { initial, params } = element.props as { initial: CommitGuardWorkspaceDTO; params: WorkspaceQuery }
  assert.ok(initial, "real page must accept the source link and load its workspace")
  return { initial, params, html: renderToStaticMarkup(createElement(CommitGuardUpcoming, { upcoming: initial.upcoming, params })) }
}
function assertSafe(workspace: CommitGuardWorkspaceDTO): void {
  const json = JSON.stringify(workspace)
  for (const forbidden of ["userId", "tenant-a", "tenant-b", "PRIVATE", "foreign-match", "foreign-only"]) {
    assert.equal(json.includes(forbidden), false, forbidden)
  }
}

test("7.4 actual SpendLeak action selects persisted insight identity despite renamed commitments and identical unrelated summaries", async () => {
  const url = spendLink()
  assert.deepEqual(Object.fromEntries(url.searchParams), { linkedSpendInsightId: insightId })
  assert.equal(spendLink({ ...finding, summary: "A completely renamed finding" }).href, url.href)
  const { initial, html } = await destination(url)
  assert.equal(initial.upcoming.total, 14)
  assert.ok(initial.upcoming.items.every((row) => row.linkedSpendInsightId === insightId))
  assert.ok(initial.upcoming.items.some((row) => row.name.startsWith("Renamed subscription")))
  assert.doesNotMatch(html, /Cloud spend increased|Renamed CostGuard only|Archived match|PRIVATE/)
  assert.match(html, /Filtered by linked SpendLeak insight/)
  assertSafe(initial)
})

test("7.4 actual SpendLeak table omits the relationship action when no linked commitments exist", () => {
  const html = renderToStaticMarkup(createElement(SpendLeakFindingsTable, {
    findings: [finding], selectedModule: null, linkedCommitmentCountsByFindingId: {},
  }))
  assert.equal(hrefs(html).some((url) => url.pathname === "/dashboard/commitguard"), false)
  assert.match(html, /None/)
})

test("7.4 actual CostGuard action still selects the exact persisted alert relationship", async () => {
  const html = renderToStaticMarkup(await CostGuardPage())
  const url = hrefs(html).find((href) => href.pathname === "/dashboard/commitguard")
  assert.ok(url)
  assert.deepEqual(Object.fromEntries(url.searchParams), { costGuardAlertId: alertId })
  const result = await destination(url)
  assert.equal(result.initial.upcoming.total, 14)
  assert.ok(result.initial.upcoming.items.every((row) => row.linkedCostGuardAlertId === alertId))
  assert.doesNotMatch(result.html, /Cloud spend increased|Renamed SpendLeak only|Archived match|PRIVATE/)
  assert.match(result.html, /Filtered by linked Cost Guard alert/)
  assertSafe(result.initial)
})

test("7.4 both identity parameters survive actual pagination, filter form, alert paging and endpoint-backed refresh", async () => {
  const url = spendLink()
  url.searchParams.set("costGuardAlertId", alertId)
  url.searchParams.set("sortBy", "name")
  const first = await destination(url)
  assert.equal(first.initial.upcoming.total, 13)
  for (const [key, value] of [["linkedSpendInsightId", insightId], ["costGuardAlertId", alertId]]) {
    assert.ok(first.html.includes(`name="${key}" value="${value}"`), `form preserves ${key}`)
  }
  const next = hrefs(first.html).find((href) => href.searchParams.get("page") === "2")
  assert.ok(next, "actual rendered next-page link must be reachable")
  assert.equal(next.searchParams.get("linkedSpendInsightId"), insightId)
  assert.equal(next.searchParams.get("costGuardAlertId"), alertId)
  const second = await destination(next)
  assert.equal(second.initial.upcoming.items.length, 1)
  assert.equal(new Set([...first.initial.upcoming.items, ...second.initial.upcoming.items].map((row) => row.id)).size, 13)
  const alertPage = new URL(alertPageHref(second.params, 2), "http://localhost")
  assert.equal(alertPage.searchParams.get("linkedSpendInsightId"), insightId)
  assert.equal(alertPage.searchParams.get("costGuardAlertId"), alertId)
  assert.equal(alertPage.searchParams.get("page"), "2")
  const query = next.searchParams.toString()
  const store = createWorkspaceStore(second.initial, query, async (path) => {
    assert.equal(path, `/api/commitguard/workspace?${query}`)
    return GET(new Request(`http://localhost${path}`))
  })
  // Simulate committed persistence changes without replacing the real loader or selector.
  rows = rows.filter((row) => row.id !== "linked-12").map((row) => ({ ...row, name: `${row.name} edited` }))
  await store.refresh()
  const refreshed = store.getSnapshot().workspace
  assert.equal(refreshed.upcoming.total, 12)
  assert.equal(refreshed.upcoming.page, 1)
  assert.equal(store.getSnapshot().refreshFailed, false)
  assert.ok(refreshed.upcoming.items.every((row) => row.linkedSpendInsightId === insightId && row.linkedCostGuardAlertId === alertId && row.name.endsWith("edited")))
  assertSafe(refreshed)
})

test("7.4 foreign and nonexistent relationship IDs have the same empty tenant-safe destination", async () => {
  for (const key of ["linkedSpendInsightId", "costGuardAlertId"] as const) {
    const results = []
    for (const id of [key === "linkedSpendInsightId" ? "insight-foreign" : "alert-foreign", "missing-id"]) {
      const url = new URL("http://localhost/dashboard/commitguard")
      url.searchParams.set(key, id)
      const result = await destination(url)
      assert.equal(result.initial.upcoming.total, 0)
      assert.match(result.html, /No commitments match these filters/)
      assertSafe(result.initial)
      const response = await GET(new Request(`http://localhost/api/commitguard/workspace${url.search}`))
      assert.equal(response.status, 200)
      const { workspace } = await response.json() as { workspace: CommitGuardWorkspaceDTO }
      assertSafe(workspace)
      assert.deepEqual(workspace.upcoming, result.initial.upcoming)
      results.push(workspace.upcoming)
    }
    assert.deepEqual(results[0], results[1])
  }
})

test("7.4 relationship requests cannot supply tenant identity or malformed/duplicate IDs and require authentication", async () => {
  for (const query of [`linkedSpendInsightId=${insightId}&userId=tenant-b`, `costGuardAlertId=${alertId}&tenantId=tenant-b`,
    "linkedSpendInsightId=../foreign", "costGuardAlertId=../foreign", "linkedSpendInsightId=a&linkedSpendInsightId=b",
    "costGuardAlertId=a&costGuardAlertId=b"]) {
    assert.equal((await GET(new Request(`http://localhost/api/commitguard/workspace?${query}`))).status, 400)
  }
  assert.equal(reads, 0)
  user = null
  assert.equal((await GET(new Request(`http://localhost/api/commitguard/workspace?linkedSpendInsightId=${insightId}`))).status, 401)
  await assert.rejects(destination(spendLink()), /REDIRECT/)
  assert.equal(reads, 0)
})