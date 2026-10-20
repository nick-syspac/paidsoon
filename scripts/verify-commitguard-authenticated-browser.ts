/** 9.3 isolated integration server, outside the unit-test glob. Run:
 * env -i PATH="$PATH" HOME="$HOME" node --conditions=react-server
 * --experimental-test-module-mocks --import tsx scripts/verify-commitguard-authenticated-browser.ts
 * Then use browser tools at http://127.0.0.1:4193. SIGTERM cleans clone and
 * verifies source schema/ACL/data/role/database baselines. Never run parallel DB tests.
 */
import assert from "node:assert/strict"
import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { mock } from "node:test"
import { build } from "esbuild"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
import { openBrowserDatabase } from "@/scripts/_commitGuardBrowserDatabase"

const USER = "93000000-0000-4000-8000-000000000001"
const OTHER = "93000000-0000-4000-8000-000000000002"
const RACE = "93000000-0000-4000-8000-000000000003"
const COOKIE = "paidsoon_synthetic_93=fixture-owner"
const origin = "http://127.0.0.1:4193"

async function main(): Promise<void> {
  const database = await openBrowserDatabase()
  const { db, sql } = database
  let stopped = false
  async function close() { if (stopped) return; stopped = true; await database.close() }
  try {
    const identity = new AsyncLocalStorage<string | null>()
    const traffic: { method: string; path: string; status: number }[] = []
    let authCalls = 0, failNextWorkspace = false
    // Test-process module substitution ONLY. No flag/cookie bypass is added
    // anywhere in production. Every actual route still calls getUser server-side.
    await mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({ auth: {
      getUser: async () => { authCalls++; const id = identity.getStore(); return { data: { user: id ? { id } : null }, error: null } },
    } }) } })
    // Explicit integration-only binding to the identity-checked disposable clone.
    // Actual withUserContext, billing resolver and financial services remain real.
    await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: db } })
    // Fail closed on all external transports; no auth/provider/email calls.
    globalThis.fetch = async () => { throw new Error("External fetch forbidden in synthetic acceptance server") }
    const routes = {
      workspace: await import("@/app/api/commitguard/workspace/route"),
      cash: await import("@/app/api/commitguard/cash-context/route"),
      commitments: await import("@/app/api/commitguard/commitments/route"),
      commitment: await import("@/app/api/commitguard/commitments/[id]/route"),
      actions: await import("@/app/api/commitguard/commitments/[id]/actions/route"),
      review: await import("@/app/api/commitguard/detections/[id]/review/route"),
      detections: await import("@/app/api/commitguard/detections/route"),
      settings: await import("@/app/api/commitguard/settings/route"),
      summary: await import("@/app/api/commitguard/summary/route"),
      timeline: await import("@/app/api/commitguard/timeline/route"),
    }
    const today = new Date().toISOString().slice(0, 10)
    const day = (n: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() + n * 86400000)
    for (const userId of [USER, OTHER, RACE]) {
      await db.userProfile.create({ data: { userId, subscriptionStatus: "active", subscriptionTier: "business_control", stripeSubscriptionId: "sub_synthetic_93" } })
      await db.commitGuardSetting.create({ data: { userId, enabled: true, detectRecurringCommitments: true,
        safetyBufferMode: "fixed_amount", safetyBufferFixedCents: 0, renewalWarningDays: [90, 30, 7] } })
      await db.taxBufferConfiguration.create({ data: { userId, enabled: false } })
    }
    async function candidate(userId: string, name: string) {
      return db.commitmentDetectionCandidate.create({ data: { userId, candidateKey: randomUUID(), name,
        category: "software", frequency: "monthly", typicalAmountCents: 2000, currency: "aud", source: "import",
        confidence: "medium", suggestedDueDate: day(2), recurrenceAnchor: day(-28), latestObservedAt: day(-28),
        evidence: { sourceKind: "bank", sampleCount: 3, observations: [] } } })
    }
    await candidate(USER, "Synthetic candidate correction")
    const duplicate = await candidate(USER, "Synthetic duplicate confirmation")
    const raceCandidate = await candidate(RACE, "Synthetic last slot candidate")
    for (let i = 0; i < 31; i++) await db.commitment.create({ data: { userId: USER,
      name: `Synthetic record ${String(i).padStart(2, "0")}`, category: i < 6 ? "insurance" : "software",
      amountCents: 1000 + i, currency: "aud", frequency: "monthly", nextDueDate: day(2),
      source: "import", essentiality: "essential", renewalDate: i < 19 ? day(30) : null,
      noticePeriodDays: 7, autoRenew: true } })
    const foreign = await db.commitment.create({ data: { userId: OTHER, name: "Other synthetic tenant",
      category: "software", amountCents: 100, currency: "aud", frequency: "one_off", nextDueDate: day(1) } })
    await db.commitment.create({ data: { userId: USER, name: "Synthetic legacy custom", category: "legacy",
      amountCents: 100, currency: "aud", frequency: "custom", status: "paused", nextDueDate: day(1) } })
    for (let i = 0; i < 149; i++) await db.commitment.create({ data: { userId: RACE, name: `Race filler ${i}`,
      category: "software", amountCents: 1, currency: "aud", frequency: "one_off", status: "cancelled" } })

    const root = process.cwd()
    const stylesheet = await postcss([tailwind()]).process(await readFile(`${root}/app/globals.css`, "utf8"), { from: `${root}/app/globals.css` })
    const bundle = await build({ absWorkingDir: root, entryPoints: ["tests/fixtures/commitguard-authenticated-client.tsx"],
      bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic", conditions: ["browser"],
      define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "fixture-next-adapters", setup(builder) {
        builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "fixture" }))
        builder.onLoad({ filter: /router/, namespace: "fixture" }, () => ({ contents: "const router={refresh:()=>{globalThis.fixtureRouterRefreshes=(globalThis.fixtureRouterRefreshes||0)+1;globalThis.fixtureRefresh?.()}};export const useRouter=()=>router" }))
        builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }))
        builder.onLoad({ filter: /link/, namespace: "fixture" }, () => ({ contents: 'import React from "react";export default function Link(props){return React.createElement("a",props)}', resolveDir: root }))
      } }] })
    async function counts() {
      return { commitments: await db.commitment.count(), events: await db.commitmentEvent.count(),
        work: await db.commitGuardWorkItem.count(), snapshots: await db.cashPlanSnapshot.count(),
        revision: (await db.commitGuardSetting.findUniqueOrThrow({ where: { userId: USER } })).calculationRevision }
    }
    async function ledgerFingerprint() {
      const result: Record<string, unknown> = {}
      for (const table of ["commitments", "commitment_events", "commitment_detection_candidates", "commit_guard_settings",
        "commit_guard_cash_contexts", "commitment_coverages", "commit_guard_work_items", "commit_guard_evaluation_states", "cash_plan_snapshots"]) {
        result[table] = (await sql.query(`SELECT count(*)::int n, md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) digest FROM ${table} t`)).rows[0]
      }
      return result
    }
    async function dispatch(request: Request): Promise<Response> {
      const url = new URL(request.url), method = request.method, path = url.pathname
      if (path === "/fixture/login" && method === "POST") return new Response(null, { status: 303,
        headers: { Location: "/dashboard/commitguard", "Set-Cookie": `${COOKIE}; HttpOnly; SameSite=Strict; Path=/` } })
      if (path === "/fixture/logout" && method === "POST") return new Response(null, { status: 303,
        headers: { Location: "/", "Set-Cookie": "paidsoon_synthetic_93=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" } })
      if (path.startsWith("/fixture/") && !identity.getStore()) return Response.json({ error: "Unauthorized" }, { status: 401 })
      if (path === "/fixture/evidence") return Response.json({ counts: await counts(), fingerprint: await ledgerFingerprint(), traffic, authCalls,
        date: today, duplicateId: duplicate.id, raceCandidateId: raceCandidate.id, foreignId: foreign.id,
        raceCount: await db.commitment.count({ where: { userId: RACE } }),
        conversions: await db.commitment.findMany({ where: { sourceDetectionCandidateId: { not: null } }, select: { id: true, sourceDetectionCandidateId: true } }),
        conversionEvents: await db.commitmentEvent.count({ where: { eventType: "COMMITMENT_CREATED_FROM_DETECTION" } }),
        audits: await db.commitmentEvent.findMany({ where: { userId: USER }, select: { eventType: true, commitmentId: true, detectionCandidateId: true, metadata: true } }) })
      if (path === "/fixture/acceptance-source") return new Response(await readFile(`${root}/tests/fixtures/commitguard-authenticated-acceptance.mjs`, "utf8"), { headers: { "Content-Type": "text/javascript" } })
      if (path === "/fixture/fail-next-workspace" && method === "POST") { failNextWorkspace = true; return Response.json({ armed: true }) }
      if (path === "/fixture/race" && method === "POST") {
        // Hold the real tenant lock until BOTH actual HTTP-handler operations
        // are waiting in PostgreSQL. No Promise-only simulated concurrency.
        const before = await db.commitment.count({ where: { userId: RACE } })
        await sql.query("BEGIN"); await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`commitguard:${RACE}`])
        const pending = identity.run(RACE, () => Promise.all([
          routes.commitments.POST(new Request(`${origin}/api/commitguard/commitments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Synthetic last manual slot", category: "software", amountCents: 100, currency: "aud", frequency: "one_off", nextDueDate: today }) })),
          routes.review.POST(new Request(`${origin}/api/commitguard/detections/${raceCandidate.id}/review`, { method: "POST", body: JSON.stringify({ action: "confirm" }) }), { params: Promise.resolve({ id: raceCandidate.id }) }),
        ]))
        let waiting = 0
        try {
          const end = Date.now() + 5000
          do { waiting = (await sql.query("SELECT count(DISTINCT pid)::int n FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=$1) AND locktype='advisory' AND NOT granted", [database.name])).rows[0].n } while (waiting < 2 && Date.now() < end)
        } finally { await sql.query("ROLLBACK") }
        const results = await pending
        assert.equal(waiting, 2, "two real blocked database sessions")
        assert.equal(results.filter(r => r.status === 200 || r.status === 201).length, 1)
        assert.equal(results.filter(r => r.status === 403).length, 1)
        assert.equal(await db.commitment.count({ where: { userId: RACE } }), before + 1)
        return Response.json({ blockedSessions: waiting, statuses: results.map(r => r.status), before, after: before + 1,
          candidateStatus: (await db.commitmentDetectionCandidate.findUniqueOrThrow({ where: { id: raceCandidate.id } })).status })
      }
      const entries: Record<string, unknown> = { "/api/commitguard/workspace": routes.workspace, "/api/commitguard/cash-context": routes.cash,
        "/api/commitguard/commitments": routes.commitments, "/api/commitguard/detections": routes.detections,
        "/api/commitguard/settings": routes.settings, "/api/commitguard/summary": routes.summary, "/api/commitguard/timeline": routes.timeline }
      const match = path.match(/^\/api\/commitguard\/(commitments|detections)\/([^/]+)(\/actions|\/review)?$/)
      const route = (match ? match[3] === "/actions" ? routes.actions : match[3] === "/review" ? routes.review : routes.commitment : entries[path]) as Record<string, (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>> | undefined
      if (path === "/api/commitguard/workspace" && failNextWorkspace && identity.getStore()) { failNextWorkspace = false; return Response.json({ error: "Synthetic read failure" }, { status: 503 }) }
      if (route) return route[method]?.(request, { params: Promise.resolve({ id: match?.[2] ?? "" }) }) ?? new Response(null, { status: 405 })
      if (path === "/component.js") return new Response(bundle.outputFiles[0].text, { headers: { "Content-Type": "text/javascript" } })
      if (path === "/styles.css") return new Response(stylesheet.css, { headers: { "Content-Type": "text/css" } })
      return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>9.3 authenticated synthetic acceptance</title><link rel="stylesheet" href="/styles.css"></head><body style="margin:12px"><h1>Test-only synthetic tenant — actual routes / PostgreSQL clone</h1><form method="post" action="/fixture/login"><button>Start synthetic session</button></form><form method="post" action="/fixture/logout"><button>End synthetic session</button></form><main id="root"></main><section id="settings" aria-label="Module settings"></section><script type="module" src="/component.js"></script></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'" } })
    }
    const server = createServer(async (req, res) => {
      try {
        if (req.headers.host !== "127.0.0.1:4193") { res.writeHead(403).end(); return }
        if (req.headers.origin && req.headers.origin !== origin) { res.writeHead(403).end(); return }
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk))
        const request = new Request(`${origin}${req.url}`, { method: req.method, headers: req.headers as Record<string, string>,
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) })
        const actor = req.headers.cookie?.split("; ").includes(COOKIE) ? USER : null
        const response = await identity.run(actor, () => dispatch(request))
        if (request.url.includes("/api/")) traffic.push({ method: request.method, path: new URL(request.url).pathname, status: response.status })
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()))
      } catch (error) { console.error(error); res.writeHead(500).end("Synthetic harness failure") }
    })
    for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { server.close(() => { void close().then(() => process.exit(0), error => { console.error(error); process.exit(1) }) }) })
    server.listen(4193, "127.0.0.1", () => console.log(`READY ${origin} — synthetic getUser + real routes/services/RLS/PG; NOT Next RSC`))
  } catch (error) { await close(); throw error }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })