/** Tasks 4.1/4.2/4.3/4.4 only. Explicit authorized Unix socket; no env loader, URL resolver,
 * remote services, role creation/changes or server restarts. All committed
 * fixtures/DDL are confined to a disposable TEMPLATE clone, dropped in finally.
 * Run with node --experimental-test-module-mocks --import tsx --test.
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { mock, test } from "node:test"
import pg from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient, type Prisma } from "@/lib/generated/prisma/client"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { getPlanByTier, type SubscriptionTier } from "@/lib/subscriptionPlans"

const config = { host: "/tmp/paidsoon-commitguard-pg.i62Iri", port: 55437, database: "commitguard", user: "syspac",
  password: () => "", ssl: false as const, connectionTimeoutMillis: 3000,
  options: "-c search_path=public -c statement_timeout=10000 -c lock_timeout=5000" }
const clone = `commitguard_create_${randomUUID().replaceAll("-", "")}`
const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`
const now = new Date("2026-10-19T12:00:00Z")
const limit = getPlanByTier("business_control").limits.commitmentsTracked
const input = { name: "Synthetic creation", category: "other", amountCents: 1000, currency: "aud", frequency: "monthly" }

async function identity(client: pg.Client, database: string): Promise<void> {
  assert.deepEqual((await client.query(`SELECT current_database() database, current_user role,
    inet_server_addr() tcp, current_setting('unix_socket_directories') socket,
    current_setting('port') port, current_setting('listen_addresses') listen`)).rows[0], {
    database, role: "syspac", tcp: null, socket: config.host, port: "55437", listen: "",
  })
}
async function baseline(): Promise<unknown> {
  const c = new pg.Client(config)
  await c.connect()
  try {
    await identity(c, "commitguard")
    const catalog = (await c.query(`SELECT jsonb_build_object(
      'relations', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth')),
      'columns', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a
        JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth')),
      'constraints', (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k),
      'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p),
      'functions', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth')),
      'triggers', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t),
      'roles', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),
      'memberships', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.oid) FROM pg_auth_members m),
      'databases', (SELECT jsonb_agg(jsonb_build_array(d.datname,d.datacl) ORDER BY d.datname) FROM pg_database d)
    ) snapshot`)).rows[0].snapshot
    const tables = (await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows
    const data: unknown[] = []
    for (const { tablename } of tables) {
      data.push([tablename, (await c.query(`SELECT count(*)::int count,
        md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text),'')) digest
        FROM public.${quote(tablename)} t`)).rows[0]])
    }
    return { catalog, data }
  } finally { await c.end() }
}

test("4.1/4.2/4.3/4.4 real mutation services, authorized isolated PostgreSQL clone", async (t) => {
  const original = await baseline()
  const control = new pg.Client({ ...config, database: "postgres" })
  let created = false
  let client: pg.Client | undefined
  let prisma: PrismaClient | undefined
  let failAudit = false
  let failRevision = false, failWork = false
  const tiers = new Map<string, SubscriptionTier | null>()
  await control.connect()
  try {
    await identity(control, "postgres")
    await control.query(`CREATE DATABASE ${quote(clone)} TEMPLATE commitguard`)
    created = true
    client = new pg.Client({ ...config, database: clone })
    await client.connect()
    await identity(client, clone)
    const c = client
    const canonical = await readFile(new URL("../prisma/rls-policies.sql", import.meta.url), "utf8")
    await c.query("BEGIN")
    try {
      for (const role of ["anon", "authenticated"]) {
        assert.deepEqual((await c.query("SELECT rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname=$1", [role])).rows[0],
          { rolsuper: false, rolbypassrls: false, rolcanlogin: false })
      }
      await c.query(`CREATE SCHEMA IF NOT EXISTS auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'sub')::uuid $$;
        GRANT USAGE ON SCHEMA public, auth TO authenticated;
        GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated`)
      await c.query(await readFile(new URL("../prisma/rls-commitguard-policies.sql", import.meta.url), "utf8"))
      for (const table of ["commitments", "commitment_detection_candidates", "commitment_events", "commit_guard_settings"]) {
        const grants = canonical.match(new RegExp(`^GRANT [^\\n]+ ON TABLE ${table} TO authenticated;`, "m"))
        assert.ok(grants, `missing canonical grants: ${table}`)
        await c.query(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY;
          REVOKE ALL ON public.${quote(table)} FROM authenticated, anon;
          ${grants[0]}
          CREATE POLICY creation_fixture_select ON public.${quote(table)} FOR SELECT TO authenticated
            USING ((SELECT auth.uid())::text = user_id);
          CREATE POLICY creation_fixture_insert ON public.${quote(table)} FOR INSERT TO authenticated
            WITH CHECK ((SELECT auth.uid())::text = user_id);
          CREATE POLICY creation_fixture_update ON public.${quote(table)} FOR UPDATE TO authenticated
            USING ((SELECT auth.uid())::text = user_id) WITH CHECK ((SELECT auth.uid())::text = user_id)`)
      }
      await c.query(`CREATE FUNCTION creation_fixture_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF current_setting('creation_fixture.fail_audit', true) = 'yes' THEN RAISE EXCEPTION 'synthetic creation audit failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER creation_fixture_audit_fail BEFORE INSERT ON public.commitment_events
          FOR EACH ROW EXECUTE FUNCTION creation_fixture_audit_fail()`)
      await c.query(`CREATE FUNCTION creation_fixture_revision_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF current_setting('creation_fixture.fail_revision', true) = 'yes' THEN RAISE EXCEPTION 'synthetic revision failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER creation_fixture_revision_fail BEFORE INSERT OR UPDATE ON public.commit_guard_settings
          FOR EACH ROW EXECUTE FUNCTION creation_fixture_revision_fail();
        CREATE FUNCTION creation_fixture_work_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF current_setting('creation_fixture.fail_work', true) = 'yes' THEN RAISE EXCEPTION 'synthetic work failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER creation_fixture_work_fail BEFORE INSERT ON public.commit_guard_work_items
          FOR EACH ROW EXECUTE FUNCTION creation_fixture_work_fail()`)
      await c.query("COMMIT")
    } catch (error) { await c.query("ROLLBACK"); throw error }

    prisma = new PrismaClient({ adapter: new PrismaPg({ ...config, database: clone, max: 8 }) })
    const database = prisma
    const executor = {
      $transaction: async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { maxWait?: number; timeout?: number }) =>
        database.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('creation_fixture.fail_audit', ${failAudit ? "yes" : "no"}, true)`
          await tx.$executeRaw`SELECT set_config('creation_fixture.fail_revision', ${failRevision ? "yes" : "no"}, true)`
          await tx.$executeRaw`SELECT set_config('creation_fixture.fail_work', ${failWork ? "yes" : "no"}, true)`
          return fn(tx)
        }, options),
    }
    // Only replace the connection factory and effective-access input boundary.
    // Real services, entitlements, billing plan limits, withUserContext, advisory
    // lock SQL, Prisma adapter and PostgreSQL RLS all execute unchanged.
    await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: executor } })
    await mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: {
      getEffectiveAccess: async (userId: string) => resolveEffectiveAccess({ profile: {
        subscriptionStatus: "active", subscriptionTier: tiers.has(userId) ? tiers.get(userId)! : "business_control",
        stripeSubscriptionId: "sub_synthetic", trialEndsAt: null, billingAccessVersion: 1,
      }, grant: null, billingRisks: [] }, now),
    } })
    const { createCommitment, updateCommitment, transitionCommitment, saveCommitGuardSettings } = await import("@/lib/commitguard/service")
    const { CommitmentMutationConflict } = await import("@/lib/commitguard/commitmentMutation")
    const { reviewDetectedCommitmentCandidate } = await import("@/lib/commitguard/detection")
    const manual = (userId: string) => createCommitment(userId, input)
    const convert = (userId: string, candidateId: string) => reviewDetectedCommitmentCandidate({ userId, candidateId, action: "confirm" })
    const snapshot = async (userId: string) => (await c.query(`SELECT
      (SELECT count(*)::int FROM commitments WHERE user_id=$1 AND archived_at IS NULL) tracked,
      (SELECT count(*)::int FROM commitment_detection_candidates WHERE user_id=$1 AND status='converted') converted,
      (SELECT count(*)::int FROM commitment_events WHERE user_id=$1) audit,
      (SELECT calculation_revision FROM commit_guard_settings WHERE user_id=$1) revision,
      (SELECT count(*)::int FROM commit_guard_work_items WHERE user_id=$1) work`, [userId])).rows[0]
    async function evaluations(userId: string, revisions: number[]) {
      const rows = (await c.query(`SELECT kind,dedupe_key,source_kind,source_id,calculation_revision,state,attempts,fence,
        lease_owner,lease_expires_at,completed_at FROM commit_guard_work_items WHERE user_id=$1 ORDER BY calculation_revision`, [userId])).rows
      assert.deepEqual(rows, revisions.map((revision) => ({ kind: "evaluate", dedupe_key: `evaluation:${revision}`,
        source_kind: "mutation", source_id: null, calculation_revision: revision, state: "pending", attempts: 0, fence: 0,
        lease_owner: null, lease_expires_at: null, completed_at: null })))
    }
    async function fixture(count = limit - 1, status = "active") {
      const userId = randomUUID(), first = randomUUID(), second = randomUUID()
      await c.query(`INSERT INTO user_profiles (id,"userId","updatedAt") VALUES ($1,$2,$3)`, [randomUUID(), userId, now])
      await c.query(`INSERT INTO commit_guard_settings (id,user_id,calculation_revision,updated_at) VALUES ($1,$2,7,$3)`, [randomUUID(), userId, now])
      await c.query(`INSERT INTO commitments (id,user_id,name,category,amount_cents,currency,frequency,status,updated_at)
        SELECT $1 || '-' || n,$2,'Synthetic existing','other',1000,'aud','monthly',$3,$4
        FROM generate_series(1,$5::int) n`, [randomUUID(), userId, status, now, count])
      for (const id of [first, second]) await c.query(`INSERT INTO commitment_detection_candidates
        (id,user_id,name,category,frequency,typical_amount_cents,currency,source,confidence,confidence_score,evidence,recurrence_anchor,suggested_due_date,updated_at)
        VALUES ($1,$2,'Synthetic candidate','other','monthly',1000,'aud','system_inferred','high',0.95,'{}',$3::timestamp,$3::timestamp::date,$3::timestamp)`, [id, userId, now])
      return { userId, first, second }
    }
    async function gate(userId: string): Promise<void> {
      await c.query("BEGIN")
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`commitguard:${userId}`])
    }
    async function blocked(count: number): Promise<void> {
      const deadline = Date.now() + 4000
      do {
        // pg_locks is live; pg_stat_activity can retain a transaction-cached
        // session inventory and miss freshly opened pool connections here.
        const result = await c.query(`SELECT count(DISTINCT l.pid)::int n FROM pg_locks l
          WHERE l.database=(SELECT oid FROM pg_database WHERE datname=$1)
          AND l.locktype='advisory' AND NOT l.granted`, [clone])
        if (result.rows[0].n === count) return
      } while (Date.now() < deadline)
      assert.fail(`expected ${count} distinct PostgreSQL sessions blocked on the tenant advisory lock`)
    }
    async function race(userId: string, operations: Array<() => Promise<unknown>>) {
      await gate(userId)
      const results = Promise.allSettled(operations.map((operation) => operation()))
      try { await blocked(2) } finally { await c.query("ROLLBACK"); await results }
      return results
    }

    await t.test("4.2 two actually blocked sessions confirm the SAME final-slot candidate exactly once; full-plan retry returns original", async () => {
      const f = await fixture()
      const results = await race(f.userId, [() => convert(f.userId, f.first), () => convert(f.userId, f.first)])
      assert.equal(results[0].status, "fulfilled")
      assert.equal(results[1].status, "fulfilled")
      const a = (results[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof convert>>>).value
      const b = (results[1] as PromiseFulfilledResult<Awaited<ReturnType<typeof convert>>>).value
      assert.deepEqual(a, b)
      assert.equal(a.status, "updated")
      assert.ok("commitmentId" in a && a.commitmentId)
      const original = a.commitmentId
      assert.deepEqual(await snapshot(f.userId), { tracked: limit, converted: 1, audit: 1, revision: 8, work: 1 })
      await evaluations(f.userId, [8])
      const event = (await c.query(`SELECT event_type,commitment_id,detection_candidate_id,dedupe_key,metadata
        FROM commitment_events WHERE user_id=$1`, [f.userId])).rows[0]
      assert.equal(event.event_type, "COMMITMENT_CREATED_FROM_DETECTION")
      assert.equal(event.commitment_id, original)
      assert.equal(event.detection_candidate_id, f.first)
      assert.equal(event.dedupe_key, `commitguard:conversion:${f.first}`)
      assert.equal(event.metadata.sourceCandidateId, f.first)
      assert.deepEqual(event.metadata.transition, { from: "pending", to: "converted" })
      assert.equal((await c.query(`SELECT source_detection_candidate_id FROM commitments WHERE id=$1`, [original])).rows[0].source_detection_candidate_id, f.first)
      const before = await snapshot(f.userId)
      await c.query(`UPDATE commitment_detection_candidates SET frequency='custom' WHERE id=$1`, [f.first])
      assert.deepEqual(await convert(f.userId, f.first), a, "retry precedes legacy frequency validation and allowance")
      for (const action of ["edit", "ignore", "not_a_commitment"] as const) {
        assert.deepEqual(await reviewDetectedCommitmentCandidate({ userId: f.userId, candidateId: f.first, action,
          ...(action === "edit" ? { patch: { name: "Must not overwrite" } } : {}) }),
        { status: "conflict", reason: "candidate_already_converted", commitmentId: original })
      }
      assert.deepEqual(await snapshot(f.userId), before)
      await c.query(`UPDATE commitments SET archived_at=$1,status='cancelled' WHERE id=$2`, [now, original])
      assert.deepEqual(await convert(f.userId, f.first), a, "archiving/cancelling does not permit another conversion")
      assert.equal((await snapshot(f.userId)).audit, 1)
    })

    await t.test("4.2 candidate row is really locked after tenant lock, and state is re-read after the wait", async () => {
      const f = await fixture(0)
      await c.query("BEGIN")
      await c.query(`SELECT id FROM commitment_detection_candidates WHERE id=$1 FOR UPDATE`, [f.first])
      const pending = Promise.allSettled([convert(f.userId, f.first)])
      try {
        const deadline = Date.now() + 4000
        let waiting = false
        do {
          const result = await c.query(`SELECT EXISTS(SELECT 1 FROM pg_locks l
            WHERE l.database=(SELECT oid FROM pg_database WHERE datname=$1) AND l.locktype='advisory' AND l.granted
            AND EXISTS(SELECT 1 FROM pg_locks w WHERE w.pid=l.pid AND NOT w.granted)) waiting`, [clone])
          waiting = result.rows[0].waiting
          if (waiting) break
        } while (Date.now() < deadline)
        assert.equal(waiting, true, "actual service holds tenant lock while waiting for candidate row")
        await c.query(`UPDATE commitment_detection_candidates SET status='converted' WHERE id=$1`, [f.first])
        await c.query("COMMIT")
      } finally { await c.query("ROLLBACK"); await pending }
      const [result] = await pending
      assert.equal(result.status, "fulfilled")
      assert.deepEqual((result as PromiseFulfilledResult<unknown>).value,
        { status: "conflict", reason: "conversion_review_required", reviewReasons: ["missing_audit_evidence"] })
      assert.equal((await snapshot(f.userId)).tracked, 0)
      assert.equal((await snapshot(f.userId)).audit, 0)
    })

    await t.test("4.2 competing confirm and review actions never reopen a converted candidate", async () => {
      for (const action of ["edit", "ignore", "not_a_commitment"] as const) {
        const f = await fixture(0)
        const results = await race(f.userId, [() => convert(f.userId, f.first),
          () => reviewDetectedCommitmentCandidate({ userId: f.userId, candidateId: f.first, action,
            ...(action === "edit" ? { patch: { name: "Synthetic corrected" } } : {}) })])
        assert.equal(results.every((result) => result.status === "fulfilled"), true)
        const state = await snapshot(f.userId)
        assert.ok(state.converted === 0 || state.converted === 1)
        assert.equal(state.tracked, state.converted)
        assert.equal((await c.query(`SELECT count(*)::int n FROM commitment_events
          WHERE user_id=$1 AND event_type='COMMITMENT_CREATED_FROM_DETECTION'`, [f.userId])).rows[0].n, state.converted)
        if (state.converted === 1) {
          assert.equal((await c.query(`SELECT status FROM commitment_detection_candidates WHERE id=$1`, [f.first])).rows[0].status, "converted")
          assert.equal((await c.query(`SELECT count(*)::int n FROM commitments WHERE user_id=$1 AND source_detection_candidate_id=$2`, [f.userId, f.first])).rows[0].n, 1)
        }
      }
    })

    async function legacyFixture(status = "converted") {
      const f = await fixture(limit)
      const original = (await c.query(`SELECT id FROM commitments WHERE user_id=$1 ORDER BY id LIMIT 1`, [f.userId])).rows[0].id as string
      await c.query(`UPDATE commitment_detection_candidates SET status=$1 WHERE id=$2`, [status, f.first])
      return { ...f, original }
    }
    async function legacyEvent(f: { userId: string; first: string; original: string }, options: {
      target?: string | null; metadata?: object; candidateId?: string | null
    } = {}) {
      await c.query(`INSERT INTO commitment_events (id,user_id,commitment_id,detection_candidate_id,event_type,title,message,metadata)
        VALUES ($1,$2,$3,$4,'COMMITMENT_CREATED_FROM_DETECTION','Synthetic legacy','Synthetic legacy',$5::jsonb)`,
      [randomUUID(), f.userId, options.target === undefined ? f.original : options.target,
        options.candidateId === undefined ? null : options.candidateId,
        JSON.stringify(options.metadata ?? { sourceCandidateId: f.first })])
    }
    async function history(userId: string) {
      return (await c.query(`SELECT jsonb_build_object(
        'commitments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM commitments t WHERE user_id=$1),
        'candidates',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM commitment_detection_candidates t WHERE user_id=$1),
        'events',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM commitment_events t WHERE user_id=$1),
        'settings',(SELECT to_jsonb(t) FROM commit_guard_settings t WHERE user_id=$1),
        'work',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM commit_guard_work_items t WHERE user_id=$1)) data`, [userId])).rows[0].data
    }

    for (const status of ["converted", "confirmed", "pending"]) {
      await t.test(`4.2 unique legacy audit proof (${status}) reconciles only the original at full allowance, without another event`, async () => {
        const f = await legacyFixture(status)
        await legacyEvent(f)
        const before = await snapshot(f.userId)
        const eventsBefore = (await history(f.userId)).events
        const results = await race(f.userId, [() => convert(f.userId, f.first), () => convert(f.userId, f.first)])
        for (const result of results) {
          assert.equal(result.status, "fulfilled")
          assert.deepEqual((result as PromiseFulfilledResult<unknown>).value, { status: "updated", commitmentId: f.original })
        }
        assert.equal((await c.query(`SELECT source_detection_candidate_id FROM commitments WHERE id=$1`, [f.original])).rows[0].source_detection_candidate_id, f.first)
        assert.deepEqual(await convert(f.userId, f.first), { status: "updated", commitmentId: f.original })
        assert.equal((await snapshot(f.userId)).tracked, before.tracked)
        assert.deepEqual(await snapshot(f.userId), { ...before, converted: 1 }, "legacy link reconciliation creates no revision or work")
        assert.deepEqual((await history(f.userId)).events, eventsBefore)
      })
    }

    for (const kind of ["missing", "duplicate", "multiple", "conflicting", "claimed", "malformed", "foreign", "flagged"] as const) {
      await t.test(`4.2 legacy ${kind} proof is typed review-required and leaves history intact`, async () => {
        const f = await legacyFixture()
        if (kind !== "missing") await legacyEvent(f, kind === "malformed" ? { metadata: {}, candidateId: f.first } : {})
        if (kind === "duplicate") await legacyEvent(f)
        if (kind === "multiple") {
          const target = (await c.query(`SELECT id FROM commitments WHERE user_id=$1 AND id<>$2 LIMIT 1`, [f.userId, f.original])).rows[0].id
          await legacyEvent(f, { target })
        }
        if (kind === "conflicting") await c.query(`UPDATE commitments SET source_detection_candidate_id=$1 WHERE id=$2`, [f.second, f.original])
        if (kind === "claimed") await legacyEvent(f, { metadata: { sourceCandidateId: f.second } })
        if (kind === "foreign") {
          const other = await legacyFixture()
          await legacyEvent(f, { target: other.original })
        }
        if (kind === "flagged") await c.query(`UPDATE commitment_detection_candidates SET conversion_review_required=true WHERE id=$1`, [f.first])
        const before = await history(f.userId)
        const result = await convert(f.userId, f.first)
        assert.equal(result.status, "conflict")
        assert.ok("reason" in result && result.reason === "conversion_review_required")
        assert.ok(result.reviewReasons?.length)
        assert.deepEqual(await history(f.userId), before, "no guessed links, backfill flags, deletion or audit writes")
      })
    }

    await t.test("4.2 unique legacy reconciliation rolls back its link and status if candidate write fails", async () => {
      const f = await legacyFixture("confirmed")
      await legacyEvent(f)
      await c.query(`CREATE FUNCTION conversion_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'synthetic conversion candidate failure'; END $$;
        CREATE TRIGGER conversion_fixture_fail BEFORE UPDATE ON commitment_detection_candidates
        FOR EACH ROW EXECUTE FUNCTION conversion_fixture_fail()`)
      const before = await history(f.userId)
      try { await assert.rejects(convert(f.userId, f.first), /synthetic conversion candidate failure/) }
      finally { await c.query(`DROP TRIGGER conversion_fixture_fail ON commitment_detection_candidates; DROP FUNCTION conversion_fixture_fail()`) }
      assert.deepEqual(await history(f.userId), before)
    })

    await t.test("4.2 existing unique and composite FK reject duplicate or cross-tenant conversion links under actual RLS", async () => {
      const a = await fixture(0), b = await fixture(0)
      const { withUserContext } = await import("@/lib/db/withUserContext")
      await convert(a.userId, a.first)
      await assert.rejects(withUserContext(a.userId, async (tx) => tx.commitment.create({ data: {
        userId: a.userId, ...input, sourceDetectionCandidateId: a.first,
      } })), (error: unknown) => error instanceof Error && "code" in error && error.code === "P2002")
      await assert.rejects(withUserContext(a.userId, async (tx) => tx.commitment.create({ data: {
        userId: a.userId, ...input, sourceDetectionCandidateId: b.first,
      } })), (error: unknown) => error instanceof Error && "code" in error && error.code === "P2003")
      assert.equal((await snapshot(a.userId)).tracked, 1)
      assert.equal((await snapshot(b.userId)).tracked, 0)
    })

    for (const pair of ["manual/manual", "manual/convert", "convert/convert"] as const) {
      await t.test(`${pair}: two actual blocked sessions compete for one remaining slot`, async () => {
        const f = await fixture()
        const operations = pair === "manual/manual" ? [() => manual(f.userId), () => manual(f.userId)]
          : pair === "manual/convert" ? [() => manual(f.userId), () => convert(f.userId, f.first)]
            : [() => convert(f.userId, f.first), () => convert(f.userId, f.second)]
        const results = await race(f.userId, operations)
        assert.equal(results.filter((row) => row.status === "fulfilled").length, 1)
        const failure = results.find((row) => row.status === "rejected") as PromiseRejectedResult
        assert.equal(failure.reason.message, "Commitment limit reached")
        const state = await snapshot(f.userId)
        assert.equal(state.tracked, limit)
        assert.equal(state.audit, 1, "one creation/conversion event per successful creation")
        assert.equal(state.converted, pair === "convert/convert" ? 1 : pair === "manual/manual" ? 0 : state.converted)
        assert.equal(state.work, 1)
        assert.equal(state.revision, 8)
        await evaluations(f.userId, [8])
        if (pair !== "manual/manual") {
          assert.equal((await c.query(`SELECT count(*)::int n FROM commitment_detection_candidates
            WHERE user_id=$1 AND status='pending'`, [f.userId])).rows[0].n, 2 - state.converted)
        }
      })
    }

    await t.test("cancelled unarchived rows consume slots; archived active/cancelled rows do not", async () => {
      for (const operation of ["manual", "convert"] as const) {
        const f = await fixture(limit, "cancelled")
        const act = () => operation === "manual" ? manual(f.userId) : convert(f.userId, f.first)
        const before = await snapshot(f.userId)
        await assert.rejects(act(), /Commitment limit reached/)
        assert.deepEqual(await snapshot(f.userId), before)
        await c.query(`UPDATE commitments SET archived_at=$1 WHERE id=(SELECT id FROM commitments WHERE user_id=$2 LIMIT 1)`, [now, f.userId])
        await c.query(`INSERT INTO commitments (id,user_id,name,category,amount_cents,currency,frequency,status,archived_at,updated_at)
          VALUES ($1,$2,'Synthetic archived','other',1000,'aud','monthly','active',$3,$3)`, [randomUUID(), f.userId, now])
        await act()
        assert.equal((await snapshot(f.userId)).tracked, limit)
      }
    })

    await t.test("tenant B completes while tenant A is actually blocked; RLS rejects foreign candidate", async () => {
      const a = await fixture(), b = await fixture()
      await gate(a.userId)
      const pending = Promise.allSettled([manual(a.userId)])
      try {
        await blocked(1)
        await convert(b.userId, b.first)
        assert.equal((await snapshot(b.userId)).tracked, limit)
        assert.equal((await snapshot(a.userId)).tracked, limit - 1)
        assert.deepEqual(await convert(b.userId, a.first), { status: "not_found" })
      } finally { await c.query("ROLLBACK") }
      assert.equal((await pending)[0].status, "fulfilled")
    })

    async function lifecycleFixture(status = "active", confidence = "high") {
      const f = await fixture(1, status)
      const id = (await c.query(`SELECT id FROM commitments WHERE user_id=$1`, [f.userId])).rows[0].id as string
      await c.query(`UPDATE commitments SET confidence=$1, paused_at=CASE WHEN status='paused' THEN $2::timestamp ELSE NULL END,
        cancelled_at=CASE WHEN status='cancelled' THEN $2::timestamp ELSE NULL END WHERE id=$3`, [confidence, now, id])
      return { ...f, id }
    }
    const transition = (f: { userId: string; id: string }, action: "pause" | "resume" | "cancel" | "confirm") =>
      transitionCommitment(f.userId, f.id, action, f.userId)
    const stored = async (id: string) => (await c.query(`SELECT to_jsonb(t) data FROM commitments t WHERE id=$1`, [id])).rows[0].data

    await t.test("4.3 actual RLS service matrix covers every source/action/confidence including no-op timestamps", async () => {
      const eligible = ["active", "upcoming", "ending", "review"]
      for (const status of [...eligible, "paused", "cancelled", "expired"]) {
        for (const action of ["pause", "resume", "cancel", "confirm"] as const) for (const confidence of ["high", "confirmed"]) {
          const f = await lifecycleFixture(status, confidence), before = await stored(f.id)
          const valid = action === "pause" ? eligible.includes(status) || status === "paused"
            : action === "resume" ? status === "paused"
              : action === "cancel" ? status !== "expired" : eligible.includes(status)
          const noop = action === "pause" && status === "paused" || action === "cancel" && status === "cancelled"
            || action === "confirm" && confidence === "confirmed"
          if (!valid) {
            await assert.rejects(transition(f, action), CommitmentMutationConflict)
            assert.deepEqual(await stored(f.id), before)
          } else {
            const result = await transition(f, action)
            assert.ok(result)
            assert.equal(result.audit === null, noop)
            if (noop) assert.deepEqual(await stored(f.id), before)
            else {
              assert.equal(result.commitment.status, action === "confirm" ? status
                : action === "pause" ? "paused" : action === "resume" ? "active" : "cancelled")
              const after = await stored(f.id)
              if (action === "confirm") {
                assert.equal(after.confidence, "confirmed")
                assert.equal(after.paused_at, before.paused_at); assert.equal(after.cancelled_at, before.cancelled_at)
              }
              if (action === "pause") assert.ok(after.paused_at)
              if (action === "resume") assert.equal(after.paused_at, null)
              if (action === "cancel") assert.ok(after.cancelled_at)
            }
          }
          const changed = valid && !noop
          assert.deepEqual(await snapshot(f.userId), { tracked: 1, converted: 0, audit: changed ? 1 : 0, revision: changed ? 8 : 7, work: changed ? 1 : 0 })
          await evaluations(f.userId, changed ? [8] : [])
        }
      }
    })

    await t.test("4.3 actual blocked duplicate lifecycle/PATCH sessions emit one audit; resume retry conflicts", async () => {
      for (const action of ["pause", "cancel", "confirm", "resume", "patch"] as const) {
        const f = await lifecycleFixture(action === "resume" ? "paused" : "active")
        const run = () => action === "patch" ? updateCommitment(f.userId, f.id, { notes: "Synthetic review" }) : transition(f, action)
        const results = await race(f.userId, [run, run])
        assert.equal(results.filter((result) => result.status === "fulfilled").length, action === "resume" ? 1 : 2)
        if (action === "resume") {
          const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult
          assert.ok(failed.reason instanceof CommitmentMutationConflict)
        }
        assert.equal((await snapshot(f.userId)).audit, 1)
        assert.equal((await snapshot(f.userId)).revision, 8); assert.equal((await snapshot(f.userId)).work, 1)
        await evaluations(f.userId, [8])
      }
    })

    await t.test("4.3 actual row-lock wait re-reads a competing terminal status before action or PATCH", async () => {
      for (const kind of ["action", "patch"] as const) {
        const f = await lifecycleFixture()
        await c.query("BEGIN")
        await c.query(`SELECT id FROM commitments WHERE id=$1 FOR UPDATE`, [f.id])
        const pending = Promise.allSettled([kind === "action" ? transition(f, "pause")
          : updateCommitment(f.userId, f.id, { notes: "Must not change archive" })])
        try {
          const deadline = Date.now() + 4000
          let waiting = false
          do {
            const result = await c.query(`SELECT EXISTS(SELECT 1 FROM pg_locks l
              WHERE l.database=(SELECT oid FROM pg_database WHERE datname=$1) AND l.locktype='advisory' AND l.granted
              AND EXISTS(SELECT 1 FROM pg_locks w WHERE w.pid=l.pid AND NOT w.granted)) waiting`, [clone])
            waiting = result.rows[0].waiting
            if (waiting) break
          } while (Date.now() < deadline)
          assert.equal(waiting, true, "service holds tenant lock and actually waits on commitment row")
          if (kind === "action") await c.query(`UPDATE commitments SET status='cancelled',cancelled_at=$1 WHERE id=$2`, [now, f.id])
          else await c.query(`UPDATE commitments SET archived_at=$1 WHERE id=$2`, [now, f.id])
          await c.query("COMMIT")
        } finally { await c.query("ROLLBACK"); await pending }
        const [result] = await pending
        assert.equal(result.status, "rejected")
        assert.ok((result as PromiseRejectedResult).reason instanceof CommitmentMutationConflict)
        assert.equal((await snapshot(f.userId)).audit, 0)
        assert.equal((await stored(f.id)).notes, null)
      }
    })

    await t.test("4.3 actual PATCH audit records dates/recurrence/renewal/confidence/essentiality; no-op and terminal edit boundaries", async () => {
      const f = await lifecycleFixture("cancelled")
      await c.query(`UPDATE commitments SET frequency='custom',recurrence_rule='{"legacy":true}' WHERE id=$1`, [f.id])
      await updateCommitment(f.userId, f.id, { notes: "Synthetic legacy review" })
      assert.deepEqual((await stored(f.id)).recurrence_rule, { legacy: true })
      const patch = { nextDueDate: new Date("2026-11-01Z"), startDate: new Date("2026-10-01Z"),
        endDate: new Date("2027-01-01Z"), frequency: "annual", recurrenceRule: null,
        renewalDate: new Date("2027-01-01Z"), noticePeriodDays: 30, autoRenew: true,
        confidence: "confirmed", essentiality: "critical" }
      await updateCommitment(f.userId, f.id, patch)
      const event = (await c.query(`SELECT metadata FROM commitment_events WHERE user_id=$1 AND metadata->'changedFields' ? 'frequency'`, [f.userId])).rows[0]
      assert.deepEqual(Object.keys(event.metadata.changedFields).sort(), Object.keys(patch).sort())
      assert.deepEqual(event.metadata.changedFields.recurrenceRule, { before: { legacy: true }, after: null })
      assert.deepEqual(event.metadata.changedFields.nextDueDate, { before: null, after: patch.nextDueDate.toISOString() })
      const before = await stored(f.id), historyBefore = await history(f.userId)
      assert.equal((await updateCommitment(f.userId, f.id, patch))?.audit, null)
      assert.deepEqual(await stored(f.id), before); assert.deepEqual(await history(f.userId), historyBefore)
      await assert.rejects(updateCommitment(f.userId, f.id, { status: "active" }))
      assert.deepEqual(await stored(f.id), before)
      await c.query(`UPDATE commitments SET status='expired' WHERE id=$1`, [f.id])
      await updateCommitment(f.userId, f.id, { description: "Synthetic terminal correction" })
      assert.equal((await stored(f.id)).status, "expired")
      await c.query(`UPDATE commitments SET archived_at=$1 WHERE id=$2`, [now, f.id])
      for (const action of ["pause", "resume", "cancel", "confirm"] as const) await assert.rejects(transition(f, action), CommitmentMutationConflict)
      await assert.rejects(updateCommitment(f.userId, f.id, {}), CommitmentMutationConflict)
    })

    await t.test("4.3 actual RLS prevents foreign mutation; separate tenants proceed; audit failure rolls back action and PATCH", async () => {
      const a = await lifecycleFixture(), b = await lifecycleFixture()
      const before = await history(a.userId)
      assert.equal(await transitionCommitment(b.userId, a.id, "cancel"), null)
      assert.equal(await updateCommitment(b.userId, a.id, { notes: "Foreign" }), null)
      assert.deepEqual(await history(a.userId), before)
      await gate(a.userId)
      const pending = Promise.allSettled([transition(a, "pause")])
      try { await blocked(1); await transition(b, "confirm"); assert.equal((await snapshot(b.userId)).audit, 1) }
      finally { await c.query("ROLLBACK"); await pending }
      for (const run of [() => transition(a, "cancel"), () => updateCommitment(a.userId, a.id, { notes: "Rollback" })]) {
        const before = await history(a.userId)
        failAudit = true
        try { await assert.rejects(run(), /synthetic creation audit failure/) } finally { failAudit = false }
        assert.deepEqual(await history(a.userId), before)
        assert.equal((await snapshot(a.userId)).revision, 8); assert.equal((await snapshot(a.userId)).work, 1)
      }
      for (const run of [() => transition(b, "pause"), () => updateCommitment(b.userId, b.id, { notes: "Revoked" })]) {
        const before = await history(b.userId)
        await gate(b.userId)
        const pending = Promise.allSettled([run()])
        try { await blocked(1); tiers.set(b.userId, null) } finally { await c.query("ROLLBACK"); await pending }
        assert.equal((await pending)[0].status, "rejected")
        assert.deepEqual(await history(b.userId), before)
        tiers.set(b.userId, "business_control")
      }
    })

    for (const kind of ["manual", "convert"] as const) {
      await t.test(`${kind}: refresh access and plan after lock wait; audit failure rolls back all writes`, async () => {
        const f = await fixture()
        const act = () => kind === "manual" ? manual(f.userId) : convert(f.userId, f.first)
        const before = await snapshot(f.userId)
        for (const tier of ["essentials", null] as const) {
          await gate(f.userId)
          const pending = Promise.allSettled([act()])
          try { await blocked(1); tiers.set(f.userId, tier) }
          finally { await c.query("ROLLBACK") }
          const [result] = await pending
          assert.equal(result.status, "rejected")
          assert.equal((result as PromiseRejectedResult).reason.message,
            tier === "essentials" && kind === "manual" ? "Commitment limit reached" : "Upgrade required")
          assert.deepEqual(await snapshot(f.userId), before)
          tiers.set(f.userId, "business_control")
        }
        failAudit = true
        try { await assert.rejects(act(), (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.match(error.message, /synthetic creation audit failure/)
          return true
        }) } finally { failAudit = false }
        assert.deepEqual(await snapshot(f.userId), before)
        await act()
        assert.equal((await snapshot(f.userId)).tracked, limit)
      })
    }

    for (const kind of ["manual", "convert", "patch", "pause", "resume", "cancel", "confirm", "settings"] as const) {
      for (const failure of ["revision", "work", "audit"] as const) {
        if (kind === "settings" && failure === "audit") continue // Policy writes have no lifecycle audit.
        await t.test(`4.4 ${kind}: actual ${failure} failure leaves no mutation, revision, audit or orphan work`, async () => {
          const f = await lifecycleFixture(kind === "resume" ? "paused" : "active")
          const run = () => kind === "manual" ? manual(f.userId) : kind === "convert" ? convert(f.userId, f.first)
            : kind === "patch" ? updateCommitment(f.userId, f.id, { amountCents: 11000, notes: "Synthetic rollback" })
              : kind === "settings" ? saveCommitGuardSettings(f.userId, { safetyBufferFixedCents: 3000, safetyBufferCurrency: "aud" })
                : transition(f, kind)
          const before = await history(f.userId)
          failRevision = failure === "revision"; failWork = failure === "work"; failAudit = failure === "audit"
          try { await assert.rejects(run(), failure === "audit" ? /synthetic creation audit failure/ : new RegExp(`synthetic ${failure} failure`)) }
          finally { failRevision = false; failWork = false; failAudit = false }
          assert.deepEqual(await history(f.userId), before)
          assert.equal((await snapshot(f.userId)).revision, 7); await evaluations(f.userId, [])
          await run()
          assert.equal((await snapshot(f.userId)).revision, 8); await evaluations(f.userId, [8])
        })
      }
    }

    await t.test("4.4 candidate review changes no calculation revision/work until conversion", async () => {
      const f = await fixture(0)
      for (const action of ["ignore", "edit", "not_a_commitment", "edit"] as const) {
        await reviewDetectedCommitmentCandidate({ userId: f.userId, candidateId: f.first, action,
          ...(action === "edit" ? { patch: { typicalAmountCents: 2000, frequency: "annual" } } : {}) })
        assert.equal((await snapshot(f.userId)).revision, 7); await evaluations(f.userId, [])
      }
      await convert(f.userId, f.first)
      assert.equal((await snapshot(f.userId)).revision, 8); await evaluations(f.userId, [8])
    })

    await t.test("4.4 settings retries preserve updatedAt; settings/create/lifecycle serialize distinct revisions", async () => {
      const f = await lifecycleFixture()
      const settingsBefore = (await history(f.userId)).settings
      await saveCommitGuardSettings(f.userId, {})
      await saveCommitGuardSettings(f.userId, { defaultHorizonDays: 30 })
      assert.deepEqual((await history(f.userId)).settings, settingsBefore)
      await gate(f.userId)
      const results = Promise.allSettled([manual(f.userId), transition(f, "pause"),
        saveCommitGuardSettings(f.userId, { safetyBufferFixedCents: 2000, safetyBufferCurrency: "aud" })])
      try { await blocked(3) } finally { await c.query("ROLLBACK"); await results }
      assert.equal((await results).every((result) => result.status === "fulfilled"), true)
      assert.equal((await snapshot(f.userId)).revision, 10); await evaluations(f.userId, [8, 9, 10])
      const beforeRetry = await history(f.userId)
      await saveCommitGuardSettings(f.userId, { safetyBufferFixedCents: 2000, safetyBufferCurrency: "aud" })
      assert.deepEqual(await history(f.userId), beforeRetry)
    })

    await t.test("4.4 absent settings initializes revision 1, and duplicate work collisions roll back rather than suppress", async () => {
      const f = await lifecycleFixture()
      await c.query(`DELETE FROM commit_guard_settings WHERE user_id=$1`, [f.userId])
      await transition(f, "pause")
      assert.equal((await snapshot(f.userId)).revision, 1); await evaluations(f.userId, [1])
      await c.query(`INSERT INTO commit_guard_work_items (id,user_id,kind,dedupe_key,source_kind,calculation_revision,updated_at)
        VALUES ($1,$2,'evaluate','evaluation:2','mutation',2,$3)`, [randomUUID(), f.userId, now])
      const before = await history(f.userId)
      await assert.rejects(transition(f, "resume"), (error: unknown) => {
        assert.ok(error instanceof Error); assert.match(error.message, /23505|unique constraint|duplicate key/i); return true
      })
      assert.deepEqual(await history(f.userId), before)
    })
  } finally {
    mock.restoreAll()
    await prisma?.$disconnect()
    if (client) { await client.query("ROLLBACK"); await client.end() }
    if (created) await control.query(`DROP DATABASE ${quote(clone)}`)
    await control.end()
    assert.deepEqual(await baseline(), original,
      "source data/schema/ACLs/trial/billing objects, roles, memberships and database inventory unchanged; clone removed")
  }
})