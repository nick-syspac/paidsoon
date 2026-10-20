/** Task 6.1 ONLY. Authorized socket, disposable TEMPLATE clone, no env loader,
 * shared DB, API, scheduler, role changes or server restart. Run separately from
 * other clone verifiers with Node module-mocks + tsx + --test flags.
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { mock, test } from "node:test"
import pg from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient, type Prisma } from "@/lib/generated/prisma/client"

const config = { host: "/tmp/paidsoon-commitguard-pg.i62Iri", port: 55437, database: "commitguard", user: "syspac",
  password: () => "", ssl: false as const, connectionTimeoutMillis: 3000,
  options: "-c search_path=public -c statement_timeout=10000 -c lock_timeout=5000 -c timezone=UTC" }
const clone = `commitguard_work_${randomUUID().replaceAll("-", "")}`
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
async function identity(c: pg.Client, database: string): Promise<void> {
  assert.deepEqual((await c.query(`SELECT current_database() database,current_user role,inet_server_addr() tcp,
    current_setting('unix_socket_directories') socket,current_setting('port') port,current_setting('listen_addresses') listen`)).rows[0],
  { database, role: "syspac", tcp: null, socket: config.host, port: "55437", listen: "" })
}
async function baseline(): Promise<unknown> {
  const c = new pg.Client(config); await c.connect()
  try {
    await identity(c, "commitguard")
    const catalog = (await c.query(`SELECT jsonb_build_object(
      'relations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth')),
      'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth')),
      'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k),
      'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p),
      'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth')),
      'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t),
      'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),
      'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.oid) FROM pg_auth_members m),
      'databases',(SELECT jsonb_agg(jsonb_build_array(d.datname,d.datacl) ORDER BY d.datname) FROM pg_database d)
    ) snapshot`)).rows[0].snapshot
    const data: unknown[] = []
    for (const { tablename } of (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows) {
      data.push([tablename, (await c.query(`SELECT count(*)::int count,
        md5(coalesce(string_agg(row_to_json(t)::text,E'\n' ORDER BY row_to_json(t)::text),'')) digest
        FROM public.${quote(tablename)} t`)).rows[0]])
    }
    return { catalog, data }
  } finally { await c.end() }
}

test("6.1 real trusted helper, actual executor privileges and tenant RLS in disposable PostgreSQL", async (t) => {
  const original = await baseline()
  const control = new pg.Client({ ...config, database: "postgres" }); await control.connect()
  let created = false, client: pg.Client | undefined, prisma: PrismaClient | undefined
  let failRestore = false, failState = false, shortenRenewal = false
  let shortenedDeadline = new Date(0)
  try {
    await identity(control, "postgres")
    await control.query(`CREATE DATABASE ${quote(clone)} TEMPLATE commitguard`); created = true
    client = new pg.Client({ ...config, database: clone }); await client.connect(); await identity(client, clone)
    const c = client
    const canonical = await readFile(new URL("../prisma/rls-policies.sql", import.meta.url), "utf8")
    await c.query("BEGIN")
    try {
      assert.deepEqual((await c.query("SELECT rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname='authenticated'")).rows[0],
        { rolsuper: false, rolbypassrls: false, rolcanlogin: false })
      await c.query(`CREATE SCHEMA IF NOT EXISTS auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid $$;
        GRANT USAGE ON SCHEMA public,auth TO authenticated;
        GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated`)
      await c.query(await readFile(new URL("../prisma/rls-commitguard-policies.sql", import.meta.url), "utf8"))
      for (const table of ["commitments", "commitment_detection_candidates", "commitment_events", "commit_guard_settings", "user_profiles"]) {
        const owner = table === "user_profiles" ? '"userId"' : "user_id"
        const grants = canonical.match(new RegExp(`^GRANT SELECT(?:,[^\\n]+)? ON TABLE ${table} TO authenticated;`, "m"))
        assert.ok(grants, table)
        await c.query(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY;
          REVOKE ALL ON public.${quote(table)} FROM PUBLIC,authenticated,anon;
          ${grants[0]}
          CREATE POLICY work_fixture_select ON public.${quote(table)} FOR SELECT TO authenticated USING ((SELECT auth.uid())::text=${owner})`)
        if (["commitment_detection_candidates", "commitment_events"].includes(table)) {
          await c.query(`CREATE POLICY work_fixture_insert ON public.${quote(table)} FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())::text=${owner});
            CREATE POLICY work_fixture_update ON public.${quote(table)} FOR UPDATE TO authenticated
              USING ((SELECT auth.uid())::text=${owner}) WITH CHECK ((SELECT auth.uid())::text=${owner})`)
        }
      }
      // Only the canonical read-only access columns, confined to this clone.
      for (const table of ["tenant_trial_grants", "tenant_billing_risks"]) {
        const grant = canonical.match(new RegExp(`GRANT SELECT \\([^;]+\\)\\s+ON TABLE public\\.${table} TO authenticated;`))
        assert.ok(grant, table)
        await c.query(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY;
          REVOKE ALL ON public.${quote(table)} FROM PUBLIC,authenticated,anon;
          ${grant[0]}
          CREATE POLICY work_fixture_access ON public.${quote(table)} FOR SELECT TO authenticated USING ((SELECT auth.uid())::text=user_id)`)
      }
      await c.query(`REVOKE ALL ON public.platform_roles FROM PUBLIC,authenticated,anon;
        CREATE TABLE public.work_fixture_role_observations (role text NOT NULL);
        REVOKE ALL ON public.work_fixture_role_observations FROM PUBLIC,authenticated,anon;
        CREATE FUNCTION public.work_fixture_state_role() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          INSERT INTO public.work_fixture_role_observations VALUES (current_user);
          IF current_setting('work_fixture.fail_state',true)='yes' THEN RAISE EXCEPTION 'synthetic protected state failure'; END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER work_fixture_state_role BEFORE INSERT OR UPDATE ON public.commit_guard_evaluation_states
          FOR EACH ROW EXECUTE FUNCTION public.work_fixture_state_role()`)
      await c.query("COMMIT")
    } catch (error) { await c.query("ROLLBACK"); throw error }

    // Only substitute the connection factory: the real helper, withUserContext,
    // access reads/resolver/policy, Prisma adapter, SQL and RLS execute unchanged.
    // max=1 additionally proves the same pooled connection is clean on reuse.
    prisma = new PrismaClient({ adapter: new PrismaPg({ ...config, database: clone, max: 1 }) })
    const db = prisma
    const executor = { $transaction: async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { maxWait?: number; timeout?: number }) =>
      db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('work_fixture.fail_state', ${failState ? "yes" : "no"}, true)`
        let stateWritten = false
        const wrapped = new Proxy(tx, { get(target, key) {
          if (key === "commitGuardEvaluationState") return new Proxy(target.commitGuardEvaluationState, { get(delegate, method) {
            if (method === "upsert") return async (args: Prisma.CommitGuardEvaluationStateUpsertArgs) => {
              const result = await delegate.upsert(args); stateWritten = true; return result
            }
            return Reflect.get(delegate, method)
          } })
          if (key === "$executeRaw") return async (sql: TemplateStringsArray, ...args: unknown[]) => {
            if (failRestore && stateWritten && sql.join("") === "SET LOCAL ROLE authenticated") {
              failRestore = false
              // Deliberately fail restoration with a REAL SQL error while the
              // connection is still syspac. The whole transaction must abort.
              await target.$queryRaw`SELECT 1/0`
            }
            return target.$executeRaw(sql, ...args)
          }
          if (key === "$queryRaw") return async (sql: TemplateStringsArray, ...args: unknown[]) => {
            const result = await target.$queryRaw(sql, ...args)
            if (shortenRenewal && sql.join("").includes("UPDATE public.commit_guard_work_items w")) {
              // The current boundary renews on admission. Shorten that REAL
              // renewed lease inside this same executor transaction, rather
              // than waiting on the obsolete externally visible lease.
              shortenRenewal = false
              const [lease] = await target.$queryRaw<Array<{ deadline: Date }>>`UPDATE public.commit_guard_work_items
                SET lease_expires_at=(clock_timestamp() AT TIME ZONE 'UTC') + interval '700 milliseconds'
                WHERE lease_owner IS NOT NULL AND state='processing'
                RETURNING lease_expires_at AS deadline`
              shortenedDeadline = lease.deadline
            }
            return result
          }
          return Reflect.get(target, key)
        } })
        return fn(wrapped)
      }, options) }
    await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: executor } })
    const { withUserContext } = await import("@/lib/db/withUserContext")
    const { withCommitGuardWorkSideEffects: run, CommitGuardWorkBoundaryError: BoundaryError } = await import("@/lib/commitguard/workSideEffects")
    const insert = async (table: string, data: Record<string, unknown>) => {
      const entries = Object.entries(data)
      await c.query(`INSERT INTO public.${quote(table)} (${entries.map(([key]) => quote(key)).join(",")})
        VALUES (${entries.map((_, i) => `$${i + 1}`).join(",")})`, entries.map(([, value]) => value))
    }
    async function fixture(kind: "detect" | "evaluate" = "evaluate") {
      const userId = randomUUID(), workItemId = randomUUID(), leaseOwner = randomUUID(), candidateId = randomUUID()
      await insert("user_profiles", { id: randomUUID(), userId, subscriptionStatus: "active", subscriptionTier: "business_pro",
        stripe_subscription_id: "sub_synthetic", updatedAt: new Date() })
      await insert("commit_guard_settings", { id: randomUUID(), user_id: userId, enabled: true,
        detect_recurring_commitments: true, calculation_revision: 7, updated_at: new Date() })
      await insert("commitment_detection_candidates", { id: candidateId, user_id: userId, name: "Synthetic unchanged", category: "other",
        frequency: "monthly", typical_amount_cents: 1000, currency: "aud", source: "system_inferred", confidence: "high", confidence_score: 0.9,
        evidence: {}, updated_at: new Date() })
      await c.query(`INSERT INTO commit_guard_work_items (id,user_id,kind,dedupe_key,source_kind,calculation_revision,
        state,attempts,lease_owner,lease_expires_at,fence,updated_at)
        VALUES ($1,$2,$3,$4,'mutation',$5,'processing',1,$6,clock_timestamp()+interval '60 seconds',4,clock_timestamp())`,
      [workItemId, userId, kind, `evaluation:${randomUUID()}`, kind === "detect" ? 0 : 7, leaseOwner])
      return { userId, workItemId, kind, leaseOwner, fence: 4, expectedCalculationRevision: 7, candidateId }
    }
    type Fixture = Awaited<ReturnType<typeof fixture>>
    const job = (f: Fixture) => ({ userId: f.userId, workItemId: f.workItemId, kind: f.kind,
      leaseOwner: f.leaseOwner, fence: f.fence, expectedCalculationRevision: f.expectedCalculationRevision })
    async function trial(f: Fixture, seconds = 3600) {
      const operationId = randomUUID()
      await insert("tenant_trial_operations", { id: operationId, user_id: f.userId, actor_user_id: "synthetic",
        admin_session_id: "synthetic", input_hash: "synthetic", normalized_input: {}, action: "extend_or_grant", source: "admin_grant",
        previous_snapshot: {}, reason: "Synthetic fixture", time_zone: "UTC", preview_version: 1,
        preview_fingerprint: "synthetic", preview_expires_at: new Date(Date.now()+3600000), updated_at: new Date() })
      await c.query(`UPDATE user_profiles SET "subscriptionStatus"='cancelled',stripe_subscription_id=NULL WHERE "userId"=$1`, [f.userId])
      await c.query(`INSERT INTO tenant_trial_grants (id,user_id,plan,starts_at,expires_at,creator_operation_id,last_operation_id,updated_at)
        VALUES ($1,$2,'business_pro',clock_timestamp()-interval '1 day',clock_timestamp()+$3::double precision*interval '1 second',$4,$4,clock_timestamp())`,
      [randomUUID(), f.userId, seconds, operationId])
    }
    const snapshot = async (f: Fixture) => (await c.query(`SELECT
      (SELECT to_jsonb(w) FROM commit_guard_work_items w WHERE id=$1) work,
      (SELECT name FROM commitment_detection_candidates WHERE id=$2) candidate,
      (SELECT count(*)::int FROM commitment_events WHERE user_id=$3) events,
      (SELECT to_jsonb(s) FROM commit_guard_evaluation_states s WHERE user_id=$3) evaluation`, [f.workItemId, f.candidateId, f.userId])).rows[0]
    async function auth(tx: Prisma.TransactionClient, userId: string) {
      assert.deepEqual(await tx.$queryRaw`SELECT current_user role,auth.uid()::text uid`, [{ role: "authenticated", uid: userId }])
    }
    async function effects(tx: Prisma.TransactionClient, f: Fixture) {
      await auth(tx, f.userId)
      await tx.commitmentDetectionCandidate.update({ where: { id: f.candidateId }, data: { name: "Synthetic changed" } })
      await tx.commitmentEvent.create({ data: { userId: f.userId, eventType: "COMMITMENT_DETECTED", title: "Synthetic", message: "Synthetic" } })
    }
    async function cleanPool() {
      assert.deepEqual(await db.$queryRaw`SELECT current_user role,nullif(current_setting('request.jwt.claims',true),'') claims`,
        [{ role: "syspac", claims: null }])
    }
    async function waitBlocked(locktype: string) {
      const deadline = Date.now() + 4000
      do {
        const { n } = (await c.query(`SELECT count(*)::int n FROM pg_locks w WHERE NOT w.granted AND w.locktype=$2
          AND EXISTS(SELECT 1 FROM pg_locks a WHERE a.pid=w.pid AND a.database=(SELECT oid FROM pg_database WHERE datname=$1))`, [clone, locktype])).rows[0]
        if (n > 0) return
      } while (Date.now() < deadline)
      assert.fail(`no actual waiting ${locktype} lock`)
    }
    await t.test("real success: RLS callbacks, protected executor state, result, completion and no pooled role leak", async () => {
      const f = await fixture(), foreign = await fixture()
      const result = await run({ ...job(f), complete: true }, async (tx, state) => {
        await effects(tx, f)
        assert.equal(await tx.commitmentDetectionCandidate.findUnique({ where: { id: foreign.candidateId } }), null)
        state.saveEvaluationState({ calculationRevision: 7, cashRiskRelevance: "active", cashRiskEpisodeId: "synthetic" })
        await auth(tx, f.userId)
        assert.equal(await tx.commitGuardEvaluationState.findUnique({ where: { userId: f.userId } }), null, "state staged, never elevated during caller code")
        return { processed: 1 }
      })
      assert.deepEqual(result, { processed: 1 })
      const saved = await snapshot(f)
      assert.equal(saved.candidate, "Synthetic changed"); assert.equal(saved.events, 1)
      assert.equal(saved.evaluation.calculation_revision, 7)
      assert.equal(saved.work.state, "completed"); assert.equal(saved.work.lease_owner, null)
      assert.equal(saved.work.lease_expires_at, null); assert.ok(saved.work.completed_at)
      assert.deepEqual((await c.query("SELECT role FROM work_fixture_role_observations")).rows, [{ role: "syspac" }])
      await cleanPool()
    })
    await t.test("real ACLs deny tenant work/state writes and private work columns, not just RLS row hiding", async () => {
      const f = await fixture()
      for (const operation of [
        (tx: Prisma.TransactionClient) => tx.$queryRaw`SELECT * FROM public.commit_guard_work_items`,
        (tx: Prisma.TransactionClient) => tx.$executeRaw`UPDATE public.commit_guard_work_items SET fence=99 WHERE id=${f.workItemId}`,
        (tx: Prisma.TransactionClient) => tx.commitGuardEvaluationState.create({ data: { userId: f.userId } }),
        (tx: Prisma.TransactionClient) => tx.$queryRaw`SELECT * FROM public.platform_roles`,
      ]) await assert.rejects(withUserContext(f.userId, operation), /permission denied/i)
      await cleanPool()
    })
    await t.test("invalid owner, fence, expired/overlong lease, state, tenant, kind, work revision: no callback", async () => {
      const changes = ["lease_owner='replacement'", "fence=5", "lease_expires_at=clock_timestamp()",
        "lease_expires_at=clock_timestamp()+interval '61 seconds'", "state='failed'", "calculation_revision=6"]
      for (const change of changes) {
        const f = await fixture(); await c.query(`UPDATE commit_guard_work_items SET ${change} WHERE id=$1`, [f.workItemId])
        const before = await snapshot(f)
        await assert.rejects(run(job(f), async () => assert.fail("callback")), BoundaryError)
        assert.deepEqual(await snapshot(f), before)
      }
      const f = await fixture(), other = await fixture()
      for (const wrong of [{ userId: other.userId }, { workItemId: randomUUID() }, { kind: "detect" as const }]) {
        await assert.rejects(run({ ...job(f), ...wrong }, async () => assert.fail("callback")), { reason: "work_unavailable" })
      }
      await cleanPool()
    })
    await t.test("wall-clock lease expires AFTER callback writes: candidates, events, protected state and work assertion ALL roll back", async () => {
      const f = await fixture()
      await c.query(`UPDATE commit_guard_work_items SET lease_expires_at=clock_timestamp()+interval '700 milliseconds' WHERE id=$1`, [f.workItemId])
      const before = await snapshot(f)
      let reached = false
      shortenRenewal = true
      await assert.rejects(run({ ...job(f), complete: true }, async (tx, state) => {
        await effects(tx, f); state.saveEvaluationState({ calculationRevision: 7, cashRiskRelevance: "active" })
        reached = true
        // Real DB wall time passes, but transaction_timestamp remains earlier.
        // No fake fence checker or in-process clock is involved.
        let expired = false
        while (!expired) {
          expired = (await tx.$queryRaw<Array<{ expired: boolean }>>`SELECT
            (clock_timestamp() AT TIME ZONE 'UTC') >= ${shortenedDeadline}::timestamp expired`)[0].expired
        }
      }), { reason: "lease_lost" })
      assert.equal(reached, true); assert.deepEqual(await snapshot(f), before)
      assert.equal((await c.query("SELECT count(*)::int n FROM work_fixture_role_observations")).rows[0].n, 1, "failed state's role observation rolled back too")
      await cleanPool()
    })
    await t.test("fresh access, not queued authorization: downgrade/revoked or expired grants/disabled module fail before financial work", async () => {
      for (const change of ['"subscriptionStatus"=\'cancelled\',stripe_subscription_id=NULL', '"subscriptionTier"=\'essentials\'']) {
        const f = await fixture("detect"); await c.query(`UPDATE user_profiles SET ${change} WHERE "userId"=$1`, [f.userId])
        const before = await snapshot(f)
        await assert.rejects(run(job(f), async () => assert.fail("callback")), BoundaryError)
        assert.deepEqual(await snapshot(f), before)
      }
      for (const column of ["enabled", "detect_recurring_commitments"]) {
        const f = await fixture("detect"); await c.query(`UPDATE commit_guard_settings SET ${column}=false WHERE user_id=$1`, [f.userId])
        await assert.rejects(run(job(f), async () => assert.fail("callback")), { reason: column === "enabled" ? "module_disabled" : "detection_disabled" })
      }
      const f = await fixture()
      await assert.rejects(run({ ...job(f), allowAccess: true } as never, async () => assert.fail("callback")))
      for (const revoked of [true, false]) {
        const grant = await fixture(); await trial(grant, revoked ? 3600 : -1)
        if (revoked) await c.query("UPDATE tenant_trial_grants SET revoked_at=clock_timestamp() WHERE user_id=$1", [grant.userId])
        const before = await snapshot(grant)
        await assert.rejects(run(job(grant), async () => assert.fail("grant denied")), { reason: "no_access" })
        assert.deepEqual(await snapshot(grant), before)
      }
      await cleanPool()
    })
    await t.test("revocation and revision committing DURING callback roll back actual candidate/event/state writes", async () => {
      for (const revision of [false, true]) {
        const f = await fixture(); const before = await snapshot(f)
        await assert.rejects(run(job(f), async (tx, state) => {
          await effects(tx, f); state.saveEvaluationState({ calculationRevision: 7 })
          if (revision) {
            await c.query(`UPDATE commit_guard_settings SET calculation_revision=8 WHERE user_id=$1`, [f.userId])
            // Newer pending work must survive the stale transaction rollback.
            await c.query(`INSERT INTO commit_guard_work_items (id,user_id,kind,dedupe_key,source_kind,calculation_revision,updated_at)
              VALUES ($1,$2,'evaluate','evaluation:8','mutation',8,clock_timestamp())`, [randomUUID(), f.userId])
          } else await c.query(`UPDATE user_profiles SET "subscriptionStatus"='cancelled',stripe_subscription_id=NULL WHERE "userId"=$1`, [f.userId])
        }), { reason: revision ? "superseded" : "no_access" })
        assert.deepEqual(await snapshot(f), before)
        if (revision) assert.equal((await c.query("SELECT state FROM commit_guard_work_items WHERE user_id=$1 AND dedupe_key='evaluation:8'", [f.userId])).rows[0].state, "pending")
      }
      await cleanPool()
    })
    await t.test("real grant revocation/expiry AFTER admission cannot commit callback effects", async () => {
      for (const revoked of [true, false]) {
        const f = await fixture(); await trial(f)
        const before = await snapshot(f)
        await assert.rejects(run(job(f), async (tx, state) => {
          await effects(tx, f); state.saveEvaluationState({ calculationRevision: 7 })
          if (revoked) await c.query("UPDATE tenant_trial_grants SET revoked_at=clock_timestamp() WHERE user_id=$1", [f.userId])
          else await c.query("UPDATE tenant_trial_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1", [f.userId])
        }), { reason: "no_access" })
        assert.deepEqual(await snapshot(f), before)
      }
      await cleanPool()
    })
    await t.test("tenant -> work -> candidate lock order observed in actual blocked PostgreSQL sessions; access rechecked AFTER waits", async () => {
      const f = await fixture()
      await c.query("BEGIN"); await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`commitguard:${f.userId}`])
      const pending = Promise.allSettled([run(job(f), async () => assert.fail("revoked after wait"))])
      try {
        await waitBlocked("advisory")
        await c.query(`UPDATE user_profiles SET "subscriptionStatus"='cancelled',stripe_subscription_id=NULL WHERE "userId"=$1`, [f.userId])
        await c.query("COMMIT")
      } finally { await c.query("ROLLBACK") }
      const [denied] = await pending; assert.equal(denied.status, "rejected")
      assert.equal((denied as PromiseRejectedResult).reason.reason, "no_access")
      const next = await fixture()
      await c.query("BEGIN"); await c.query("SELECT id FROM commit_guard_work_items WHERE id=$1 FOR UPDATE", [next.workItemId])
      const waiting = Promise.allSettled([run(job(next), async (tx) => effects(tx, next))])
      try {
        await waitBlocked("transactionid")
        assert.equal((await c.query(`SELECT EXISTS(SELECT 1 FROM pg_locks a JOIN pg_locks w ON w.pid=a.pid
          WHERE a.database=(SELECT oid FROM pg_database WHERE datname=$1) AND a.locktype='advisory' AND a.granted AND NOT w.granted) held`, [clone])).rows[0].held, true)
        await c.query("UPDATE commit_guard_work_items SET fence=5,lease_owner='replacement' WHERE id=$1", [next.workItemId])
        await c.query("COMMIT")
      } finally { await c.query("ROLLBACK") }
      const [stale] = await waiting; assert.equal(stale.status, "rejected")
      assert.equal((stale as PromiseRejectedResult).reason.reason, "lease_lost")
      const last = await fixture()
      await c.query("BEGIN"); await c.query("SELECT id FROM commitment_detection_candidates WHERE id=$1 FOR UPDATE", [last.candidateId])
      const candidateWait = Promise.allSettled([run(job(last), async (tx) => effects(tx, last))])
      try {
        await waitBlocked("transactionid")
        const held = await c.query(`SELECT count(*)::int n FROM pg_locks l WHERE l.database=(SELECT oid FROM pg_database WHERE datname=$1)
          AND l.granted AND l.relation='public.commit_guard_work_items'::regclass AND l.mode='RowExclusiveLock'`, [clone])
        assert.ok(held.rows[0].n >= 1, "work assertion already acquired before waiting on candidate")
        await c.query("ROLLBACK")
      } finally { await c.query("ROLLBACK") }
      assert.equal((await candidateWait)[0].status, "fulfilled"); await cleanPool()
    })
    await t.test("independent detection source revision zero uses current settings, not obsolete queued revision", async () => {
      const f = await fixture("detect")
      await run(job(f), async (tx) => effects(tx, f))
      assert.equal((await snapshot(f)).events, 1)
      const before = await snapshot(f)
      await c.query("UPDATE commit_guard_settings SET calculation_revision=8 WHERE user_id=$1", [f.userId])
      await assert.rejects(run(job(f), async () => assert.fail("outdated expected revision")), { reason: "superseded" })
      assert.deepEqual(await snapshot(f), before)
      await run({ ...job(f), expectedCalculationRevision: 8 }, async (tx) => auth(tx, f.userId))
      await cleanPool()
    })
    await t.test("actual protected-state SQL failure and failed role restoration abort all financial effects and restore pooled session", async () => {
      for (const restore of [false, true]) {
        const f = await fixture(); const before = await snapshot(f)
        failRestore = restore; failState = !restore
        await assert.rejects(run({ ...job(f), complete: true }, async (tx, state) => {
          await effects(tx, f); state.saveEvaluationState({ calculationRevision: 7 })
        }), restore ? /division by zero|transaction is aborted/i : /synthetic protected state failure|transaction is aborted/i)
        failRestore = false; failState = false
        assert.deepEqual(await snapshot(f), before); await cleanPool()
        await withUserContext(f.userId, async (tx) => auth(tx, f.userId))
      }
    })
  } finally {
    mock.restoreAll(); await prisma?.$disconnect()
    if (client) { await client.query("ROLLBACK"); await client.end() }
    if (created) await control.query(`DROP DATABASE ${quote(clone)}`)
    await control.end()
    assert.deepEqual(await baseline(), original, "template data/schema/ACL/trial/billing baseline, roles and database inventory unchanged; clone removed")
  }
})