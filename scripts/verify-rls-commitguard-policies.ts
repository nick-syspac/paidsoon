/**
 * Task 1.4 integration probe (outside tests/**):
 * node --import tsx --test scripts/verify-rls-commitguard-policies.ts
 *
 * Explicit reviewed socket only; NO env loader, application/config imports or
 * pg connection defaults. Applies ONLY the targeted policy artifact, twice,
 * inside a rollback transaction. Synthetic fixtures, missing local Supabase
 * scaffolding and legacy policy test setup also roll back. Nothing is deployed.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { commitGuardVerificationCloneName, openCommitGuardVerificationClone } from "@/scripts/_commitGuardVerificationClone";

const database = commitGuardVerificationCloneName();
const client = new pg.Client({
  host: "/tmp/paidsoon-commitguard-pg.i62Iri",
  port: 55437,
  database,
  user: "syspac",
  password: () => "", // Avoid pg's empty-string fallback to PGPASSWORD.
  ssl: false,
  options: "-c search_path=public -c statement_timeout=10000 -c lock_timeout=3000",
  connectionTimeoutMillis: 3000,
  application_name: "commitguard-policies-isolated-verification",
});
const tables = ["commit_guard_cash_contexts", "commitment_coverages",
  "commit_guard_work_items", "commit_guard_evaluation_states"];
const date = "2026-10-18";
const timestamp = "2026-10-18 12:00:00";
type Row = Record<string, string | number | null>;
const tenants = [0, 1].map(() => ({
  user: randomUUID(), cash: randomUUID(), coverage: randomUUID(), taxCoverage: randomUUID(),
  commitment: randomUUID(), candidate: randomUUID(), bill: randomUUID(), tax: randomUUID(),
  connection: randomUUID(), work: randomUUID(), evaluation: randomUUID(),
}));
type Tenant = (typeof tenants)[number];
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

// Table/column names below are source-controlled, never external input.
async function insert(table: string, row: Row, returning = "id"): Promise<pg.QueryResult> {
  const entries = Object.entries(row);
  return client.query(`INSERT INTO public.${quote(table)}
    (${entries.map(([key]) => quote(key)).join(", ")})
    VALUES (${entries.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING ${returning}`,
  entries.map(([, value]) => value));
}
const cash = (tenant: Tenant): Row => ({
  id: tenant.cash, user_id: tenant.user, amount_cents: 0, currency: "aud",
  balance_as_of: date, updated_at: timestamp,
});
const coverage = (tenant: Tenant): Row => ({
  id: tenant.coverage, user_id: tenant.user, commitment_id: tenant.commitment,
  occurrence_date: date, currency: "aud", covered_cents: 1, target_kind: "imported_bill",
  imported_bill_id: tenant.bill, updated_at: timestamp,
});
const work = (tenant: Tenant): Row => ({
  id: randomUUID(), user_id: tenant.user, kind: "evaluate", dedupe_key: randomUUID(),
  source_kind: "cash_context", source_id: tenant.cash, calculation_revision: 0,
  updated_at: timestamp,
});
const commitment = (tenant: Tenant): Row => ({
  id: randomUUID(), user_id: tenant.user, name: "Synthetic RLS probe",
  category: "operational", amount_cents: 100, currency: "aud", frequency: "monthly",
  updated_at: timestamp,
});

async function identity(): Promise<void> {
  assert.deepStrictEqual((await client.query(`SELECT current_database() AS database,
    current_user AS role, inet_server_addr() AS tcp_address,
    current_setting('listen_addresses') AS listen_addresses,
    current_setting('port') AS port, current_setting('unix_socket_directories') AS socket,
    current_setting('server_version_num')::int / 10000 AS major`)).rows[0], {
    database, role: "syspac", tcp_address: null,
    listen_addresses: "", port: "55437", socket: "/tmp/paidsoon-commitguard-pg.i62Iri", major: 17,
  });
}

// Structural/ACL baseline, not row data. Exclude only the four new tables'
// RLS/ACL/policies during actual targeted application; all other public tables
// (including profile, trial journals/grants/reservations and billing) must match.
async function baseline(excluded: string[] = []): Promise<unknown> {
  return (await client.query(`SELECT jsonb_build_object(
    'relations', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT c.relname=ANY($1::text[])),
    'columns', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a
      JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT c.relname=ANY($1::text[])),
    'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p
      JOIN pg_class c ON c.oid=p.polrelid WHERE NOT c.relname=ANY($1::text[])),
    'constraints', (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k
      JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname='public'),
    'defaults', (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_attrdef d
      JOIN pg_class c ON c.oid=d.adrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public'),
    'indexes', (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i),
    'roles', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),
    'memberships', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.oid) FROM pg_auth_members m),
    'schemas', (SELECT jsonb_agg(to_jsonb(n) ORDER BY n.oid) FROM pg_namespace n),
    'auth_functions', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth')
  ) AS snapshot`, [excluded])).rows[0].snapshot;
}

async function tenantRole(tenant: Tenant): Promise<void> {
  await client.query("RESET ROLE");
  await client.query("SELECT set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({sub: tenant.user, role: "authenticated"})]);
  await client.query("SET LOCAL ROLE authenticated");
  assert.strictEqual((await client.query("SELECT auth.uid()::text AS uid")).rows[0].uid, tenant.user);
}

test("CommitGuard task 1.4 RLS — exact scratch socket, rollback only", async (t) => {
  const cleanup = await openCommitGuardVerificationClone(database);
  try {
    await client.connect();
    await identity(); // Mandatory BEFORE any DDL, including local scaffolding.
    const original = await baseline();
    const canonical = await readFile(new URL("../prisma/rls-policies.sql", import.meta.url), "utf8");
    const targeted = await readFile(new URL("../prisma/rls-commitguard-policies.sql", import.meta.url), "utf8");
    const block = (sql: string) => {
      const match = sql.match(/-- BEGIN COMMITGUARD CASH PROTECTION POLICIES[\s\S]*?-- END COMMITGUARD CASH PROTECTION POLICIES/g);
      assert.strictEqual(match?.length, 1);
      return match![0];
    };
    await t.test("canonical and standalone policy blocks match exactly", () => {
      assert.strictEqual(block(canonical), block(targeted));
    });
    await client.query("BEGIN");
    try {
      // Local Supabase compatibility ONLY after the exact scratch identity guard.
      // These objects and grants never appear in deployable SQL and roll back.
      for (const role of ["authenticated", "anon"]) {
        const existing = (await client.query("SELECT rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname=$1", [role])).rows[0];
        assert.deepStrictEqual(existing, {rolsuper: false, rolbypassrls: false, rolcanlogin: false},
          "required local fixture role must already exist; verifier never changes cluster roles");
      }
      await client.query("CREATE SCHEMA IF NOT EXISTS auth");
      if (!(await client.query("SELECT to_regprocedure('auth.uid()') AS uid")).rows[0].uid) {
        await client.query(`CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$`);
      }
      await client.query("GRANT USAGE ON SCHEMA public, auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated");

      // Scratch may not have canonical legacy policies. Install ONLY the four
      // referenced tables' exact existing canonical blocks/grants as test setup,
      // before taking the actual-application baseline. Never run canonical SQL wholesale.
      for (const table of ["commitments", "commitment_detection_candidates", "imported_bills", "tax_reserve_categories"]) {
        const section = canonical.match(new RegExp(`-- ${table}\\n(?:-- [^\\n]*\\n)*?-- -+\\n([\\s\\S]*?)(?=\\n-- -+\\n|$)`));
        const grant = canonical.match(new RegExp(`^GRANT [^\\n]+ ON TABLE ${table} TO authenticated;`, "m"));
        assert.ok(section && grant, `canonical legacy setup missing for ${table}`);
        await client.query(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY`);
        await client.query(grant[0]);
        await client.query(section[1]);
      }
      // Simulate Supabase's broad defaults AND stale column grants on new tables.
      await client.query(`GRANT ALL ON ${tables.map((table) => `public.${quote(table)}`).join(", ")} TO authenticated, anon`);
      await client.query(`GRANT SELECT (lease_owner), INSERT (fence), UPDATE (state)
        ON public.commit_guard_work_items TO PUBLIC, anon, authenticated`);
      const beforeApply = await baseline(tables);
      await client.query(targeted);
      await t.test("targeted application preserves every unrelated schema/ACL/policy", async () => {
        assert.deepStrictEqual(await baseline(tables), beforeApply);
      });
      const effectivePolicies = async () => (await client.query(`SELECT * FROM pg_policies
        WHERE schemaname='public' AND tablename=ANY($1::text[]) ORDER BY tablename,policyname`, [tables])).rows;
      const firstPolicies = await effectivePolicies();
      await client.query(targeted);
      await t.test("targeted SQL is repeatable and changes no unrelated ACL on reapply", async () => {
        assert.deepStrictEqual(await effectivePolicies(), firstPolicies);
        assert.deepStrictEqual(await baseline(tables), beforeApply);
        assert.strictEqual(firstPolicies.length, 10);
      });

      for (const tenant of tenants) {
        await insert("user_profiles", {id: randomUUID(), userId: tenant.user, updatedAt: timestamp});
        await insert("commitment_detection_candidates", {
          id: tenant.candidate, user_id: tenant.user, candidate_key: randomUUID(),
          name: "Synthetic RLS probe", category: "operational", frequency: "monthly",
          typical_amount_cents: 100, currency: "aud", updated_at: timestamp,
        });
        await insert("commitments", {...commitment(tenant), id: tenant.commitment,
          source_detection_candidate_id: tenant.candidate});
        await insert("accounting_connections", {id: tenant.connection, userId: tenant.user,
          provider: "xero", organisation_id: randomUUID(), organisation_name: "Synthetic RLS probe",
          encrypted_access_token: "unused-synthetic", encrypted_refresh_token: "unused-synthetic",
          token_expires_at: timestamp, scopes: "unused", updated_at: timestamp});
        await insert("imported_bills", {id: tenant.bill, user_id: tenant.user,
          accounting_connection_id: tenant.connection, source_id: randomUUID(),
          supplier_name: "Synthetic RLS probe", amount_cents: 100, currency: "aud", updated_at: timestamp});
        await insert("tax_reserve_categories", {id: tenant.tax, user_id: tenant.user,
          category_type: "custom", name: "Synthetic RLS probe", updated_at: timestamp});
        await insert("commit_guard_evaluation_states", {id: tenant.evaluation, user_id: tenant.user, updated_at: timestamp});
        await tenantRole(tenant);
        assert.strictEqual((await insert("commit_guard_cash_contexts", cash(tenant))).rows[0].id, tenant.cash);
        assert.strictEqual((await insert("commitment_coverages", coverage(tenant))).rows[0].id, tenant.coverage);
        assert.strictEqual((await insert("commitment_coverages", {...coverage(tenant), id: tenant.taxCoverage,
          target_kind: "tax_reserve_category", imported_bill_id: null, tax_reserve_category_id: tenant.tax})).rows[0].id, tenant.taxCoverage);
        assert.strictEqual((await insert("commit_guard_work_items", {...work(tenant), id: tenant.work})).rows[0].id, tenant.work);
        await client.query("RESET ROLE");
      }

      async function probe(name: string, fn: () => Promise<void>): Promise<void> {
        await t.test(name, async () => {
          await client.query("SAVEPOINT probe");
          try { await fn(); }
          finally {
            await client.query("ROLLBACK TO SAVEPOINT probe");
            await client.query("RELEASE SAVEPOINT probe");
          }
        });
      }
      async function denied(fn: () => Promise<unknown>, code = "42501", constraint?: string): Promise<void> {
        await assert.rejects(fn, (error: unknown) => {
          assert.ok(error instanceof pg.DatabaseError);
          assert.strictEqual(error.code, code);
          if (constraint) assert.strictEqual(error.constraint, constraint);
          return true;
        });
      }
      for (const [index, own] of tenants.entries()) {
        const other = tenants[1 - index];
        for (const [table, id, foreignId] of [
          [tables[0], own.cash, other.cash], [tables[1], own.coverage, other.coverage],
          [tables[2], own.work, other.work], [tables[3], own.evaluation, other.evaluation],
        ]) {
          await probe(`tenant ${index}: ${table} reads own, hides other`, async () => {
            await tenantRole(own);
            assert.deepStrictEqual((await client.query(`SELECT id FROM public.${quote(table)} WHERE id=ANY($1::text[]) ORDER BY id`, [[id, foreignId]])).rows, [{id}]);
          });
          await probe(`tenant ${index}: ${table} owner reassignment denied`, async () => {
            await tenantRole(own);
            await denied(() => client.query(`UPDATE public.${quote(table)} SET user_id=$1 WHERE id=$2`, [other.user, id]));
          });
        }
        for (const [table, row] of [[tables[0], cash(other)], [tables[1], coverage(other)],
          [tables[2], work(other)]] as const) {
          await probe(`tenant ${index}: cannot insert other owner's ${table}`, async () => {
            await tenantRole(own);
            await denied(() => insert(table, {...row, id: randomUUID()}));
          });
        }
        for (const [table, id, foreignId, field, value] of [
          [tables[0], own.cash, other.cash, "amount_cents", -1],
          [tables[1], own.coverage, other.coverage, "covered_cents", 2],
        ] as const) {
          await probe(`tenant ${index}: ${table} updates own but not other; rejected write intact`, async () => {
            await tenantRole(own);
            assert.strictEqual((await client.query(`UPDATE public.${quote(table)} SET ${quote(field)}=$1, updated_at=$2 WHERE id=$3 RETURNING id`, [value, timestamp, id])).rows[0].id, id);
            assert.strictEqual((await client.query(`UPDATE public.${quote(table)} SET ${quote(field)}=$1 WHERE id=$2 RETURNING id`, [value, foreignId])).rowCount, 0);
            await client.query("RESET ROLE");
            assert.strictEqual((await client.query(`SELECT ${quote(field)} AS value FROM public.${quote(table)} WHERE id=$1`, [foreignId])).rows[0].value, table === tables[0] ? 0 : 1);
          });
        }
        await probe(`tenant ${index}: coverage removal is own-only and leaves foreign link intact`, async () => {
          await tenantRole(own);
          assert.strictEqual((await client.query("DELETE FROM public.commitment_coverages WHERE id=$1 RETURNING id", [other.coverage])).rowCount, 0);
          assert.strictEqual((await client.query("DELETE FROM public.commitment_coverages WHERE id=$1 RETURNING id", [own.coverage])).rows[0].id, own.coverage);
          await client.query("RESET ROLE");
          assert.strictEqual((await client.query("SELECT id FROM public.commitment_coverages WHERE id=$1", [other.coverage])).rowCount, 1);
        });
        for (const [field, foreignId, constraint] of [
          ["commitment_id", other.commitment, "commitment_coverages_user_id_commitment_id_fkey"],
          ["imported_bill_id", other.bill, "commitment_coverages_user_id_imported_bill_id_fkey"],
          ["tax_reserve_category_id", other.tax, "commitment_coverages_user_id_tax_reserve_category_id_fkey"],
        ]) {
          const base = field === "tax_reserve_category_id"
            ? {...coverage(own), target_kind: "tax_reserve_category", imported_bill_id: null, tax_reserve_category_id: own.tax}
            : coverage(own);
          await probe(`tenant ${index}: insert rejects cross-tenant typed ${field}`, async () => {
            await tenantRole(own);
            await denied(() => insert(tables[1], {...base, id: randomUUID(), [field]: foreignId}), "23503", constraint);
          });
          await probe(`tenant ${index}: update rejects cross-tenant typed ${field}`, async () => {
            await tenantRole(own);
            await denied(() => client.query(`UPDATE public.commitment_coverages SET ${quote(field)}=$1 WHERE id=$2`,
              [foreignId, field === "tax_reserve_category_id" ? own.taxCoverage : own.coverage]), "23503", constraint);
          });
        }
        for (const table of ["commitments", "commitment_detection_candidates"]) {
          await probe(`tenant ${index}: existing ${table} grant cannot transfer owner`, async () => {
            await tenantRole(own);
            await denied(() => client.query(`UPDATE public.${quote(table)} SET user_id=$1 WHERE id=$2`,
              [other.user, table === "commitments" ? own.commitment : own.candidate]));
          });
        }
        for (const operation of ["insert", "update"] as const) {
          await probe(`tenant ${index}: ${operation} rejects foreign conversion source`, async () => {
            await tenantRole(own);
            await denied(() => operation === "insert"
              ? insert("commitments", {...commitment(own), source_detection_candidate_id: other.candidate})
              : client.query("UPDATE public.commitments SET source_detection_candidate_id=$1 WHERE id=$2", [other.candidate, own.commitment]),
            "23503", "commitments_user_id_source_detection_candidate_id_fkey");
          });
        }
        await probe(`tenant ${index}: repeat candidate conversion is unique`, async () => {
          await tenantRole(own);
          await denied(() => insert("commitments", {...commitment(own), source_detection_candidate_id: own.candidate}),
            "23505", "commitments_user_id_source_detection_candidate_id_key");
        });
        await probe(`tenant ${index}: own typed conversion and detection request succeed`, async () => {
          await tenantRole(own);
          const candidateId = randomUUID();
          assert.strictEqual((await insert("commitment_detection_candidates", {
            id: candidateId, user_id: own.user, candidate_key: randomUUID(),
            name: "Synthetic RLS probe", category: "operational", frequency: "monthly",
            typical_amount_cents: 100, currency: "aud", updated_at: timestamp,
          })).rows[0].id, candidateId);
          const converted: Row = {...commitment(own), source_detection_candidate_id: candidateId};
          assert.strictEqual((await insert("commitments", converted)).rows[0].id, converted.id);
          const request = {...work(own), kind: "detect"};
          assert.strictEqual((await insert(tables[2], request, "id, kind, state")).rows[0].state, "pending");
        });
        for (const table of [tables[2], tables[3]]) {
          for (const operation of ["UPDATE", "DELETE"]) {
            await probe(`tenant ${index}: ${operation} ${table} forbidden`, async () => {
              await tenantRole(own);
              await denied(() => client.query(operation === "UPDATE"
                ? `UPDATE public.${quote(table)} SET updated_at=$1 WHERE id=$2`
                : `DELETE FROM public.${quote(table)} WHERE id=$2 AND $1::text IS NOT NULL`,
              [timestamp, table === tables[2] ? own.work : own.evaluation]));
            });
          }
        }
        await probe(`tenant ${index}: evaluation INSERT forbidden`, async () => {
          await tenantRole(own);
          await denied(() => insert(tables[3], {id: randomUUID(), user_id: own.user, updated_at: timestamp}));
        });
        await probe(`tenant ${index}: cash DELETE forbidden`, async () => {
          await tenantRole(own);
          await denied(() => client.query("DELETE FROM public.commit_guard_cash_contexts WHERE id=$1", [own.cash]));
        });
      }

      const own = tenants[0];
      for (const [field, value] of Object.entries({
        state: "skipped", attempts: 1, fence: 1, generation: 1,
        lease_owner: "synthetic_worker", lease_expires_at: timestamp, completed_at: timestamp,
        safe_error_code: "synthetic_error", attempt_history: "[]",
        requested_at: timestamp, next_attempt_at: timestamp, created_at: timestamp,
      })) {
        await probe(`work INSERT column grant rejects forged ${field}`, async () => {
          await tenantRole(own);
          await denied(() => insert(tables[2], {...work(own), [field]: value}));
        });
        await probe(`work UPDATE column grant rejects forged ${field}`, async () => {
          await tenantRole(own);
          await denied(() => client.query(`UPDATE public.commit_guard_work_items SET ${quote(field)}=$1 WHERE id=$2`, [value, own.work]));
        });
      }
      // Deliberately grant forbidden INSERT columns within each rolled-back probe
      // to prove the policy itself rejects otherwise constraint-valid forged rows.
      const forgedRequests: Row[] = [
        {state: "skipped"}, {state: "completed", completed_at: timestamp},
        {state: "processing", lease_owner: "synthetic_worker", lease_expires_at: timestamp},
        {attempts: 1}, {fence: 1}, {generation: 1},
        {safe_error_code: "synthetic_error"}, {attempt_history: "[]"},
      ];
      for (const forged of forgedRequests) {
        await probe(`pending INSERT policy independently rejects ${Object.keys(forged).join("/")}`, async () => {
          await client.query(`GRANT INSERT (${Object.keys(forged).map(quote).join(", ")}) ON public.commit_guard_work_items TO authenticated`);
          await tenantRole(own);
          await denied(() => insert(tables[2], {...work(own), ...forged}));
        });
      }
      for (const field of ["*", "user_id", "lease_owner", "lease_expires_at", "fence", "generation",
        "attempt_history", "source_kind", "source_id", "dedupe_key", "calculation_revision", "next_attempt_at"]) {
        await probe(`work read excludes internal ${field}`, async () => {
          await tenantRole(own);
          await denied(() => client.query(`SELECT ${field === "*" ? "*" : quote(field)} FROM public.commit_guard_work_items WHERE id=$1`, [own.work]));
        });
      }
      await probe("work defaults and trusted lifecycle remain legal", async () => {
        const row = (await client.query("SELECT * FROM public.commit_guard_work_items WHERE id=$1", [own.work])).rows[0];
        for (const field of ["attempts", "fence", "generation"]) assert.strictEqual(row[field], 0);
        for (const field of ["lease_owner", "lease_expires_at", "completed_at", "safe_error_code", "attempt_history"]) assert.strictEqual(row[field], null);
        assert.strictEqual(row.state, "pending");
        assert.ok(row.requested_at && row.next_attempt_at && row.created_at);
        assert.strictEqual((await client.query(`UPDATE public.commit_guard_work_items SET state='processing',
          attempts=1, fence=1, lease_owner='synthetic_worker', lease_expires_at=$1 WHERE id=$2 RETURNING id`, [timestamp, own.work])).rowCount, 1);
        assert.strictEqual((await client.query(`UPDATE public.commit_guard_work_items SET state='completed',
          completed_at=$1, lease_owner=NULL, lease_expires_at=NULL WHERE id=$2 RETURNING id`, [timestamp, own.work])).rowCount, 1);
        assert.strictEqual((await client.query(`UPDATE public.commit_guard_evaluation_states SET calculation_revision=1
          WHERE id=$1 RETURNING id`, [own.evaluation])).rowCount, 1);
      });
      for (const [table, id, constraint] of [
        ["commitments", own.commitment, "commitment_coverages_user_id_commitment_id_fkey"],
        ["imported_bills", own.bill, "commitment_coverages_user_id_imported_bill_id_fkey"],
        ["tax_reserve_categories", own.tax, "commitment_coverages_user_id_tax_reserve_category_id_fkey"],
        ["commitment_detection_candidates", own.candidate, "commitments_user_id_source_detection_candidate_id_fkey"],
      ]) {
        await probe(`${table} referenced DELETE is restricted even for system owner`, async () => {
          await denied(() => client.query(`DELETE FROM public.${quote(table)} WHERE id=$1`, [id]), "23503", constraint);
        });
      }
      for (const table of tables) {
        await probe(`anon has no read of ${table}`, async () => {
          await client.query("SET LOCAL ROLE anon");
          await denied(() => client.query(`SELECT id FROM public.${quote(table)}`));
        });
        await probe(`anon has no table or column privileges on ${table}`, async () => {
          for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
            assert.strictEqual((await client.query("SELECT has_table_privilege('anon', $1, $2) AS allowed", [table, privilege])).rows[0].allowed, false);
          }
          const columns = (await client.query("SELECT attname FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped", [table])).rows;
          for (const {attname} of columns) {
            for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) {
              assert.strictEqual((await client.query("SELECT has_column_privilege('anon', $1, $2, $3) AS allowed", [table, attname, privilege])).rows[0].allowed, false);
            }
          }
        });
      }
      for (const [table, id] of [[tables[0], own.cash], [tables[1], own.coverage]]) {
        await probe(`${table} RLS still rejects owner reassignment if column grant regresses`, async () => {
          await client.query(`GRANT UPDATE (user_id) ON public.${quote(table)} TO authenticated`);
          await tenantRole(own);
          await denied(() => client.query(`UPDATE public.${quote(table)} SET user_id=$1 WHERE id=$2`, [tenants[1].user, id]));
        });
      }
      await probe("D4 explicit tenant coverage removal releases referenced financial rows", async () => {
        await tenantRole(own);
        assert.strictEqual((await client.query("DELETE FROM public.commitment_coverages WHERE id=ANY($1::text[]) RETURNING id", [[own.coverage, own.taxCoverage]])).rowCount, 2);
        await client.query("RESET ROLE");
        for (const [table, id] of [["commitments", own.commitment], ["imported_bills", own.bill], ["tax_reserve_categories", own.tax], ["commitment_detection_candidates", own.candidate]]) {
          assert.strictEqual((await client.query(`DELETE FROM public.${quote(table)} WHERE id=$1 RETURNING id`, [id])).rows[0].id, id);
        }
      });
      await t.test("all four new tables have RLS enabled", async () => {
        assert.ok((await client.query("SELECT relrowsecurity FROM pg_class WHERE oid=ANY($1::regclass[])", [tables])).rows.every((row) => row.relrowsecurity));
      });
    } finally {
      await client.query("ROLLBACK");
    }
    await t.test("rollback restores original schema/ACL/roles/auth scaffolding and removes fixtures", async () => {
      assert.deepStrictEqual(await baseline(), original);
      assert.strictEqual((await client.query('SELECT count(*)::int AS count FROM public.user_profiles WHERE "userId"=ANY($1::text[])', [tenants.map((tenant) => tenant.user)])).rows[0].count, 0);
    });
  } finally {
    try { await client.end(); } finally { await cleanup(); }
  }
});