/** Task 9.4 ONLY; real PostgreSQL integration, intentionally outside tests/**.
 * Run serially, with no application env loaded:
 * env -i PATH="$PATH" HOME="$HOME" node --conditions=react-server
 * --experimental-test-module-mocks --import tsx --test --test-concurrency=1
 * scripts/verify-commitguard-scheduled-workflows.ts
 * No HTTP server, pages, broker, scheduler activation or external delivery.
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { createInterface } from "node:readline"
import { mock, test } from "node:test"
import { openBrowserDatabase } from "@/scripts/_commitGuardBrowserDatabase"
import type { CommitGuardJobRequest } from "@/lib/commitguard/jobClaim"

test("9.4 no-page scheduled source → durable work → actual handlers → history → digest", async (t) => {
  const database = await openBrowserDatabase()
  const { db, sql } = database
  const originalFetch = globalThis.fetch
  const secret = randomUUID() // Process-local synthetic secret; no deployment credentials.
  const emails: Array<{ to: string; html: string; text: string }> = []
  const blockers: string[] = []
  let forbiddenFetches = 0
  try {
    const canonical = await readFile(new URL("../prisma/rls-policies.sql", import.meta.url), "utf8")
    // Replace the browser helper's legacy ownership fixtures with ACTUAL canonical
    // policy statements and exact grants. Never use blanket diagnostic grants.
    const legacy = ["user_profiles", "commit_guard_settings", "commitments", "commitment_events",
      "commitment_detection_candidates", "accounting_connections", "accounting_sync_runs", "spend_import_batches",
      "imported_bills", "imported_bank_transactions", "supplier_profiles", "tax_buffer_configurations",
      "tax_reserve_categories", "tax_buffer_obligations", "tax_buffer_overrides", "cash_plan_settings",
      "tracked_invoices", "cost_guard_alerts", "owners_digest_settings", "owners_digest_snapshots",
      "owners_digest_items", "owners_digest_metrics", "owners_digest_provider_runs", "owners_digest_deliveries"]
    for (const table of legacy) {
      const policies = [...canonical.matchAll(/CREATE(?: OR REPLACE)? POLICY[\s\S]*?;/g)]
        .map(m => m[0]).filter(s => new RegExp(`\\bON (?:public\\.)?${table}\\s`).test(s))
      // Canonical CashPlan settings grants SELECT but defines no policy. Keep
      // that deny-all boundary visible; never fabricate a fixture policy.
      assert.ok(policies.length || table === "cash_plan_settings", `actual canonical policies for ${table}`)
      const grants = canonical.match(new RegExp(`^GRANT [^\\n]+ ON TABLE ${table} TO authenticated;`, "gm")) ?? []
      assert.ok(grants.length, `actual canonical grants for ${table}`)
      for (const row of (await sql.query("SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=$1", [table])).rows) {
        await sql.query(`DROP POLICY "${String(row.policyname).replaceAll('"', '""')}" ON ${table}`)
      }
      await sql.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON ${table} FROM PUBLIC,anon,authenticated; ${grants.join("\n")} ${policies.join("\n")}`)
    }
    const cashSql = await readFile(new URL("../prisma/rls-cashplan-commitguard-policies.sql", import.meta.url), "utf8")
    const block = (s: string) => s.slice(s.indexOf("-- BEGIN CASHPLAN COMMITGUARD POLICIES"),
      s.indexOf("-- END CASHPLAN COMMITGUARD POLICIES") + "-- END CASHPLAN COMMITGUARD POLICIES".length)
    assert.equal(block(canonical), block(cashSql))
    await sql.query(cashSql)
    await sql.query(cashSql)

    // Connection binding only: every query still executes in the clone. Central
    // billing loaders/resolver, withUserContext and every financial service REAL.
    await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: db } })
    await mock.module("@/lib/ownersDigest/recipient", { namedExports: {
      fetchOwnersDigestRecipientEmail: async () => "synthetic@example.test",
    } })
    await mock.module("resend", { namedExports: { Resend: class {
      emails = { send: async (input: typeof emails[number]) => {
        assert.equal(input.to, "synthetic@example.test")
        emails.push(input)
        return { data: { id: `non-delivering-${emails.length}` }, error: null }
      } }
    } } })
    globalThis.fetch = async () => { forbiddenFetches++; throw new Error("External fetch forbidden in 9.4") }
    process.env.INTERNAL_JOBS_SECRET = secret
    const { withUserContext } = await import("@/lib/db/withUserContext")
    const { handoffCompletedSpendDetection, requestCommitGuardDetection } = await import("@/lib/commitguard/detectionRequest")
    const { requestCommitGuardEvaluation } = await import("@/lib/commitguard/evaluationRequest")
    const { claimCommitGuardJob } = await import("@/lib/commitguard/jobClaim")
    const { withCommitGuardWorkSideEffects } = await import("@/lib/commitguard/workSideEffects")
    const { dispatchCommitGuardJob } = await import("@/lib/commitguard/jobDispatch")
    const { listCommitGuardAlerts } = await import("@/lib/commitguard/alertHistory")
    const { loadCommitGuardProvider } = await import("@/lib/ownersDigest/service")
    const { sendOwnersDigest } = await import("@/lib/email/sendOwnersDigest")
    const scanRoute = await import("@/app/api/internal/jobs/commitguard/dispatch/route")
    const jobRoute = await import("@/app/api/internal/jobs/commitguard/route")
    const now = (await sql.query("SELECT clock_timestamp() now")).rows[0].now as Date
    const today = now.toISOString().slice(0, 10)
    const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000)
    const request = (path: string, body: unknown, authorized = true) => new Request(`http://internal.invalid${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(authorized ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify(body),
    })
    async function scan() {
      const response = await scanRoute.POST(request("/api/internal/jobs/commitguard/dispatch", {}))
      assert.equal(response.status, 200)
      return await response.json() as { jobs: CommitGuardJobRequest[]; recovered: number }
    }
    async function run(job: CommitGuardJobRequest) {
      const response = await jobRoute.POST(request("/api/internal/jobs/commitguard", job))
      const result = await response.json() as { status: string; reason?: string }
      assert.equal(response.status, 200, JSON.stringify(result))
      return result
    }
    async function fixture(options: { cash?: "fresh" | "missing" | "stale"; plan?: boolean; tier?: string } = {}) {
      const userId = randomUUID()
      await db.userProfile.create({ data: { userId, subscriptionStatus: "active",
        subscriptionTier: options.tier ?? "small_business", stripeSubscriptionId: "sub_synthetic_94" } })
      await db.commitGuardSetting.create({ data: { userId, enabled: true, detectRecurringCommitments: true,
        safetyBufferMode: "fixed_amount", safetyBufferFixedCents: 0, detectionConfidenceThreshold: "low" } })
      await db.taxBufferConfiguration.create({ data: { userId, enabled: false } })
      if (options.cash !== "missing") await db.commitGuardCashContext.create({ data: { userId, amountCents: 100,
        currency: "aud", balanceAsOf: options.cash === "stale" ? day(-8) : day(0), revision: 1 } })
      await db.commitment.create({ data: { userId, name: "Synthetic scheduled obligation", category: "software",
        amountCents: 20000, currency: "aud", frequency: "one_off", nextDueDate: day(2), confidence: "confirmed" } })
      if (options.plan) await db.cashPlan.create({ data: { userId, currency: "aud", timezone: "UTC" } })
      const connection = await db.accountingConnection.create({ data: { userId, provider: "xero",
        organisationId: randomUUID(), organisationName: "Synthetic evidence", encryptedAccessToken: "unused",
        encryptedRefreshToken: "unused", tokenExpiresAt: now, scopes: "unused" } })
      for (const n of [-61, -31, -1]) await db.importedBankTransaction.create({ data: {
        userId, accountingConnectionId: connection.id, sourceId: randomUUID(), sourceContactId: "synthetic-supplier",
        description: "Synthetic outgoing", counterpartyName: "Synthetic recurring supplier", amountCents: 10000,
        direction: "outflow", currency: "aud", transactionDate: day(n),
      } })
      return { userId, connectionId: connection.id }
    }
    type Fixture = Awaited<ReturnType<typeof fixture>>
    async function batch(f: Fixture, status = "completed", handoff = true) {
      const row = await db.spendImportBatch.create({ data: { userId: f.userId, fileName: "synthetic.csv", fileType: "csv",
        fileSizeBytes: 1, contentHash: randomUUID(), schemaVersion: "1", status: "uploaded" } })
      await withUserContext(f.userId, async tx => {
        await tx.spendImportBatch.update({ where: { id: row.id }, data: { status, completedAt: now } })
        if (handoff) await handoffCompletedSpendDetection(tx, f.userId, { sourceKind: "spend_import_batch", sourceId: row.id })
      })
      return row.id
    }
    async function evaluation(f: Fixture) {
      await withUserContext(f.userId, tx => requestCommitGuardEvaluation(tx, f.userId))
      const row = await db.commitGuardWorkItem.findFirstOrThrow({ where: { userId: f.userId, sourceKind: "mutation" }, orderBy: { createdAt: "desc" } })
      return { userId: f.userId, workItemId: row.id, kind: "evaluate" as const }
    }
    async function counts(userId: string) {
      return { candidates: await db.commitmentDetectionCandidate.count({ where: { userId } }),
        events: await db.commitmentEvent.count({ where: { userId } }),
        states: await db.commitGuardEvaluationState.count({ where: { userId } }),
        snapshots: await db.cashPlanSnapshot.count({ where: { plan: { userId } } }) }
    }
    const main = await fixture({ plan: true })
    await t.test("actual handlers reject absent secret and invalid identity before financial writes", async () => {
      const before = await counts(main.userId)
      assert.equal((await scanRoute.POST(request("/dispatch", {}, false))).status, 401)
      assert.equal((await jobRoute.POST(request("/job", {}, false))).status, 401)
      assert.equal((await jobRoute.POST(request("/job", { userId: main.userId, kind: "forged" }))).status, 400)
      assert.deepEqual(await counts(main.userId), before)
    })
    await t.test("completion transaction → pending, lost enqueue → scanner rediscovery → route claim/detection", async () => {
      const sourceId = await batch(main)
      const pending = await db.commitGuardWorkItem.findFirstOrThrow({ where: { userId: main.userId, sourceId } })
      assert.equal(pending.state, "pending"); assert.equal(pending.attempts, 0)
      const first = await scan()
      const lost = first.jobs.find(j => j.workItemId === pending.id)!
      assert.ok(lost)
      // Synthetic broker failure has no durable acknowledgement or state write.
      const enqueue = mock.fn(() => { throw new Error("synthetic Redis enqueue loss") })
      assert.throws(() => enqueue(), /enqueue loss/)
      assert.equal((await db.commitGuardWorkItem.findUniqueOrThrow({ where: { id: pending.id } })).state, "pending")
      const again = await scan()
      assert.deepEqual(again.jobs.find(j => j.workItemId === pending.id), lost)
      // Actual Python dispatcher/task over stdio RPC: two REAL Node scan calls,
      // mocked Redis loss, rediscovery, then actual Node work-handler execution.
      const child = spawn(new URL("../.venv/bin/python", import.meta.url).pathname,
        [new URL("./_commitGuardScheduledWorkerProbe.py", import.meta.url).pathname], {
          env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" }, stdio: ["pipe", "pipe", "pipe"],
        })
      let stderr = "", done = false
      child.stderr.on("data", chunk => { stderr += String(chunk) })
      const exited = new Promise<void>((resolve, reject) => {
        child.once("error", reject)
        child.once("exit", code => code === 0 ? resolve() : reject(new Error(`worker probe failed: ${code}; ${stderr}`)))
      })
      // Attach rejection handler immediately while processing async RPC lines.
      void exited.catch(() => {})
      try {
        for await (const line of createInterface({ input: child.stdout })) {
          const message = JSON.parse(line) as { rpc?: string; payload?: unknown; done?: boolean;
            gate?: boolean; intervalSeconds?: number; executed?: string[] }
          if (message.rpc) {
            assert.ok(["/api/internal/jobs/commitguard/dispatch", "/api/internal/jobs/commitguard"].includes(message.rpc))
            const handler = message.rpc.endsWith("/dispatch") ? scanRoute : jobRoute
            const response = await handler.POST(request(message.rpc, message.payload))
            assert.equal(response.status, 200)
            child.stdin.write(`${JSON.stringify({ result: await response.json() })}\n`)
          } else {
            assert.equal(message.done, true); assert.equal(message.gate, false); assert.equal(message.intervalSeconds, 300)
            assert.deepEqual(message.executed, [main.userId, pending.id, "detect"])
            done = true
          }
        }
        await exited
        assert.equal(done, true)
      } finally { child.stdin.end(); if (child.exitCode === null) child.kill("SIGTERM") }
      assert.equal(await db.commitmentDetectionCandidate.count({ where: { userId: main.userId } }), 1)
      assert.equal(await db.commitmentEvent.count({ where: { userId: main.userId, eventType: "COMMITMENT_DETECTED" } }), 1)
      assert.equal((await db.commitGuardWorkItem.findUniqueOrThrow({ where: { id: pending.id } })).state, "completed")
      await withUserContext(main.userId, async tx => assert.equal(await requestCommitGuardDetection(tx, main.userId,
        { sourceKind: "spend_import_batch", sourceId }), false))
      assert.deepEqual(await run(lost), { status: "skipped", reason: "work_unavailable" })
    })
    await t.test("daily scheduled evaluation with NO page visits publishes risk, history and real CashPlan snapshot once", async () => {
      const scanned = await scan()
      const daily = scanned.jobs.find(j => j.userId === main.userId && j.kind === "evaluate")!
      assert.ok(daily)
      assert.deepEqual(await run(daily), { status: "completed" })
      const state = await db.commitGuardEvaluationState.findUniqueOrThrow({ where: { userId: main.userId } })
      assert.equal(state.lastSuccessfulDailyEvaluationAt?.toISOString().slice(0, 10), today)
      assert.equal(state.cashRiskStatus, "shortfall")
      assert.equal(await db.cashPlanSnapshot.count({ where: { plan: { userId: main.userId } } }), 1)
      const risk = await db.commitmentEvent.findFirstOrThrow({ where: { userId: main.userId, eventType: "COMMITMENT_SHORTFALL" } })
      const history = await listCommitGuardAlerts(main.userId, { eventId: risk.id }, now)
      assert.ok(history.alerts.some(a => a.id === risk.id && a.relevance === "active"))
      const before = await counts(main.userId)
      assert.equal((await scan()).jobs.some(j => j.workItemId === daily.workItemId), false)
      assert.deepEqual(await run(daily), { status: "skipped", reason: "work_unavailable" })
      assert.deepEqual(await counts(main.userId), before)
      assert.equal(await db.commitGuardWorkItem.count({ where: { userId: main.userId, sourceKind: "daily", sourceId: today } }), 1)
    })
    await t.test("repair closes successful accounting/import post-commit gaps, excludes partial/failed and preserves exhausted identity", async () => {
      const f = await fixture()
      const sourceId = await batch(f, "completed", false)
      const failed = await batch(f, "failed", false)
      const run = await db.accountingSyncRun.create({ data: { userId: f.userId, accountingConnectionId: f.connectionId,
        provider: "xero", status: "success", completedAt: now } })
      const partial = await db.accountingSyncRun.create({ data: { userId: f.userId, accountingConnectionId: f.connectionId,
        provider: "xero", status: "partial", completedAt: now, invoicesSkipped: 1 } })
      await scan()
      for (const id of [sourceId, run.id]) assert.equal(await db.commitGuardWorkItem.count({ where: { userId: f.userId, sourceId: id, kind: "detect" } }), 1)
      for (const id of [failed, partial.id]) assert.equal(await db.commitGuardWorkItem.count({ where: { userId: f.userId, sourceId: id } }), 0)
      await db.commitGuardWorkItem.updateMany({ where: { userId: f.userId, sourceId }, data: { state: "failed", attempts: 6 } })
      await scan()
      assert.equal(await db.commitGuardWorkItem.count({ where: { userId: f.userId, sourceId } }), 1)
      assert.equal((await db.commitGuardWorkItem.findFirstOrThrow({ where: { userId: f.userId, sourceId } })).state, "failed")
    })
    await t.test("missing/stale cash creates NO risk event; far-future due date creates NO due alert", async () => {
      for (const cash of ["missing", "stale"] as const) {
        const f = await fixture({ cash })
        await db.commitment.updateMany({ where: { userId: f.userId }, data: { nextDueDate: day(45) } })
        assert.deepEqual(await run(await evaluation(f)), { status: "completed" })
        assert.equal(await db.commitmentEvent.count({ where: { userId: f.userId, eventType: { in: ["COMMITMENT_SHORTFALL", "COMMITMENT_BUFFER_LOW", "COMMITMENT_DUE_SOON"] } } }), 0)
      }
    })
    await t.test("queued jobs re-read real disabled/opt-out/revoked rows; no event, candidate, state or snapshot writes", async () => {
      for (const mode of ["disabled", "optout", "revoked"] as const) {
        const f = await fixture({ plan: true })
        const sourceId = await batch(f)
        const item = await db.commitGuardWorkItem.findFirstOrThrow({ where: { userId: f.userId, sourceId } })
        const evaluate = await evaluation(f)
        if (mode === "revoked") await db.userProfile.update({ where: { userId: f.userId }, data: { subscriptionStatus: "canceled" } })
        else await db.commitGuardSetting.update({ where: { userId: f.userId }, data: mode === "disabled" ? { enabled: false } : { detectRecurringCommitments: false } })
        const before = await counts(f.userId)
        assert.deepEqual(await run({ userId: f.userId, workItemId: item.id, kind: "detect" }),
          { status: "skipped", reason: mode === "disabled" ? "module_disabled" : mode === "optout" ? "detection_disabled" : "no_access" })
        if (mode !== "optout") assert.equal((await run(evaluate)).status, "skipped")
        assert.deepEqual(await counts(f.userId), before)
      }
    })
    await t.test("late worker/reclaimed fence and superseded revision cannot publish; final access fence rolls back financial effects", async () => {
      const f = await fixture({ plan: true })
      const job = await evaluation(f)
      const first = await claimCommitGuardJob(job); assert.equal(first.status, "claimed")
      if (first.status !== "claimed") throw new Error("claim missing")
      await sql.query("UPDATE commit_guard_work_items SET lease_expires_at=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 second' WHERE id=$1", [job.workItemId])
      await scan()
      const recovered = await db.commitGuardWorkItem.findUniqueOrThrow({ where: { id: job.workItemId } })
      assert.equal(recovered.state, "pending")
      assert.equal(recovered.safeErrorCode, "lease_expired")
      assert.ok(recovered.nextAttemptAt > new Date(), "recovery backoff is respected")
      // Advance this clone's due metadata only, not production/global clocks.
      await sql.query("UPDATE commit_guard_work_items SET next_attempt_at=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 second' WHERE id=$1", [job.workItemId])
      const second = await claimCommitGuardJob(job); assert.equal(second.status, "claimed")
      if (second.status !== "claimed") throw new Error("reclaim missing")
      assert.ok(second.identity.fence > first.identity.fence)
      const before = await counts(f.userId)
      await assert.rejects(withCommitGuardWorkSideEffects(first.identity, async tx => {
        await tx.commitmentEvent.create({ data: { userId: f.userId, eventType: "STALE_TEST", title: "Synthetic", message: "Synthetic" } })
      }), /lease_lost/)
      assert.deepEqual(await counts(f.userId), before)
      await evaluation(f)
      await assert.rejects(withCommitGuardWorkSideEffects(second.identity, async () => {}), /superseded/)
      const current = await evaluation(f)
      const prior = await counts(f.userId)
      const result = await dispatchCommitGuardJob(current, async ({ tx, userId }) => {
        await tx.commitGuardSetting.update({ where: { userId }, data: { enabled: false } })
      })
      assert.deepEqual(result, { status: "skipped", reason: "module_disabled" })
      assert.deepEqual(await counts(f.userId), prior, "default pipeline events/state/CashPlan all rolled back")
      assert.equal((await db.commitGuardSetting.findUniqueOrThrow({ where: { userId: f.userId } })).enabled, true)
    })
    await t.test("fresh real billing revocation AFTER financial computation rolls back all final-fence publication", async () => {
      const f = await fixture({ plan: true })
      const job = await evaluation(f)
      const before = await counts(f.userId)
      const result = await dispatchCommitGuardJob(job, async () => {
        // Separate committed connection: not a fake authorization result and not
        // part of the financial transaction being rolled back by the fence.
        await db.userProfile.update({ where: { userId: f.userId }, data: { subscriptionStatus: "canceled" } })
      })
      assert.deepEqual(result, { status: "skipped", reason: "no_access" })
      assert.deepEqual(await counts(f.userId), before)
      assert.equal((await db.userProfile.findUniqueOrThrow({ where: { userId: f.userId } })).subscriptionStatus, "canceled")
    })
    await t.test("real provider → existing digest generator/persistence/mailer; transport capture only, no duplicate cash signal", async () => {
      const digestNow = new Date() // Must follow persisted event observation time.
      const provider = await loadCommitGuardProvider(main.userId, digestNow)
      const risk = await db.commitmentEvent.findFirstOrThrow({ where: { userId: main.userId, eventType: "COMMITMENT_SHORTFALL" } })
      assert.equal(provider.signals.filter(s => s.metadata?.eventId === risk.id).length, 1)
      assert.equal(provider.signals.some(s => s.signalType === "FREE_CASH_RISK"), false)
      await db.ownersDigestSetting.create({ data: { userId: main.userId, enabled: true, emailEnabled: true,
        frequency: "daily", deliveryTime: `${String(digestNow.getUTCHours()).padStart(2, "0")}:00`, minimumMaterialityCents: 0, maxActionItems: 10 } })
      assert.equal((await sendOwnersDigest(main.userId, digestNow)).status, "sent")
      assert.equal(emails.length, 1)
      assert.match(emails[0].html, /CommitGuard|commitguard/)
      const items = await db.ownersDigestItem.findMany({ where: { userId: main.userId, source: "commitguard" } })
      assert.ok(items.length > 0)
      assert.equal(items.filter(i => (i.metadata as Record<string, unknown> | null)?.eventId === risk.id).length, 1)
      assert.equal(await db.ownersDigestDelivery.count({ where: { userId: main.userId, status: "sent", messageId: "non-delivering-1" } }), 1)
    })
    await t.test("BLOCKER reproduced: canonical digest child DELETE policy missing; replay fails before transport", async () => {
      const before = await db.ownersDigestItem.count({ where: { userId: main.userId } })
      await assert.rejects(sendOwnersDigest(main.userId, new Date()), (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "P2002")
      assert.equal(emails.length, 1)
      assert.equal(await db.ownersDigestDelivery.count({ where: { userId: main.userId } }), 1)
      const after = await db.ownersDigestItem.count({ where: { userId: main.userId } })
      assert.equal(after, before, "failed regeneration rolls back; no duplicate persisted items")
      assert.equal((await sql.query(`SELECT count(*)::int n FROM pg_policies
        WHERE tablename IN ('owners_digest_items','owners_digest_metrics','owners_digest_provider_runs')
        AND cmd IN ('DELETE','ALL')`)).rows[0].n, 0)
      // Verification ONLY. Never add policies or bypass RLS to make the existing
      // digest replacement appear correct or claim replay acceptance passed.
      blockers.push("Canonical digest child tables grant DELETE but have no DELETE policy; same-period regeneration raises P2002 before delivery-key recheck; no second transport call")
    })
    await t.test("email opt-out and non-email entitlement never reach transport; category/module disable suppress stored digest signals", async () => {
      const before = emails.length
      await db.ownersDigestSetting.update({ where: { userId: main.userId }, data: { emailEnabled: false } })
      assert.deepEqual(await sendOwnersDigest(main.userId, now), { status: "skipped", reason: "owners_digest_email_disabled" })
      const f = await fixture({ tier: "business_control" })
      await db.ownersDigestSetting.create({ data: { userId: f.userId, enabled: true, emailEnabled: true } })
      assert.equal((await sendOwnersDigest(f.userId, now)).status, "skipped")
      assert.equal(await db.ownersDigestDelivery.count({ where: { userId: f.userId } }), 0)
      assert.equal(emails.length, before)
      assert.ok((await loadCommitGuardProvider(main.userId, new Date())).signals.some(s => s.signalType === "COMMITMENT_SHORTFALL"))
      await db.commitGuardSetting.update({ where: { userId: main.userId }, data: { alertCommitmentShortfall: false } })
      assert.equal((await loadCommitGuardProvider(main.userId, new Date())).signals.some(s => s.signalType === "COMMITMENT_SHORTFALL"), false)
      await db.commitGuardSetting.update({ where: { userId: main.userId }, data: { enabled: false } })
      assert.deepEqual((await loadCommitGuardProvider(main.userId, new Date())).signals, [])
      assert.equal(emails.length, before)
    })
    assert.equal(forbiddenFetches, 0)
    assert.equal(emails.length, 1, "one mock transport capture; ZERO real messages")
    console.log("9.4 safety: no pages/HTTP/broker/scheduler; external fetch=0; captured mock sends=1; real sends=0")
    console.log("9.4 BLOCKERS:", JSON.stringify(blockers))
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.INTERNAL_JOBS_SECRET
    mock.restoreAll()
    await database.close()
  }
})