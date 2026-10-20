import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { AlertQuerySchema, alertMoney, alertDate, alertTimestamp, alertPageHref } from "@/lib/commitguard/alertPresentation"
import { COMMIT_GUARD_EVENT_TYPES as E } from "@/lib/commitguard/events"
import { syntheticWorkspace } from "@/tests/helpers/commitGuardWorkspace"

const now = new Date("2026-10-19T12:00:00Z")
const privateValue = "PRIVATE-tenant-actor-lease-provider-data"
const commitment = { id: "commitment-25", userId: "tenant-a", name: "Synthetic USD service", category: "software",
  amountCents: 12345, currency: "usd", frequency: "monthly", status: "active", confidence: "confirmed",
  nextDueDate: new Date("2026-10-21Z"), startDate: null, endDate: null, archivedAt: null as Date | null,
  recurrenceRule: null, renewalDate: null as Date | null, noticePeriodDays: 30 }
const base = { id: "event-001", userId: "tenant-a", actorId: privateValue, title: privateValue, message: privateValue,
  eventType: E.COMMITMENT_DUE_SOON as string, severity: "watch", relevance: "active", resolvedAt: null as Date | null,
  occurredAt: now, commitmentId: commitment.id as string | null, detectionCandidateId: null as string | null,
  dedupeKey: `commitguard:due-soon:${commitment.id}:2026-10-21`, cycleKey: `due:${commitment.id}:2026-10-21`, inputRevision: 4,
  metadata: { occurrenceDate: "2026-10-21", amountCents: 12345, currency: "usd", raw: privateValue } as unknown }
type Row = typeof base
type Where = { userId: string; eventType: { in: string[] }; id?: string;
  OR?: Array<{ occurredAt: Date | { gt: Date }; id?: { gt: string } }> }
let rows: Row[]
let user: { id: string } | null
let authError: boolean
let core: boolean; let advanced: boolean; let detection: boolean; let subscription: boolean
let failed: boolean
let calls: Array<{ operation: string; tenant: string; args: unknown }>
let settings: ReturnType<typeof policy>
let state: ReturnType<typeof evaluation>
let cash: { revision: number; balanceAsOf: Date }
let commitments: typeof commitment[]
let candidates: Array<{ id: string; name: string; status: string }>
let GET: typeof import("@/app/api/commitguard/alerts/route").GET
let list: typeof import("@/lib/commitguard/alertHistory").listCommitGuardAlerts
let target: typeof import("@/lib/commitguard/alertHistory").loadAlertCommitment
let History: typeof import("@/components/dashboard/commitguard/CommitGuardAlertHistory").CommitGuardAlertHistory
let Page: typeof import("@/app/dashboard/commitguard/page").default

function policy() { return { enabled: true, calculationRevision: 4, alertCommitmentDueSoon: true,
  alertRenewalApproaching: true, alertNoticePeriodApproaching: true, alertCommitmentShortfall: true,
  alertCommitmentBufferLow: true, renewalWarningDays: [7, 30] } }
function evaluation() { return { lastEvaluatedAt: now, calculationRevision: 4, cashInputRevision: 2,
  cashRiskEpisodeId: "risk-episode", cashRiskRelevance: "active", cashRiskStatus: "shortfall", userId: privateValue } }
function matches(row: Row, where: Where): boolean {
  return row.userId === where.userId && where.eventType.in.includes(row.eventType) && (!where.id || row.id === where.id) &&
    (!where.OR || where.OR.some((condition) => condition.occurredAt instanceof Date ?
      row.occurredAt.getTime() === condition.occurredAt.getTime() && row.id > (condition.id?.gt ?? "") :
      row.occurredAt > condition.occurredAt.gt))
}
async function transaction<T>(tenant: string, fn: (tx: object) => Promise<T>, options?: unknown): Promise<T> {
  assert.equal(tenant, user?.id)
  if (options) assert.deepEqual(options, { isolationLevel: "RepeatableRead" })
  const call = (operation: string, args: { where: { userId: string } }): void => {
    assert.equal(args.where.userId, tenant); calls.push({ operation, tenant, args })
    if (failed) throw new Error(privateValue)
  }
  // No write methods: any GET/default/event/work/state mutation fails the test.
  return fn({
    commitmentEvent: {
      count: async (args: { where: Where }) => { call("count", args); return rows.filter((r) => matches(r, args.where)).length },
      findFirst: async (args: { where: Where }) => { call("event", args); return rows.find((r) => matches(r, args.where)) ?? null },
      findMany: async (args: { where: Where; skip: number; take: number; orderBy: unknown; select: Record<string, boolean> }) => {
        call("events", args); assert.deepEqual(args.orderBy, [{ occurredAt: "desc" }, { id: "desc" }]); assert.equal(args.take, 12)
        for (const key of ["userId", "actorId", "title", "message", "createdAt"]) assert.equal(args.select[key], undefined)
        return rows.filter((r) => matches(r, args.where)).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id))
          .slice(args.skip, args.skip + args.take)
      },
    },
    commitGuardSetting: { findUnique: async (args: { where: { userId: string } }) => { call("settings", args); return settings } },
    commitGuardEvaluationState: { findUnique: async (args: { where: { userId: string } }) => { call("state", args); return state } },
    commitGuardCashContext: { findUnique: async (args: { where: { userId: string } }) => { call("cash", args); return cash } },
    commitment: {
      findMany: async (args: { where: { userId: string; id: { in: string[] } } }) => { call("commitments", args); return commitments.filter((c) => c.userId === tenant && args.where.id.in.includes(c.id)) },
      findFirst: async (args: { where: { userId: string; id: string } }) => { call("target", args); return commitments.find((c) => c.userId === tenant && c.id === args.where.id) ?? null },
    },
    commitmentDetectionCandidate: { findMany: async (args: { where: { userId: string; id: { in: string[] } } }) => {
      call("candidates", args); return candidates.filter((c) => args.where.id.in.includes(c.id))
    } },
  })
}
function request(query = ""): Request { return new Request(`http://localhost/api/commitguard/alerts${query}`) }

before(async () => {
  await mock.module("@/lib/db/withUserContext", { namedExports: { withUserContext: transaction } })
  await mock.module("@/lib/supabase/server", { namedExports: {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: authError }) } }),
    getAuthenticatedUser: async () => ({ data: { user }, error: authError }),
  } })
  await mock.module("@/lib/billing", { namedExports: { getSubscriptionTier: async () => "business_pro", requireFeature: async (tenant: string, feature: string) => {
    assert.equal(tenant, user?.id)
    assert.ok(["commitguard_core", "commitguard_advanced_alerts", "commitguard_detection"].includes(feature))
    return feature === "commitguard_core" ? core : feature === "commitguard_detection" ? detection : advanced
  } } })
  await mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: {
    getEffectiveAccess: async () => resolveEffectiveAccess({ profile: { subscriptionStatus: subscription ? "active" : "cancelled",
      subscriptionTier: "business_pro", stripeSubscriptionId: subscription ? "sub_test" : null, trialEndsAt: null,
      billingAccessVersion: 1 }, grant: null, billingRisks: [] }, now),
  } })
  ;({ GET } = await import("@/app/api/commitguard/alerts/route"))
  ;({ listCommitGuardAlerts: list, loadAlertCommitment: target } = await import("@/lib/commitguard/alertHistory"))
  ;({ CommitGuardAlertHistory: History } = await import("@/components/dashboard/commitguard/CommitGuardAlertHistory"))
  await mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh: () => {} }),
    redirect: () => { throw new Error("NEXT_REDIRECT") } } })
  await mock.module("@/lib/commitguard/service", { namedExports: {
    summarizeCommitGuard: async () => null, listCommitments: async () => [],
  } })
  await mock.module("@/lib/commitguard/detection", { namedExports: { listDetectedCommitmentCandidates: async () => [] } })
  await mock.module("@/lib/commitguard/workspaceLoader", { namedExports: {
    loadCommitGuardWorkspace: async (tenant: string, params: { alertPage?: string; eventId?: string; commitmentId?: string }) => ({
      ...syntheticWorkspace(),
      alerts: await list(tenant, { page: params.alertPage, eventId: params.eventId }, now),
      linkedCommitment: params.commitmentId ? await target(tenant, params.commitmentId) : null,
    }),
  } })
  ;({ default: Page } = await import("@/app/dashboard/commitguard/page"))
})
beforeEach(() => {
  user = { id: "tenant-a" }; authError = false; core = true; advanced = true; detection = true; subscription = true; failed = false
  rows = [{ ...base }]; commitments = [{ ...commitment }]; candidates = []; calls = []; settings = policy(); state = evaluation()
  cash = { revision: 2, balanceAsOf: new Date("2026-10-19Z") }
})

test("6.7 real route rejects absent/error auth, subscription and core access before history reads", async () => {
  user = null; assert.equal((await GET(request())).status, 401)
  user = { id: "tenant-a" }; authError = true; assert.equal((await GET(request())).status, 401)
  authError = false; subscription = false; assert.equal((await GET(request())).status, 403)
  subscription = true; core = false; assert.equal((await GET(request())).status, 403)
  await assert.rejects(list(user.id), /Upgrade required/)
  assert.deepEqual(calls, [])
})
test("6.7 route validates strict query including duplicate, malformed pages and hostile event identities", async () => {
  for (const query of ["?page=1.5", "?page=Infinity", "?page=1e2", "?page=", "?page=9007199254740992",
    "?page=1&page=2", "?userId=tenant-b", "?eventId=javascript:alert(1)", "?eventId=../foreign"]) {
    assert.equal((await GET(request(query))).status, 400, query)
  }
  assert.deepEqual(calls, [])
})
test("6.7 real route/service maps safe source cents and dates, never raw DB or arbitrary metadata/text", async () => {
  const response = await GET(request())
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store")
  const body = await response.json()
  assert.equal(body.alerts[0].impact, "USD 123.45")
  // The route uses the wall clock; current relevance is tested with a frozen
  // service clock so this fixture does not expire after its synthetic due date.
  assert.equal((await list("tenant-a", {}, now)).alerts[0].relevance, "active")
  assert.equal(body.alerts[0].href, `/dashboard/commitguard?commitmentId=${commitment.id}#alert-commitment`)
  assert.equal(body.alerts[0].occurredAt, now.toISOString())
  assert.match(body.alerts[0].context, /Due 2026-10-21 \(UTC\)/)
  const json = JSON.stringify(body)
  for (const forbidden of [privateValue, "tenant-a", "actorId", "dedupeKey", "cycleKey", "metadata", "userId"]) assert.equal(json.includes(forbidden), false, forbidden)
})
test("6.7 tenant-scoped pagination reaches every event, stable ties, huge/negative clamps and event permalink page", async () => {
  rows = Array.from({ length: 29 }, (_, i) => ({ ...base, id: `event-${String(i).padStart(3, "0")}` }))
  rows.push({ ...base, id: "foreign", userId: "tenant-b" }, { ...base, id: "audit", eventType: E.COMMITMENT_UPDATED })
  const found: string[] = []
  for (let page = 1; page <= 3; page++) {
    const result = await list("tenant-a", { page: String(page) }, now)
    assert.equal(result.total, 29); assert.equal(result.page, page); assert.equal(result.totalPages, 3)
    found.push(...result.alerts.map((a) => a.id))
  }
  assert.equal(new Set(found).size, 29); assert.equal(found[0], "event-028"); assert.equal(found.at(-1), "event-000")
  assert.equal((await list("tenant-a", { page: "999999" }, now)).page, 3)
  assert.equal((await list("tenant-a", { page: "-50" }, now)).page, 1)
  assert.equal((await list("tenant-a", { eventId: "event-000" }, now)).page, 3)
  assert.equal((await list("tenant-a", { eventId: "foreign" }, now)).eventFound, false)
  user = { id: "tenant-b" }
  assert.deepEqual((await list("tenant-b", {}, now)).alerts.map((a) => a.id), ["foreign"])
})
test("6.7 independent deep link reaches inactive/archived owned commitment and foreign/missing return same null", async () => {
  commitments[0] = { ...commitment, status: "cancelled", archivedAt: now }
  assert.deepEqual(await target("tenant-a", commitment.id), { name: commitment.name, status: "cancelled", amount: "USD 123.45", nextDueDate: "2026-10-21", archived: true })
  assert.equal(await target("tenant-a", "missing"), null)
  user = { id: "tenant-b" }; assert.equal(await target("tenant-b", commitment.id), null)
})
test("6.7 active operational relevance uses real projection and suspends old due/cycle/inactive/preferences without writes", async () => {
  for (const change of [() => { commitments[0].status = "paused" }, () => { commitments[0].nextDueDate = new Date("2026-11-21Z") },
    () => { settings.enabled = false }, () => { advanced = false }, () => { settings.alertCommitmentDueSoon = false }]) {
    commitments = [{ ...commitment }]; settings = policy(); advanced = true; change()
    assert.equal((await list("tenant-a", {}, now)).alerts[0].relevance, "suspended")
  }
})
test("6.7 risk history preserves resolved/suspended labels, never promotes stale/unavailable or old severity into current risk", async () => {
  rows = [{ ...base, eventType: E.COMMITMENT_SHORTFALL, commitmentId: null, cycleKey: "risk-episode",
    metadata: { freeCashCents: -12345, currency: "usd", horizonDays: 60, status: "shortfall" } }]
  assert.equal((await list("tenant-a", {}, now)).alerts[0].relevance, "active")
  for (const relevance of ["resolved", "superseded", "suspended", "historical"]) {
    rows[0].relevance = relevance
    assert.equal((await list("tenant-a", {}, now)).alerts[0].relevance, relevance)
  }
  rows[0].relevance = "active"
  for (const mutate of [() => { cash.balanceAsOf = new Date("2026-10-11Z") }, () => { state.cashRiskStatus = "safe" },
    () => { settings.calculationRevision++ }, () => { state.lastEvaluatedAt = new Date("2026-10-18Z") },
    () => { cash.revision++ }, () => { settings.alertCommitmentShortfall = false }, () => { state.cashRiskEpisodeId = "new-episode" }]) {
    cash = { revision: 2, balanceAsOf: now }; state = evaluation(); settings = policy(); mutate()
    assert.equal((await list("tenant-a", {}, now)).alerts[0].relevance, "suspended")
  }
  state = evaluation(); state.cashRiskStatus = "safe"; settings = policy()
  rows[0].metadata = { status: "safe" }
  assert.equal((await list("tenant-a", {}, now)).alerts[0].relevance, "suspended")
})
test("6.7 detection and changed-amount informational history has safe targets and missing/foreign relations never leak links", async () => {
  rows = [{ ...base, eventType: E.COMMITMENT_DETECTED, commitmentId: null, detectionCandidateId: "candidate-1", relevance: "historical" }]
  candidates = [{ id: "candidate-1", name: "Synthetic candidate", status: "pending" }]
  assert.equal((await list("tenant-a", {}, now)).alerts[0].href, "/dashboard/commitguard#detection-candidate-1")
  detection = false; assert.equal((await list("tenant-a", {}, now)).alerts[0].href, null)
  detection = true; candidates[0].status = "converted"; assert.equal((await list("tenant-a", {}, now)).alerts[0].href, null)
  rows = [{ ...base, eventType: E.COMMITMENT_AMOUNT_CHANGED, relevance: "historical", metadata: {
    currentAmountCents: 999, currency: "eur", direction: "decrease", href: "javascript:evil", extra: privateValue } }]
  const alert = (await list("tenant-a", {}, now)).alerts[0]
  assert.equal(alert.impact, "EUR 9.99"); assert.match(alert.context, /decreased \(informational\)/)
  commitments = []; assert.equal((await list("tenant-a", {}, now)).alerts[0].href, null)
})
test("6.7 unsafe money, invalid dates, unknown severity/relevance and error responses have safe fallbacks", async () => {
  for (const amount of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, null, "123"]) assert.equal(alertMoney(amount, "usd"), "Impact unavailable")
  for (const currency of ["jpy", "bad", "US", "<script>", null]) assert.equal(alertMoney(100, currency), "Impact unavailable")
  assert.equal(alertMoney(0, "AUD"), "AUD 0.00"); assert.equal(alertMoney(-12345, "usd"), "-USD 123.45")
  assert.equal(alertTimestamp(new Date(NaN)), null); assert.equal(alertTimestamp({}), null)
  assert.equal(alertDate("2026-02-30"), null); assert.equal(alertDate({}), null)
  assert.equal(alertDate("2026-10-21<script>"), null)
  rows[0] = { ...base, severity: privateValue, relevance: privateValue, occurredAt: new Date(NaN), metadata: { currency: {}, amountCents: "123" } }
  const result = await list("tenant-a", {}, now)
  assert.equal(result.alerts[0].relevance, "historical"); assert.equal(result.alerts[0].severity, "info"); assert.equal(result.alerts[0].occurredAt, null)
  failed = true
  const log = mock.method(console, "error", () => {})
  const response = await GET(request()); assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "Internal server error" })
  assert.equal(JSON.stringify(log.mock.calls).includes(privateValue), false); log.mock.restore()
})
test("6.7 actual React renderer includes accessible mobile cards, every relevance, event/entity navigation and page links", async () => {
  rows = ["active", "resolved", "suspended", "superseded", "historical"].map((relevance, i) => ({ ...base, id: `event-${i}`, relevance }))
  const result = await list("tenant-a", {}, now)
  result.page = 2; result.totalPages = 3; result.total = 29
  const html = renderToStaticMarkup(createElement(History, { history: result, params: { search: "Synthetic USD", page: "2", eventId: "event-3" } }))
  for (const text of ["Alerts and history", "Active at last evaluation", "Resolved — history", "Suspended — not current risk",
    "Historical — not current risk", "Superseded — history", "Recorded impact", "USD", "123.45", "Event time", "View commitment",
    "Link to event", "Previous alerts", "Next alerts", 'aria-label="Alert history pagination"', 'id="event-event-3"', "min-w-0", "break-words", "flex-wrap"]) assert.ok(html.includes(text), text)
  assert.ok(html.includes("alertPage=1")); assert.ok(html.includes("alertPage=3")); assert.ok(html.includes("search=Synthetic+USD"))
  assert.equal(html.includes(privateValue), false)
  const empty = renderToStaticMarkup(createElement(History, { history: { ...result, alerts: [], page: 1, totalPages: 1, total: 0,
    evaluation: { available: false, lastEvaluatedAt: null }, eventFound: false }, params: {} }))
  assert.match(empty, /No alerts recorded/); assert.match(empty, /Current evaluation unavailable/); assert.match(empty, /Requested event is unavailable/)
  const error = renderToStaticMarkup(createElement(History, { history: null, params: {} }))
  assert.match(error, /role="alert"/); assert.match(error, /Retry history/)
})
test("6.7 alert-only URL helpers validate integer page and preserve unrelated workspace state", () => {
  assert.equal(AlertQuerySchema.parse({ page: "0" }).page, 1)
  assert.equal(AlertQuerySchema.parse({ page: "-2" }).page, 1)
  assert.equal(AlertQuerySchema.parse({}).page, 1)
  assert.equal(alertPageHref({ search: "a&b", status: "paused", eventId: "old", alertPage: "1", page: "3" }, 2),
    "/dashboard/commitguard?search=a%26b&status=paused&page=3&alertPage=2#commitguard-alerts")
})

test("6.7 actual workspace page renders real history/service, off-page inactive target and validated navigation", async () => {
  rows = Array.from({ length: 29 }, (_, i) => ({ ...base, relevance: "historical", id: `event-${String(i).padStart(3, "0")}` }))
  commitments[0] = { ...commitment, status: "paused" }
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ eventId: "event-000", commitmentId: commitment.id, page: "99", search: "unrelated" }) }))
  assert.match(html, /Page 3 of 3/); assert.match(html, /id="event-event-000"/)
  assert.match(html, /id="alert-commitment"/); assert.match(html, /Synthetic USD service/); assert.match(html, /Status: paused/)
  assert.match(html, /123.45/); assert.equal(html.includes(privateValue), false)
  const invalid = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ alertPage: "1.5", commitmentId: "../foreign" }) }))
  assert.match(invalid, /Invalid workspace navigation parameters/)
  const missing = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ commitmentId: "foreign" }) }))
  assert.match(missing, /Commitment unavailable/)
})

test("6.7 renewal cycle navigation preserves recorded UTC dates and suspends edited/missed approaching cycles", async () => {
  commitments[0] = { ...commitment, renewalDate: new Date("2026-11-21T00:00:00Z") }
  const cycleKey = `renewal:${commitment.id}:2026-11-21:2026-10-22`
  rows = [{ ...base, eventType: E.COMMITMENT_RENEWAL_APPROACHING, cycleKey,
    dedupeKey: `commitguard:${E.COMMITMENT_RENEWAL_APPROACHING}:${cycleKey}:threshold:7`,
    metadata: { renewalDate: "2026-11-21", noticeCloseDate: "2026-10-22", thresholdDays: 7, currency: "usd" } }]
  const current = (await list("tenant-a", {}, now)).alerts[0]
  assert.equal(current.relevance, "active"); assert.equal(current.impact, "Impact unavailable")
  assert.match(current.context, /Renewal 2026-11-21 \(UTC\).*Notice closes 2026-10-22 \(UTC\)/)
  assert.match(current.href ?? "", /commitmentId=commitment-25/)
  assert.equal((await list("tenant-a", {}, new Date("2026-10-23T12:00:00Z"))).alerts[0].relevance, "suspended")
  commitments[0].noticePeriodDays = 0
  assert.equal((await list("tenant-a", {}, now)).alerts[0].relevance, "suspended")
  rows[0].resolvedAt = now
  assert.equal((await list("tenant-a", {}, now)).alerts[0].relevance, "resolved")
  commitments[0].noticePeriodDays = 30
  rows[0] = { ...rows[0], resolvedAt: null, eventType: E.COMMITMENT_NOTICE_PERIOD_APPROACHING,
    dedupeKey: `commitguard:${E.COMMITMENT_NOTICE_PERIOD_APPROACHING}:${cycleKey}:missed` }
  assert.equal((await list("tenant-a", {}, new Date("2026-10-23T12:00:00Z"))).alerts[0].relevance, "suspended")
})