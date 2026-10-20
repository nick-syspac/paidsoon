/** Task 9.2. Run serially, outside the unit-test glob:
 * env -i PATH="$PATH" HOME="$HOME" node --conditions=react-server
 *   --experimental-test-module-mocks --import tsx --test --test-concurrency=1
 *   scripts/verify-commitguard-current-runtime-storage.ts
 * No env loader/default URL, remote API, scheduler, role DDL or deployment.
 * Exact TCP-disabled socket identity is checked BEFORE disposable clone DDL.
 * Canonical ACL failures are recorded as blockers, not hidden by fixture grants.
 */
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { mock, test } from "node:test"
import pg from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient, type Prisma } from "@/lib/generated/prisma/client"

// pg decodes timestamp WITHOUT time zone and date using the process timezone.
// Match Prisma's UTC storage contract as well as the server session timezone.
process.env.TZ = "UTC"
const config = { host: "/tmp/paidsoon-commitguard-pg.i62Iri", port: 55437, database: "commitguard", user: "syspac",
  password: () => "", ssl: false as const, connectionTimeoutMillis: 3000,
  options: "-c search_path=public -c statement_timeout=10000 -c lock_timeout=5000 -c timezone=UTC" }
const clone = `commitguard_current_${randomUUID().replaceAll("-", "")}`
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")
async function identity(c: pg.Client, database: string): Promise<void> {
  assert.deepEqual((await c.query(`SELECT current_database() database,current_user role,inet_server_addr() tcp,
    current_setting('unix_socket_directories') socket,current_setting('port') port,
    current_setting('listen_addresses') listen,current_setting('server_version_num')::int/10000 major`)).rows[0],
  { database, role: "syspac", tcp: null, socket: config.host, port: "55437", listen: "", major: 17 })
}
async function catalog(c: pg.Client): Promise<unknown> {
  return (await c.query(`SELECT jsonb_build_object(
    'relations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth')),
    'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth')),
    'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p),
    'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth')),
    'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t),
    'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),
    'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.oid) FROM pg_auth_members m),
    'schemas',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.oid) FROM pg_namespace n),
    'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d),
    'databases',(SELECT jsonb_agg(jsonb_build_array(datname,datacl) ORDER BY datname) FROM pg_database)
  ) snapshot`)).rows[0].snapshot
}
async function baseline(): Promise<unknown> {
  const c = new pg.Client(config); await c.connect()
  try {
    await identity(c, "commitguard")
    const schema = await catalog(c), data: unknown[] = []
    for (const { tablename } of (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows) {
      data.push([tablename, (await c.query(`SELECT count(*)::int n,
        md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) digest
        FROM public.${quote(tablename)} t`)).rows[0]])
    }
    return { schema, data }
  } finally { await c.end() }
}

test("9.2 current cash/job/repair/retry/snapshot services on disposable PostgreSQL", async (t) => {
  const original = await baseline(), control = new pg.Client({ ...config, database: "postgres" })
  await control.connect()
  let created = false, c: pg.Client | undefined, db: PrismaClient | undefined
  let failCashAudit = false, rejectElevation = false
  let actor = { userId: "", adminSession: { id: "" } }
  const blockers = ["Shared-target migration/policy order and deployed RLS remain unreviewed/unapplied",
    "Scheduled evaluation, non-delivering digest and authenticated browser acceptance remain outstanding"]
  try {
    await identity(control, "postgres")
    await control.query(`CREATE DATABASE ${quote(clone)} TEMPLATE commitguard`); created = true
    c = new pg.Client({ ...config, database: clone }); await c.connect(); await identity(c, clone)
    const sql = c
    const canonical = await readFile(new URL("../prisma/rls-policies.sql", import.meta.url), "utf8")
    // Actual targeted artifact, never full canonical/unrelated trial SQL.
    await sql.query("BEGIN")
    try {
      const before = await catalog(sql)
      await sql.query(`SAVEPOINT targeted`)
      await sql.query(`CREATE SCHEMA auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
          $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
        GRANT USAGE ON SCHEMA public,auth TO authenticated;
        GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated`)
      await sql.query(await readFile(new URL("../prisma/rls-commitguard-policies.sql", import.meta.url), "utf8"))
      await sql.query("ROLLBACK TO SAVEPOINT targeted")
      assert.deepEqual(await catalog(sql), before, "actual targeted DDL rollback preserves complete original clone catalog")
      await sql.query(`CREATE SCHEMA auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
          $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
        GRANT USAGE ON SCHEMA public,auth TO authenticated;
        GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated`)
      await sql.query(await readFile(new URL("../prisma/rls-commitguard-policies.sql", import.meta.url), "utf8"))
      // Legacy fixture policies only; exact canonical grants, not ALL grants.
      for (const table of ["user_profiles", "commit_guard_settings", "commitments", "commitment_events",
        "commitment_detection_candidates", "accounting_connections", "accounting_sync_runs", "spend_import_batches",
        "cash_plan_settings",
        "tax_buffer_configurations", "tax_reserve_categories", "tax_buffer_obligations", "tax_buffer_overrides",
        "imported_bank_transactions", "imported_bills", "supplier_profiles"]) {
        const owner = ["user_profiles", "accounting_connections", "accounting_sync_runs"].includes(table) ? '"userId"' : "user_id"
        const predicate = `${owner}=(SELECT auth.uid())::text`
        const grants = canonical.match(new RegExp(`^GRANT [^\\n]+ ON TABLE ${table} TO authenticated;`, "gm")) ?? []
        await sql.query(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY;
          REVOKE ALL ON public.${quote(table)} FROM PUBLIC,anon,authenticated;
          ${grants.join("\n")}
          CREATE POLICY current_fixture_select ON public.${quote(table)} FOR SELECT TO authenticated USING (${predicate});
          CREATE POLICY current_fixture_insert ON public.${quote(table)} FOR INSERT TO authenticated WITH CHECK (${predicate});
          CREATE POLICY current_fixture_update ON public.${quote(table)} FOR UPDATE TO authenticated USING (${predicate}) WITH CHECK (${predicate})`)
      }
      for (const table of ["tenant_trial_grants", "tenant_billing_risks"]) {
        const grant = canonical.match(new RegExp(`GRANT SELECT \\([^;]+\\)\\s+ON TABLE public\\.${table} TO authenticated;`))
        assert.ok(grant)
        await sql.query(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY;
          REVOKE ALL ON public.${quote(table)} FROM PUBLIC,anon,authenticated; ${grant[0]}
          CREATE POLICY current_fixture_access ON public.${quote(table)} FOR SELECT TO authenticated
          USING (user_id=(SELECT auth.uid())::text)`)
      }
      const cashPlanSql = await readFile(new URL("../prisma/rls-cashplan-commitguard-policies.sql", import.meta.url), "utf8")
      const block = (text: string) => text.slice(text.indexOf("-- BEGIN CASHPLAN COMMITGUARD POLICIES"),
        text.indexOf("-- END CASHPLAN COMMITGUARD POLICIES") + "-- END CASHPLAN COMMITGUARD POLICIES".length)
      assert.equal(block(canonical), block(cashPlanSql), "canonical/deployable CashPlan blocks match exactly")
      const targetOids = (await sql.query(`SELECT oid FROM pg_class WHERE oid IN
        ('cash_plans'::regclass,'cash_plan_overrides'::regclass,'cash_plan_snapshots'::regclass)`)).rows.map((r) => String(r.oid))
      const unrelated = (value: unknown) => {
        const copy = structuredClone(value) as Record<string, Array<Record<string, unknown>> | null>
        copy.relations = copy.relations!.filter((r) => !targetOids.includes(String(r.oid)))
        copy.columns = copy.columns!.filter((r) => !targetOids.includes(String(r.attrelid)))
        copy.policies = copy.policies?.filter((r) => !targetOids.includes(String(r.polrelid))) ?? null
        return copy
      }
      const logical = (value: unknown) => {
        const copy = structuredClone(value) as Record<string, Array<Record<string, unknown>> | null>
        for (const row of copy.policies ?? []) delete row.oid
        copy.policies?.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        return copy
      }
      // Adversarial OLD permissions, never diagnostic permissions after artifact.
      // Known FOR ALL gets replaced; unknown OR-capable policy fails closed.
      await sql.query(`GRANT UPDATE (plan_id), INSERT (created_at) ON cash_plan_overrides TO authenticated;
        CREATE POLICY "cashplan override insert own plan" ON cash_plan_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);
        CREATE POLICY cashplan_unrelated_update ON cash_plan_overrides FOR UPDATE TO authenticated USING (false);
        CREATE POLICY cashplan_unknown_select ON cash_plan_overrides FOR SELECT TO authenticated USING (true);
        SAVEPOINT unknown_policy`)
      await assert.rejects(sql.query(cashPlanSql), /Unreviewed overlapping CashPlan client policy/)
      await sql.query("ROLLBACK TO SAVEPOINT unknown_policy; DROP POLICY cashplan_unknown_select ON cash_plan_overrides")
      const cashBefore = unrelated(await catalog(sql))
      await sql.query(cashPlanSql)
      const first = await catalog(sql)
      assert.deepEqual(unrelated(first), cashBefore, "CashPlan artifact preserves every unrelated catalog/ACL entry")
      await sql.query(cashPlanSql)
      assert.deepEqual(logical(await catalog(sql)), logical(first), "second application has equivalent policies and ACLs")
      assert.equal((await sql.query(`SELECT count(*)::int n FROM pg_policies WHERE policyname='cashplan_unrelated_update'`)).rows[0].n, 1)
      console.log("PASS: actual CashPlan artifact twice; canonical equality, unknown OR-policy rejection, unrelated catalog/ACL preservation")
      await sql.query(`CREATE FUNCTION current_fixture_cash_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF current_setting('current_fixture.fail_cash',true)='yes' THEN RAISE EXCEPTION 'synthetic cash audit failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER current_fixture_cash_fail BEFORE INSERT ON commitment_events FOR EACH ROW EXECUTE FUNCTION current_fixture_cash_fail()`)
      await sql.query("COMMIT")
    } catch (error) { await sql.query("ROLLBACK"); throw error }
    db = new PrismaClient({ adapter: new PrismaPg({ ...config, database: clone, max: 12 }) })
    const database = db
    const executor = new Proxy(database, { get(target, key) {
      if (key === "$transaction") return (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: Parameters<PrismaClient["$transaction"]>[1]) =>
        target.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('current_fixture.fail_cash',${failCashAudit ? "yes" : "no"},true)`
          return fn(tx)
        }, options)
      const member = Reflect.get(target, key)
      return typeof member === "function" ? member.bind(target) : member
    } })
    // Only database binding + interactive admin elevation boundary are replaced.
    // Real access resolver, tenant setup, claims, scans, retry SQL, repair,
    // canonical assembler, snapshot writer and financial fencing execute.
    await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: executor } })
    await mock.module("@/lib/admin/guard", { namedExports: { requireAdminElevation: async () => {
      if (rejectElevation) throw new Error("synthetic elevation denied")
      return actor
    } } })
    const { withUserContext } = await import("@/lib/db/withUserContext")
    const { saveCommitGuardCashContext: saveCash, CommitGuardCashContextConflict } = await import("@/lib/commitguard/cashContextMutation")
    const { loadCommitGuardCashContext: loadCash } = await import("@/lib/commitguard/cashContextLoader")
    const { claimCommitGuardJob: claim } = await import("@/lib/commitguard/jobClaim")
    const { settleCommitGuardWork: settle, recoverCommitGuardWork: recover, retryCommitGuardWork: retry } = await import("@/lib/commitguard/workLifecycle")
    const { scanCommitGuardWork: scan } = await import("@/lib/commitguard/workScan")
    const { repairCommitGuardSources: repair } = await import("@/lib/commitguard/sourceRepair")
    const { requestCommitGuardDetection: requestDetection } = await import("@/lib/commitguard/detectionRequest")
    const { withCommitGuardWorkSideEffects: fenced } = await import("@/lib/commitguard/workSideEffects")
    const { dispatchCommitGuardJob: dispatch } = await import("@/lib/commitguard/jobDispatch")
    const { loadCashPlanSummary, refreshCashPlan } = await import("@/lib/cashplan/service")
    const now = (await sql.query("SELECT clock_timestamp() now")).rows[0].now as Date
    const date = now.toISOString().slice(0, 10)
    const insert = async (table: string, data: Record<string, unknown>) => {
      const entries = Object.entries(data)
      await sql.query(`INSERT INTO public.${quote(table)} (${entries.map(([k]) => quote(k)).join(",")})
        VALUES (${entries.map((_, i) => `$${i + 1}`).join(",")})`, entries.map(([, v]) => v))
    }
    async function fixture(plan = false) {
      const userId = randomUUID(), planId = randomUUID(), connectionId = randomUUID()
      await insert("user_profiles", { id: randomUUID(), userId, subscriptionStatus: "active", subscriptionTier: "business_pro",
        stripe_subscription_id: "sub_synthetic", updatedAt: now })
      await insert("commit_guard_settings", { id: randomUUID(), user_id: userId, enabled: true,
        detect_recurring_commitments: true, calculation_revision: 0, updated_at: now })
      await insert("accounting_connections", { id: connectionId, userId, provider: "xero", organisation_id: randomUUID(),
        organisation_name: "Synthetic", encrypted_access_token: "unused", encrypted_refresh_token: "unused",
        token_expires_at: now, scopes: "unused", updated_at: now })
      if (plan) await insert("cash_plans", { id: planId, user_id: userId, currency: "aud", timezone: "UTC", updated_at: now })
      return { userId, planId, connectionId }
    }
    type Fixture = Awaited<ReturnType<typeof fixture>>
    const work = async (f: Fixture, revision = 0) => {
      const id = randomUUID()
      await insert("commit_guard_work_items", { id, user_id: f.userId, kind: "evaluate", source_kind: "mutation",
        dedupe_key: `evaluation:${revision}`, calculation_revision: revision, updated_at: now })
      return { userId: f.userId, workItemId: id, kind: "evaluate" as const }
    }
    const stored = async (id: string) => (await sql.query("SELECT * FROM commit_guard_work_items WHERE id=$1", [id])).rows[0]
    const cashInput = (expectedRevision: number, amountCents = 100000) => ({ expectedRevision, amountCents, currency: "aud" as const, balanceAsOf: date })
    async function waitBlocked(count: number) {
      const end = Date.now() + 4000
      do {
        const { n } = (await sql.query(`SELECT count(DISTINCT pid)::int n FROM pg_locks
          WHERE database=(SELECT oid FROM pg_database WHERE datname=$1) AND locktype='advisory' AND NOT granted`, [clone])).rows[0]
        if (n === count) return
      } while (Date.now() < end)
      assert.fail(`expected ${count} real blocked database sessions`)
    }
    async function race<T>(userId: string, operations: Array<() => Promise<T>>) {
      await sql.query("BEGIN"); await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`commitguard:${userId}`])
      const pending = Promise.allSettled(operations.map((op) => op()))
      try { await waitBlocked(operations.length) } finally { await sql.query("ROLLBACK"); await pending }
      return pending
    }
    const totals = async (userId: string) => (await sql.query(`SELECT
      (SELECT revision FROM commit_guard_cash_contexts WHERE user_id=$1) cash,
      (SELECT calculation_revision FROM commit_guard_settings WHERE user_id=$1) revision,
      (SELECT count(*)::int FROM commitment_events WHERE user_id=$1) events,
      (SELECT count(*)::int FROM commit_guard_work_items WHERE user_id=$1) work`, [userId])).rows[0]

    await t.test("cash first-create AND update races: same expected revision, one commit/one typed conflict, no orphan audit/work", async () => {
      const f = await fixture()
      for (const revision of [0, 1]) {
        const results = await race(f.userId, [() => saveCash(f.userId, cashInput(revision, 100000 + revision), now),
          () => saveCash(f.userId, cashInput(revision, 200000 + revision), now)])
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1)
        assert.ok((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason instanceof CommitGuardCashContextConflict)
        assert.deepEqual(await totals(f.userId), { cash: revision + 1, revision: revision + 1, events: revision + 1, work: revision + 1 })
      }
    })
    await t.test("cash actual loader ownership, zero/negative/clear, no-op and audit SQL failure roll back all coupled rows", async () => {
      const f = await fixture(), other = await fixture()
      assert.equal((await loadCash(other.userId, now)).amountCents, null)
      await saveCash(f.userId, cashInput(0, 0), now)
      assert.equal((await loadCash(f.userId, now)).amountCents, 0)
      assert.equal((await loadCash(other.userId, now)).amountCents, null)
      const before = await totals(f.userId)
      await saveCash(f.userId, cashInput(1, 0), now); assert.deepEqual(await totals(f.userId), before)
      failCashAudit = true
      try { await assert.rejects(saveCash(f.userId, cashInput(1, -100), now), /synthetic cash audit failure/) }
      finally { failCashAudit = false }
      assert.deepEqual(await totals(f.userId), before)
      await saveCash(f.userId, cashInput(1, -100), now)
      assert.equal((await loadCash(f.userId, now)).amountCents, -100)
      await saveCash(f.userId, { expectedRevision: 2, amountCents: null, currency: null, balanceAsOf: null }, now)
      assert.equal((await loadCash(f.userId, now)).amountCents, null)
    })
    await t.test("actual claim contention: one processing owner, renewed fence, wrong tenant/kind cannot claim", async () => {
      const f = await fixture(), other = await fixture(), request = await work(f)
      assert.deepEqual(await claim({ ...request, userId: other.userId }), { status: "skipped", reason: "work_unavailable" })
      assert.deepEqual(await claim({ ...request, kind: "detect" }), { status: "skipped", reason: "work_unavailable" })
      const results = await race(f.userId, [() => claim(request), () => claim(request)])
      const claims = results.map((r) => { assert.equal(r.status, "fulfilled"); return (r as PromiseFulfilledResult<Awaited<ReturnType<typeof claim>>>).value })
      assert.equal(claims.filter((r) => r.status === "claimed").length, 1)
      const owned = claims.find((r) => r.status === "claimed")!; assert.equal(owned.status, "claimed")
      const row = await stored(request.workItemId)
      assert.equal(row.state, "processing"); assert.equal(row.attempts, 1); assert.equal(row.fence, 1)
      assert.equal(row.lease_owner, owned.identity.leaseOwner)
      assert.ok(row.lease_expires_at.getTime() > Date.now())
      await settle({ ...owned.identity, fence: 0 }, "execution_failed")
      assert.equal((await stored(request.workItemId)).state, "processing")
      await settle(owned.identity, "deferred")
      const deferred = await stored(request.workItemId)
      assert.equal(deferred.state, "pending"); assert.equal(deferred.attempts, 0)
      assert.equal(deferred.safe_error_code, "evaluation_pipeline_pending")
      assert.ok(deferred.next_attempt_at.getTime() > Date.now() + 290000)
    })
    await t.test("six real claim/settle attempts exhaust; expired recovery fences stale worker, canonical identity retained", async () => {
      const f = await fixture(), request = await work(f)
      for (let n = 1; n <= 6; n++) {
        await sql.query("UPDATE commit_guard_work_items SET next_attempt_at=$2 WHERE id=$1", [request.workItemId, now])
        const result = await claim(request); assert.equal(result.status, "claimed")
        assert.equal(result.identity.fence, n)
        await settle(result.identity, "execution_failed")
        const row = await stored(request.workItemId)
        assert.equal(row.attempts, n); assert.equal(row.state, n === 6 ? "failed" : "pending")
      }
      assert.deepEqual(await claim(request), { status: "skipped", reason: "work_unavailable" })
      const next = await fixture(), r = await work(next), first = await claim(r); assert.equal(first.status, "claimed")
      await sql.query(`UPDATE commit_guard_work_items SET lease_expires_at=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 second' WHERE id=$1`, [r.workItemId])
      await recover(r); assert.equal((await stored(r.workItemId)).state, "pending")
      await sql.query("UPDATE commit_guard_work_items SET next_attempt_at=$2 WHERE id=$1", [r.workItemId, now])
      const second = await claim(r); assert.equal(second.status, "claimed"); assert.equal(second.identity.fence, 2)
      await assert.rejects(fenced(first.identity, async () => assert.fail("stale callback")), { reason: "lease_lost" })
      await settle(first.identity, "execution_failed")
      assert.equal((await stored(r.workItemId)).lease_owner, second.identity.leaseOwner)
      await settle(second.identity, "execution_failed")
    })
    await t.test("claim uses current revision/access/module state and rejects forged source identity", async () => {
      for (const reason of ["superseded", "no_access", "module_disabled", "invalid_source"] as const) {
        const f = await fixture(), r = await work(f)
        if (reason === "superseded") await sql.query("UPDATE commit_guard_settings SET calculation_revision=1 WHERE user_id=$1", [f.userId])
        if (reason === "no_access") await sql.query(`UPDATE user_profiles SET "subscriptionStatus"='cancelled',stripe_subscription_id=NULL WHERE "userId"=$1`, [f.userId])
        if (reason === "module_disabled") await sql.query("UPDATE commit_guard_settings SET enabled=false WHERE user_id=$1", [f.userId])
        if (reason === "invalid_source") await sql.query("UPDATE commit_guard_work_items SET dedupe_key='forged' WHERE id=$1", [r.workItemId])
        assert.deepEqual(await claim(r), { status: "skipped", reason })
        assert.equal((await stored(r.workItemId)).attempts, 0)
      }
    })

    async function source(f: Fixture, kind: "accounting_sync_run" | "spend_import_batch", status: string, skipped = 0, failed = 0, complete = true) {
      const id = randomUUID()
      if (kind === "accounting_sync_run") await insert("accounting_sync_runs", { id, userId: f.userId, accounting_connection_id: f.connectionId,
        provider: "xero", status, invoices_skipped: skipped, completed_at: complete ? now : null })
      else await insert("spend_import_batches", { id, user_id: f.userId, file_name: "synthetic.csv", file_type: "csv", file_size_bytes: 1,
        content_hash: randomUUID(), schema_version: "1", status, rows_skipped: skipped, rows_failed: failed, completed_at: complete ? now : null, updated_at: now })
      return { sourceKind: kind, sourceId: id }
    }
    await t.test("real completion helper and repair: both sources, ownership, failed/partial suppression, replay and exhausted generation preserved", async () => {
      const f = await fixture(), foreign = await fixture()
      for (const kind of ["accounting_sync_run", "spend_import_batch"] as const) {
        const good = await source(f, kind, kind === "accounting_sync_run" ? "success" : "completed")
        assert.equal(await withUserContext(foreign.userId, (tx) => requestDetection(tx, foreign.userId, good)), false)
        const first = await repair(); assert.equal(first.repairFailed, 0); assert.ok(first.repaired >= 1)
        const rows = (await sql.query("SELECT * FROM commit_guard_work_items WHERE user_id=$1 AND dedupe_key=$2", [f.userId, `detection:${kind}:${good.sourceId}`])).rows
        assert.equal(rows.length, 1); const row = rows[0]
        assert.equal(row.state, "pending"); assert.equal(row.attempts, 0)
        assert.equal(await withUserContext(f.userId, (tx) => requestDetection(tx, f.userId, good)), false)
        await sql.query(`UPDATE commit_guard_work_items SET state='failed',attempts=6,generation=2,safe_error_code='execution_failed',completed_at=$2 WHERE id=$1`, [row.id, now])
        const before = await stored(row.id); await repair(); assert.deepEqual(await stored(row.id), before)
        for (const [status, skipped, failed, complete] of [["failed", 0, 0, true], ["partial", 0, 0, true],
          [kind === "accounting_sync_run" ? "success" : "completed", 1, 0, true],
          [kind === "accounting_sync_run" ? "success" : "completed", 0, 0, false],
          ...(kind === "spend_import_batch" ? [["completed", 0, 1, true]] : [])] as Array<[string, number, number, boolean]>) {
          const invalid = await source(f, kind, status, skipped, failed, complete)
          assert.equal(await withUserContext(f.userId, (tx) => requestDetection(tx, f.userId, invalid)), false)
        }
        await repair()
        assert.equal((await sql.query("SELECT count(*)::int n FROM commit_guard_work_items WHERE user_id=$1 AND kind='detect' AND source_kind=$2", [f.userId, kind])).rows[0].n, 1)
      }
    })
    await t.test("actual scans persist one UTC daily identity, rediscover lost enqueue, recover expired work and retain failed daily generation", async () => {
      const f = await fixture(), mutation = await work(f), expired = await fixture(), r = await work(expired)
      const owned = await claim(r); assert.equal(owned.status, "claimed")
      await sql.query(`UPDATE commit_guard_work_items SET attempts=6,lease_expires_at=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 second' WHERE id=$1`, [r.workItemId])
      const first = await scan({}), second = await scan({})
      assert.ok(first.recovered >= 1); assert.equal((await stored(r.workItemId)).state, "failed")
      for (const scanResult of [first, second]) {
        assert.ok(scanResult.jobs.some((j) => j.workItemId === mutation.workItemId), "pending survives no enqueue acknowledgment")
        assert.ok(scanResult.jobs.every((j) => Object.keys(j).sort().join() === "kind,userId,workItemId"))
        assert.ok(scanResult.jobs.length <= 100)
      }
      const daily = (await sql.query("SELECT * FROM commit_guard_work_items WHERE user_id=$1 AND source_kind='daily'", [f.userId])).rows
      assert.equal(daily.length, 1); assert.equal(daily[0].dedupe_key, `daily:${date}`)
      await sql.query("UPDATE commit_guard_work_items SET state='failed',attempts=6,completed_at=$2 WHERE id=$1", [daily[0].id, now])
      const before = await stored(daily[0].id); await scan({}); assert.deepEqual(await stored(daily[0].id), before)
    })
    await t.test("daily namespace is forbidden by ACTUAL pending-work INSERT policy", async () => {
      const f = await fixture()
      await assert.rejects(withUserContext(f.userId, (tx) => tx.$executeRaw`
        INSERT INTO commit_guard_work_items(id,user_id,kind,dedupe_key,source_kind,source_id,calculation_revision,updated_at)
        VALUES(${randomUUID()},${f.userId},'evaluate',${`daily:${date}`},'daily',${date},0,${now})`), /row-level security/)
    })
    await t.test("trusted retry: real admin/session SQL checks, competing compare-generation requests, preserved history and revoked-session denial", async () => {
      const adminId = randomUUID(), deviceId = randomUUID(), challengeId = randomUUID(), sessionId = randomUUID()
      actor = { userId: adminId, adminSession: { id: sessionId } }
      await insert("platform_roles", { id: randomUUID(), user_id: adminId, role: "platform_admin", status: "active", created_by: "synthetic", updated_at: now })
      await insert("admin_devices", { id: deviceId, admin_user_id: adminId, label: "Synthetic", public_key_bytes: Buffer.from("synthetic"),
        public_key_fingerprint: randomUUID(), created_by: "synthetic" })
      await insert("admin_challenges", { id: challengeId, user_id: adminId, nonce: randomUUID(), expires_at: new Date(Date.now()+3600000), ip_address: "127.0.0.1", user_agent: "synthetic" })
      await insert("admin_sessions", { id: sessionId, user_id: adminId, admin_device_id: deviceId, admin_challenge_id: challengeId,
        session_token: randomUUID(), expires_at: new Date(Date.now()+3600000), ip_address: "127.0.0.1", user_agent: "synthetic" })
      const f = await fixture(), r = await work(f)
      await sql.query("UPDATE commit_guard_work_items SET state='failed',attempts=6,fence=6,completed_at=$2,safe_error_code='execution_failed' WHERE id=$1", [r.workItemId, now])
      const request = { userId: f.userId, workItemId: r.workItemId, expectedGeneration: 0 }
      rejectElevation = true
      try { await assert.rejects(retry(request), /synthetic elevation denied/) } finally { rejectElevation = false }
      await sql.query("UPDATE admin_sessions SET revoked_at=$2 WHERE id=$1", [sessionId, now])
      assert.equal(await retry(request), false)
      await sql.query("UPDATE admin_sessions SET revoked_at=NULL WHERE id=$1", [sessionId])
      const results = await race(f.userId, [() => retry(request), () => retry(request)])
      assert.deepEqual(results.map((r) => { assert.equal(r.status, "fulfilled"); return (r as PromiseFulfilledResult<boolean>).value }).sort(), [false, true])
      const row = await stored(r.workItemId)
      assert.equal(row.generation, 1); assert.equal(row.fence, 6); assert.equal(row.attempts, 0); assert.equal(row.state, "pending")
      assert.equal(row.dedupe_key, "evaluation:0"); assert.equal(row.attempt_history.length, 1)
      assert.equal(row.attempt_history[0].actorUserId, adminId); assert.equal(row.attempt_history[0].adminSessionId, sessionId)
      assert.equal(row.attempt_history[0].attempts, 6); assert.equal(row.attempt_history[0].generation, 0)
    })

    await t.test("raw anon/authenticated CashPlan sessions enforce actual plan ownership without application filters", async () => {
      const a = await fixture(true), b = await fixture(true)
      const ids = new Map<string, { override: string; snapshot: string }>()
      let probes = 0
      // A separate real PostgreSQL session per probe; no Prisma/user WHERE.
      async function raw(role: "authenticated" | "anon", sub: string | null, query: string, values: unknown[] = []) {
        const session = new pg.Client({ ...config, database: clone })
        await session.connect()
        try {
          await session.query("BEGIN")
          await session.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify(sub ? { sub, role } : { role })])
          await session.query(`SET LOCAL ROLE ${role}`)
          assert.equal((await session.query("SELECT current_user role")).rows[0].role, role)
          probes++
          return await session.query(query, values)
        } finally { await session.query("ROLLBACK"); await session.end() }
      }
      for (const f of [a, b]) {
        const override = randomUUID(), snapshot = randomUUID()
        ids.set(f.userId, { override, snapshot })
        await insert("cash_plan_overrides", { id: override, plan_id: f.planId, entity_type: "outflow", entity_id: "raw",
          reason: "Synthetic", owner: f.userId, created_by: f.userId, updated_at: now })
        await insert("cash_plan_snapshots", { id: snapshot, plan_id: f.planId, input_hash: "raw", engine_version: "raw", weeks: [] })
      }
      for (const [f, foreign] of [[a, b], [b, a]]) {
        const own = ids.get(f.userId)!, other = ids.get(foreign.userId)!
        // Deliberately poison foreign descriptive ownership with caller identity.
        await sql.query("UPDATE cash_plan_overrides SET owner=$1,created_by=$1 WHERE id=$2", [f.userId, other.override])
        for (const [table, id] of [["cash_plans", f.planId], ["cash_plan_overrides", own.override], ["cash_plan_snapshots", own.snapshot]]) {
          const result = await raw("authenticated", f.userId, `SELECT id FROM ${table} ORDER BY id`)
          assert.deepEqual(result.rows, [{ id }], `${table}: only own plan data without WHERE`)
        }
        const overrideInsert = `INSERT INTO cash_plan_overrides
          (id,plan_id,entity_type,entity_id,reason,owner,created_by,updated_at)
          VALUES ($1,$2,'outflow','raw','Synthetic',$3,$3,$4) RETURNING id`
        const snapshotInsert = `INSERT INTO cash_plan_snapshots (id,plan_id,input_hash,engine_version,weeks,scenario_id)
          VALUES ($1,$2,'raw','raw','[]',$3) RETURNING id`
        const newOverride = randomUUID(), newSnapshot = randomUUID()
        assert.deepEqual((await raw("authenticated", f.userId, overrideInsert, [newOverride, f.planId, f.userId, now])).rows, [{ id: newOverride }])
        assert.deepEqual((await raw("authenticated", f.userId, snapshotInsert, [newSnapshot, f.planId, null])).rows, [{ id: newSnapshot }])
        await assert.rejects(raw("authenticated", f.userId, overrideInsert, [randomUUID(), foreign.planId, f.userId, now]), { code: "42501" })
        await assert.rejects(raw("authenticated", f.userId, snapshotInsert, [randomUUID(), foreign.planId, null]), { code: "42501" })
        const scenarioId = randomUUID()
        await insert("cash_plan_scenarios", { id: scenarioId, plan_id: foreign.planId, name: "Foreign", updated_at: now })
        await assert.rejects(raw("authenticated", f.userId, snapshotInsert, [randomUUID(), f.planId, scenarioId]), { code: "42501" })
        for (const query of [
          `UPDATE cash_plans SET user_id='forged' WHERE id='${f.planId}'`,
          `INSERT INTO cash_plans(id,user_id,updated_at) VALUES ('forged','${f.userId}',now())`,
          `DELETE FROM cash_plans WHERE id='${f.planId}'`,
          `UPDATE cash_plan_overrides SET plan_id='${foreign.planId}' WHERE id='${own.override}'`,
          `UPDATE cash_plan_overrides SET owner='${foreign.userId}' WHERE id='${own.override}'`,
          `DELETE FROM cash_plan_overrides WHERE id='${own.override}'`,
          `UPDATE cash_plan_snapshots SET plan_id='${foreign.planId}' WHERE id='${own.snapshot}'`,
          `UPDATE cash_plan_snapshots SET input_hash='forged' WHERE id='${own.snapshot}'`,
          `DELETE FROM cash_plan_snapshots WHERE id='${own.snapshot}'`,
          `UPDATE cash_plan_overrides SET created_at=now() WHERE id='${own.override}'`,
          `UPDATE cash_plan_snapshots SET created_at=now() WHERE id='${own.snapshot}'`,
        ]) await assert.rejects(raw("authenticated", f.userId, query), { code: "42501" })
        assert.equal((await sql.query("SELECT plan_id FROM cash_plan_snapshots WHERE id=$1", [own.snapshot])).rows[0].plan_id, f.planId)
        assert.equal((await sql.query("SELECT plan_id FROM cash_plan_overrides WHERE id=$1", [own.override])).rows[0].plan_id, f.planId)
      }
      for (const table of ["cash_plans", "cash_plan_overrides", "cash_plan_snapshots"]) {
        assert.deepEqual((await raw("authenticated", null, `SELECT id FROM ${table}`)).rows, [])
        for (const query of [`SELECT * FROM ${table}`, `INSERT INTO ${table}(id) VALUES ('anonymous')`,
          `UPDATE ${table} SET id=id`, `DELETE FROM ${table}`]) {
          await assert.rejects(raw("anon", a.userId, query), { code: "42501" })
        }
      }
      console.log(`PASS: ${probes} raw CashPlan role/identity probes; two-way ownership, forbidden writes and anon denial`)
    })
    await t.test("actual CashPlan artifact: canonical snapshot metadata, history, read-only GET and plan-owned tenant isolation", async () => {
      const f = await fixture(true), other = await fixture(true)
      await saveCash(f.userId, cashInput(0), now)
      const commitmentId = randomUUID()
      await insert("commitments", { id: commitmentId, user_id: f.userId, name: "Synthetic", category: "other", amount_cents: 10000,
        currency: "aud", frequency: "one_off", next_due_date: date, updated_at: now })
      const manual = await withUserContext(f.userId, (tx) => tx.cashPlanOverride.create({ data: {
        planId: f.planId, entityType: "outflow", entityId: "synthetic-manual", amountCents: 2000,
        reason: "Synthetic", sourceType: "manual", plannedDate: new Date(`${date}T00:00:00Z`),
        owner: f.userId, createdBy: f.userId,
      } }))
      assert.equal(manual.planId, f.planId, "real manual-item ORM payload/RETURNING works through actual artifact")
      const count = async () => (await sql.query("SELECT count(*)::int n FROM cash_plan_snapshots WHERE plan_id=$1", [f.planId])).rows[0].n
      const before = await count(), summary = await loadCashPlanSummary(f.userId, { now })
      assert.equal(summary.startingBalance.amountCents, 100000); assert.equal(await count(), before)
      const saved = await refreshCashPlan(f.userId, { now }); assert.ok(saved.snapshotId)
      const snapshot = (await sql.query("SELECT * FROM cash_plan_snapshots WHERE id=$1", [saved.snapshotId])).rows[0]
      assert.equal(snapshot.input_version, 2); assert.equal(snapshot.input_currency, "aud")
      assert.equal(snapshot.cash_input_revision, 1); assert.equal(snapshot.commitment_revision, 1)
      assert.equal(snapshot.anchor_date.toISOString().slice(0, 10), date)
      assert.ok(snapshot.canonical_facts); assert.ok(snapshot.coverage); assert.ok(snapshot.input_quality)
      assert.match(snapshot.input_hash, /^[a-f0-9]{64}$/)
      assert.equal(await withUserContext(other.userId, (tx) => tx.cashPlanSnapshot.count({ where: { planId: f.planId } })), 0)
      await assert.rejects(loadCashPlanSummary(other.userId, { planId: f.planId, now }), { status: 404 })
      await assert.rejects(withUserContext(other.userId, (tx) => tx.cashPlanSnapshot.create({ data: {
        planId: f.planId, inputHash: "synthetic-forged", engineVersion: "synthetic", weeks: [],
      } })), /row-level security/)
      await refreshCashPlan(f.userId, { now }); assert.equal(await count(), before + 2)
      assert.deepEqual((await sql.query("SELECT * FROM cash_plan_snapshots WHERE id=$1", [saved.snapshotId])).rows[0], snapshot)
      await saveCash(f.userId, cashInput(1, 120000), now)
      assert.equal((await loadCashPlanSummary(f.userId, { now })).startingBalance.amountCents, 120000)
      assert.equal(await count(), before + 2)
    })
    await t.test("actual CashPlan artifact: full job pipeline snapshot + evaluation state commit, final revision failure rolls snapshot/event/state back", async () => {
      const f = await fixture(true)
      await saveCash(f.userId, cashInput(0), now)
      const row = (await sql.query("SELECT id FROM commit_guard_work_items WHERE user_id=$1 AND dedupe_key='evaluation:1'", [f.userId])).rows[0]
      const request = { userId: f.userId, workItemId: row.id, kind: "evaluate" as const }
      assert.deepEqual(await dispatch(request), { status: "completed" })
      assert.equal((await stored(row.id)).state, "completed")
      assert.equal((await sql.query("SELECT count(*)::int n FROM cash_plan_snapshots WHERE plan_id=$1", [f.planId])).rows[0].n, 1)
      assert.equal((await sql.query("SELECT calculation_revision FROM commit_guard_evaluation_states WHERE user_id=$1", [f.userId])).rows[0].calculation_revision, 1)
      await saveCash(f.userId, cashInput(1, 150000), now)
      const next = (await sql.query("SELECT id FROM commit_guard_work_items WHERE user_id=$1 AND dedupe_key='evaluation:2'", [f.userId])).rows[0]
      const before = (await sql.query(`SELECT
        (SELECT count(*)::int FROM cash_plan_snapshots WHERE plan_id=$1) snapshots,
        (SELECT count(*)::int FROM commitment_events WHERE user_id=$2) events,
        (SELECT to_jsonb(s) FROM commit_guard_evaluation_states s WHERE user_id=$2) state`, [f.planId, f.userId])).rows[0]
      const result = await dispatch({ ...request, workItemId: next.id }, async () => {
        await sql.query("UPDATE commit_guard_settings SET calculation_revision=3 WHERE user_id=$1", [f.userId])
      })
      assert.deepEqual(result, { status: "skipped", reason: "superseded" })
      const after = (await sql.query(`SELECT
        (SELECT count(*)::int FROM cash_plan_snapshots WHERE plan_id=$1) snapshots,
        (SELECT count(*)::int FROM commitment_events WHERE user_id=$2) events,
        (SELECT to_jsonb(s) FROM commit_guard_evaluation_states s WHERE user_id=$2) state`, [f.planId, f.userId])).rows[0]
      assert.deepEqual(after, before)
    })
    console.log(JSON.stringify({ scope: "9.2", blockers, templateBaselineSha256: digest(original),
      aclBoundary: "Actual canonical/targeted CashPlan SQL in disposable clone only; NOT deployed/shared-target proof" }, null, 2))
  } finally {
    mock.restoreAll(); await db?.$disconnect()
    if (c) { await c.query("ROLLBACK"); await c.end() }
    if (created) await control.query(`DROP DATABASE ${quote(clone)}`)
    await control.end()
    assert.deepEqual(await baseline(), original, "source schema/ACLs/data, trial/billing, roles and database inventory unchanged; clone removed")
    console.log("PASS: complete original template baseline restored; this run's clone removed")
  }
})