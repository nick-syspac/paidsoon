/** Task 3.6 only. Run with Node's module-mocks + tsx flags, outside tests/**.
 * No env loader, application URL resolver or external APIs. Guard the exact
 * authorized Unix socket before creating a dedicated disposable fixture DB.
 * The template DB is never mutated. Fixture setup commits ONLY in the clone to
 * allow competing real service transactions; failed services roll back, and the
 * complete clone is dropped in finally. No role creation or service restarts.
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
  options: "-c search_path=public -c statement_timeout=10000 -c lock_timeout=5000" }
const clone = `commitguard_cov_${randomUUID().replaceAll("-", "")}`
const now = new Date("2026-10-19T12:00:00Z")
const date = "2026-10-19"
const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`
async function identity(client: pg.Client, database: string): Promise<void> {
  assert.deepEqual((await client.query(`SELECT current_database() database, current_user role,
    inet_server_addr() tcp, current_setting('unix_socket_directories') socket,
    current_setting('port') port, current_setting('listen_addresses') listen`)).rows[0], {
    database, role: "syspac", tcp: null, socket: config.host, port: "55437", listen: "",
  })
}
async function baseline(): Promise<unknown> {
  const client = new pg.Client(config)
  await client.connect()
  try {
    await identity(client, "commitguard")
    return (await client.query(`SELECT jsonb_build_object(
      'relations', (SELECT jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relacl,c.relrowsecurity) ORDER BY c.oid)
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
      'columns', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a
        JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
      'constraints', (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k),
      'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p),
      'roles', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),
      'memberships', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.oid) FROM pg_auth_members m),
      'databases', (SELECT jsonb_agg(jsonb_build_array(d.datname,d.datacl) ORDER BY d.datname) FROM pg_database d)
    ) snapshot`)).rows[0].snapshot
  } finally { await client.end() }
}

test("task 3.6 real services and concurrent storage, authorized scratch clone only", async (t) => {
  const original = await baseline()
  const control = new pg.Client({ ...config, database: "postgres" })
  let created = false
  let client: pg.Client | undefined
  let prisma: PrismaClient | undefined
  let workFailure = false
  let auditFailure = false
  let barrier: { arrived: number; pids: Set<number>; ready: Promise<void>; release: () => void } | null = null
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
      assert.equal((await c.query(`SELECT count(*)::int n FROM pg_constraint WHERE conname LIKE 'commitguard_%'`)).rows[0].n, 23)
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
      // Local legacy RLS fixtures ONLY for financial tables this service uses.
      // These are test setup, not deployment SQL, and disappear with the clone.
      for (const table of ["commitments", "commit_guard_settings", "commitment_events", "imported_bills",
        "accounting_connections", "tax_reserve_categories", "tax_buffer_configurations", "tax_buffer_overrides", "tax_buffer_obligations"]) {
        const owner = table === "accounting_connections" ? '"userId"' : "user_id"
        const grants = canonical.match(new RegExp(`^GRANT [^\\n]+ ON TABLE ${table} TO authenticated;`, "m"))
        assert.ok(grants, `missing canonical legacy grants: ${table}`)
        await c.query(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY;
          REVOKE ALL ON public.${quote(table)} FROM authenticated, anon;
          ${grants[0]}
          CREATE POLICY coverage_fixture_select ON public.${quote(table)} FOR SELECT TO authenticated
            USING ((SELECT auth.uid())::text = ${owner})`)
        if (["commit_guard_settings", "commitment_events"].includes(table)) {
          await c.query(`CREATE POLICY coverage_fixture_insert ON public.${quote(table)} FOR INSERT TO authenticated
              WITH CHECK ((SELECT auth.uid())::text = ${owner});
            CREATE POLICY coverage_fixture_update ON public.${quote(table)} FOR UPDATE TO authenticated
              USING ((SELECT auth.uid())::text = ${owner}) WITH CHECK ((SELECT auth.uid())::text = ${owner})`)
        }
      }
      // An explicit failpoint proves the real mutation, settings increment and
      // work INSERT all roll back if the final audit fails. Clone-only DDL.
      await c.query(`CREATE FUNCTION coverage_fixture_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF current_setting('coverage_fixture.fail_audit', true) = 'yes' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER coverage_fixture_audit_fail BEFORE INSERT ON public.commitment_events
          FOR EACH ROW EXECUTE FUNCTION coverage_fixture_audit_fail();
        CREATE FUNCTION coverage_fixture_work_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF current_setting('coverage_fixture.fail_work', true) = 'yes' THEN RAISE EXCEPTION 'synthetic work failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER coverage_fixture_work_fail BEFORE INSERT ON public.commit_guard_work_items
          FOR EACH ROW EXECUTE FUNCTION coverage_fixture_work_fail()`)
      await c.query("COMMIT")
    } catch (error) { await c.query("ROLLBACK"); throw error }

    prisma = new PrismaClient({ adapter: new PrismaPg({ ...config, database: clone, max: 8 }) })
    const database = prisma
    // Swap only the connection factory and billing boundary. Actual services,
    // Prisma adapter, withUserContext, RLS, tenant locks and D2 are NOT mocked.
    const executor = {
      $transaction: async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { maxWait?: number; timeout?: number }) =>
        database.$transaction(async (tx) => {
          // Session-local failpoints inside the real transaction, never a
          // transaction double. Prisma's proxy methods cannot be mock.method'ed.
          await tx.$executeRaw`SELECT set_config('coverage_fixture.fail_work', ${workFailure ? "yes" : "no"}, true),
            set_config('coverage_fixture.fail_audit', ${auditFailure ? "yes" : "no"}, true)`
          if (barrier) {
            const current = barrier
            const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
            current.pids.add(row.pid)
            if (++current.arrived === 2) current.release()
            await current.ready
          }
          return fn(tx)
        }, options),
    }
    await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: executor } })
    await mock.module("@/lib/billing", { namedExports: { requireFeature: async () => true } })
    const { mutateCommitGuardCoverage: mutate, listCommitGuardCoverage: list,
      loadCommitGuardCoverageReconciliation: reconcile } = await import("@/lib/commitguard/coverageService")
    const { saveCommitGuardCashContext: saveCash } = await import("@/lib/commitguard/cashContextMutation")
    async function race(operations: Array<() => Promise<unknown>>): Promise<PromiseSettledResult<unknown>[]> {
      let release!: () => void
      const ready = new Promise<void>((resolve) => { release = resolve })
      barrier = { arrived: 0, pids: new Set(), ready, release }
      try {
        const results = await Promise.allSettled(operations.map((operation) => operation()))
        assert.equal(barrier.pids.size, 2, "two simultaneous real PostgreSQL sessions crossed the start barrier")
        return results
      } finally { barrier = null }
    }
    const insert = async (table: string, data: Record<string, unknown>): Promise<void> => {
      const entries = Object.entries(data)
      await c.query(`INSERT INTO public.${quote(table)} (${entries.map(([key]) => quote(key)).join(",")})
        VALUES (${entries.map((_, i) => `$${i + 1}`).join(",")})`, entries.map(([, value]) => value))
    }
    async function fixture() {
      const userId = randomUUID(), commitmentId = randomUUID(), taxId = randomUUID(), secondTaxId = randomUUID(), billId = randomUUID(), connectionId = randomUUID()
      await insert("user_profiles", { id: randomUUID(), userId, updatedAt: now })
      await insert("commitments", { id: commitmentId, user_id: userId, name: "Synthetic coverage", category: "tax", amount_cents: 10000,
        currency: "aud", frequency: "one_off", next_due_date: date, updated_at: now })
      await insert("commit_guard_cash_contexts", { id: randomUUID(), user_id: userId, tax_protection_currency: "aud", updated_at: now })
      await insert("tax_buffer_configurations", { id: randomUUID(), user_id: userId, enabled: true, updated_at: now })
      for (const id of [taxId, secondTaxId]) await insert("tax_reserve_categories", { id, user_id: userId, category_type: "custom", name: "Synthetic tax",
        calculation_method: "manual", manual_amount_cents: id === taxId ? 12000 : 0, updated_at: now })
      await insert("accounting_connections", { id: connectionId, userId, provider: "xero", organisation_id: randomUUID(), organisation_name: "Synthetic",
        encrypted_access_token: "unused-synthetic", encrypted_refresh_token: "unused-synthetic", token_expires_at: now, scopes: "unused", updated_at: now })
      await insert("imported_bills", { id: billId, user_id: userId, accounting_connection_id: connectionId, source_id: randomUUID(), supplier_name: "Synthetic",
        amount_cents: 10000, currency: "aud", raw_source_data: { AmountDue: 100 }, updated_at: now })
      await insert("tax_buffer_obligations", { id: randomUUID(), user_id: userId, reserve_category_id: taxId, name: "Synthetic attribution", due_date: date,
        estimated_amount_cents: 10000, source: "manual", imported_bill_id: billId, updated_at: now })
      return { userId, commitmentId, taxId, secondTaxId, billId }
    }
    type Fixture = Awaited<ReturnType<typeof fixture>>
    const input = (f: Fixture, amount = 10000) => ({ commitmentId: f.commitmentId, occurrenceDate: date, currency: "aud" as const,
      coveredCents: amount, target: { kind: "tax_reserve_category" as const, id: f.taxId } })
    const snapshot = async (userId: string) => (await c.query(`SELECT
      (SELECT count(*)::int FROM commitment_coverages WHERE user_id=$1) coverage,
      (SELECT calculation_revision FROM commit_guard_settings WHERE user_id=$1) revision,
      (SELECT count(*)::int FROM commit_guard_work_items WHERE user_id=$1) work,
      (SELECT count(*)::int FROM commitment_events WHERE user_id=$1) audit`, [userId])).rows[0]
    const ledger = (f: Fixture) => reconcile(f.userId, new Date(`${date}Z`), new Date("2026-11-18Z"), now)

    await t.test("real RLS CRUD, safe DTO, tenant isolation, read-only integration and R=12000/C=10000", async () => {
      const f = await fixture(), other = await fixture()
      const row = (await mutate(f.userId, { kind: "create", input: input(f) }, now))!
      assert.equal("userId" in row, false)
      assert.deepEqual(await snapshot(f.userId), { coverage: 1, revision: 1, work: 1, audit: 1 })
      const before = await snapshot(f.userId)
      const result = await ledger(f)
      assert.equal(result.quality.state, "complete")
      assert.equal(result.groups[0].committedCents, 10000)
      assert.equal(result.groups[0].combinedProtectionCents, 12000)
      assert.deepEqual(await snapshot(f.userId), before)
      assert.deepEqual(await list(other.userId, now), [])
      await assert.rejects(mutate(other.userId, { kind: "delete", id: row.id }, now), { status: 404 })
      await assert.rejects(mutate(other.userId, { kind: "create", input: input(f) }, now), { status: 404 })
      await assert.rejects(mutate(f.userId, { kind: "create", input: { ...input(f, 1), target: { kind: "tax_reserve_category", id: other.taxId } } }, now), { status: 404 })
      await assert.rejects(mutate(f.userId, { kind: "create", input: { ...input(f, 1), target: { kind: "imported_bill", id: other.billId } } }, now), { status: 404 })
      await mutate(f.userId, { kind: "update", id: row.id, input: input(f, 9000) }, now)
      const changed = await snapshot(f.userId)
      await mutate(f.userId, { kind: "update", id: row.id, input: input(f, 9000) }, now)
      assert.deepEqual(await snapshot(f.userId), changed)
      await mutate(f.userId, { kind: "delete", id: row.id }, now)
      assert.deepEqual(await snapshot(f.userId), { coverage: 0, revision: 3, work: 3, audit: 3 })
    })

    await t.test("actual category aggregates 12000 and 15000, with no category reserve cap", async () => {
      for (const amount of [6000, 7500]) {
        const f = await fixture()
        await c.query("UPDATE commitments SET amount_cents=$1, frequency='weekly' WHERE id=$2", [amount, f.commitmentId])
        await mutate(f.userId, { kind: "create", input: input(f, amount) }, now)
        await mutate(f.userId, { kind: "create", input: { ...input(f, amount), occurrenceDate: "2026-10-26" } }, now)
        const result = await reconcile(f.userId, new Date(`${date}Z`), new Date("2026-10-27Z"), now)
        assert.equal(result.quality.state, "complete")
        assert.equal(result.groups[0].combinedProtectionCents, amount * 2)
        assert.equal(result.groups[0].committedCents, amount * 2)
      }
    })

    await t.test("actual disjoint bill/tax coverage caps at occurrence; paid or disabled targets have no overlap effect", async () => {
      const f = await fixture()
      const bill = { ...input(f, 6000), target: { kind: "imported_bill" as const, id: f.billId } }
      await mutate(f.userId, { kind: "create", input: bill }, now)
      await assert.rejects(mutate(f.userId, { kind: "create", input: input(f, 5000) }, now), { status: 409, reason: "coverage_occurrence_cap" })
      await mutate(f.userId, { kind: "create", input: input(f, 4000) }, now)
      assert.equal((await ledger(f)).groups[0].combinedProtectionCents, 12000)
      await c.query("UPDATE imported_bills SET status='paid' WHERE id=$1", [f.billId])
      let result = await ledger(f)
      assert.equal(result.quality.state, "incomplete")
      assert.equal(result.groups[0].overlapAdjustmentCents, 4000)
      assert.equal(result.groups[0].committedCents, 10000)
      await c.query("UPDATE tax_reserve_categories SET enabled=false WHERE id=$1", [f.taxId])
      result = await ledger(f)
      assert.equal(result.quality.state, "incomplete")
      assert.equal(result.groups[0].overlapAdjustmentCents, 0)
      for (const row of await list(f.userId, now)) await mutate(f.userId, { kind: "delete", id: row.id }, now)
    })

    await t.test("competing real transactions reject occurrence over-coverage and duplicate target races", async () => {
      for (const duplicate of [false, true]) {
        const f = await fixture()
        const results = await race([
          () => mutate(f.userId, { kind: "create", input: input(f, 6000) }, now),
          () => mutate(f.userId, { kind: "create", input: { ...input(f, duplicate ? 1 : 6000),
            target: { kind: "tax_reserve_category", id: duplicate ? f.taxId : f.secondTaxId } } }, now),
        ])
        assert.equal(results.filter((row) => row.status === "fulfilled").length, 1)
        const rejected = results.find((row) => row.status === "rejected") as PromiseRejectedResult
        assert.equal(rejected.reason.status, 409)
        assert.deepEqual(await snapshot(f.userId), { coverage: 1, revision: 1, work: 1, audit: 1 })
      }
    })

    await t.test("bill unpaid cap spans commitments/dates and serializes concurrent allocations", async () => {
      const f = await fixture()
      const second = randomUUID()
      await c.query(`INSERT INTO commitments (id,user_id,name,category,amount_cents,currency,frequency,next_due_date,updated_at)
        SELECT $1,user_id,name,category,amount_cents,currency,frequency,next_due_date,updated_at FROM commitments WHERE id=$2`, [second, f.commitmentId])
      const target = { kind: "imported_bill" as const, id: f.billId }
      const results = await race([() => mutate(f.userId, { kind: "create", input: { ...input(f, 6000), target } }, now),
        () => mutate(f.userId, { kind: "create", input: { ...input(f, 6000), commitmentId: second, target } }, now)])
      assert.equal(results.filter((row) => row.status === "fulfilled").length, 1)
      assert.equal((results.find((row) => row.status === "rejected") as PromiseRejectedResult).reason.reason, "coverage_bill_cap")
      assert.deepEqual(await snapshot(f.userId), { coverage: 1, revision: 1, work: 1, audit: 1 })
    })

    await t.test("work/audit failpoints roll back coverage, revision, pending work and audit atomically", async () => {
      for (const stage of ["work", "audit"]) {
        const f = await fixture()
        const before = await snapshot(f.userId)
        workFailure = stage === "work"; auditFailure = stage === "audit"
        try { await assert.rejects(mutate(f.userId, { kind: "create", input: input(f) }, now), (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.match(error.message, new RegExp(`synthetic ${stage} failure`))
          return true
        }) }
        finally { workFailure = false; auditFailure = false }
        assert.deepEqual(await snapshot(f.userId), before)
        const row = (await mutate(f.userId, { kind: "create", input: input(f) }, now))!
        const saved = await snapshot(f.userId)
        for (const operation of [
          { kind: "update" as const, id: row.id, input: input(f, 9000) },
          { kind: "delete" as const, id: row.id },
        ]) {
          workFailure = stage === "work"; auditFailure = stage === "audit"
          try { await assert.rejects(mutate(f.userId, operation, now), (error: unknown) => {
            assert.ok(error instanceof Error); assert.match(error.message, new RegExp(`synthetic ${stage} failure`)); return true
          }) }
          finally { workFailure = false; auditFailure = false }
          assert.deepEqual(await snapshot(f.userId), saved)
          assert.equal((await list(f.userId, now))[0].coveredCents, 10000)
        }
      }
    })

    await t.test("coverage and cash mutations share the tenant lock and preserve both evaluation revisions", async () => {
      const f = await fixture()
      const results = await race([
        () => mutate(f.userId, { kind: "create", input: input(f) }, now),
        () => saveCash(f.userId, { expectedRevision: 0, amountCents: 50000, currency: "aud", balanceAsOf: date }, now),
      ])
      assert.ok(results.every((row) => row.status === "fulfilled"))
      assert.deepEqual(await snapshot(f.userId), { coverage: 1, revision: 2, work: 2, audit: 2 })
    })

    await t.test("source row changes reject exact-date/currency/stale balance; restrict deletion cannot erase coverage", async () => {
      const f = await fixture()
      await assert.rejects(mutate(f.userId, { kind: "create", input: { ...input(f), occurrenceDate: "2026-10-20" } }, now), { status: 409 })
      await assert.rejects(mutate(f.userId, { kind: "create", input: { ...input(f), currency: "usd" } }, now), { status: 409 })
      await c.query("UPDATE imported_bills SET raw_source_data='{}'::jsonb WHERE id=$1", [f.billId])
      await assert.rejects(mutate(f.userId, { kind: "create", input: { ...input(f), target: { kind: "imported_bill", id: f.billId } } }, now), { status: 409 })
      const row = (await mutate(f.userId, { kind: "create", input: input(f) }, now))!
      await assert.rejects(c.query("DELETE FROM tax_reserve_categories WHERE id=$1", [f.taxId]), { code: "23503" })
      await c.query("UPDATE commitments SET next_due_date='2026-10-20' WHERE id=$1", [f.commitmentId])
      const result = await ledger(f)
      assert.equal(result.quality.state, "incomplete")
      assert.equal(result.groups[0].overlapAdjustmentCents, 0)
      assert.ok((await list(f.userId, now))[0].reviewReasons.includes("coverage_occurrence_stale"))
      await mutate(f.userId, { kind: "delete", id: row.id }, now)
    })
  } finally {
    mock.restoreAll()
    await prisma?.$disconnect()
    await client?.end()
    if (created) await control.query(`DROP DATABASE ${quote(clone)}`)
    await control.end()
    assert.deepEqual(await baseline(), original, "template DB schema/ACLs, trial/billing objects, roles and DB inventory unchanged")
  }
})