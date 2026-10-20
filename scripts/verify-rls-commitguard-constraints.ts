/**
 * Task 1.3 integration probe, intentionally outside the unit-test glob.
 * Run: node --import tsx --test scripts/verify-rls-commitguard-constraints.ts
 * Supplemental DDL and fixtures execute only in this run's disposable clone.
 *
 * No env loader, Prisma config, application imports, remote URL, or pg defaults.
 * The only permitted target is this reviewed, TCP-disabled disposable cluster.
 * The source template is read-only; clone removal and source baselines are checked.
 * This verifies row constraints, NOT tenant RLS/grants (separate task 1.4).
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
  // A callback avoids pg's empty-string fallback to PGPASSWORD.
  password: () => "",
  ssl: false,
  options: "-c search_path=public -c statement_timeout=10000 -c lock_timeout=3000",
  connectionTimeoutMillis: 3000,
  application_name: "commitguard-constraints-isolated-verification",
});

type Row = Record<string, string | number | null>;
const date = "2026-10-18";
const timestamp = "2026-10-18 12:00:00";
const userId = randomUUID();
const commitmentId = randomUUID();
const billId = randomUUID();
const taxId = randomUUID();

// Trusted, source-controlled fixture keys only; values are always parameters.
async function insert(table: string, row: Row): Promise<pg.QueryResult> {
  const entries = Object.entries(row);
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return client.query(
    `INSERT INTO public.${quote(table)} (${entries.map(([key]) => quote(key)).join(", ")})
     VALUES (${entries.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
    entries.map(([, value]) => value),
  );
}

const cash = (): Row => ({
  id: randomUUID(), user_id: userId, updated_at: timestamp,
  amount_cents: 0, currency: "aud", balance_as_of: date,
});
const expense: Row = {
  weekly_operating_expenses_cents: 0,
  weekly_expenses_currency: "usd", weekly_expenses_as_of: date,
};
const coverage = (): Row => ({
  id: randomUUID(), user_id: userId, commitment_id: commitmentId,
  occurrence_date: date, currency: "aud", covered_cents: 1,
  target_kind: "imported_bill", imported_bill_id: billId,
  tax_reserve_category_id: null, updated_at: timestamp,
});
const work = (): Row => ({
  id: randomUUID(), user_id: userId, kind: "evaluate", dedupe_key: randomUUID(),
  source_kind: "cash_context", calculation_revision: 0, updated_at: timestamp,
});
const settings = (): Row => ({id: randomUUID(), user_id: userId, updated_at: timestamp});
const evaluation = (): Row => ({id: randomUUID(), user_id: userId, updated_at: timestamp});

// Full public-schema structural/ACL baseline (not financial data), excluding only
// this artifact's CHECKs. No policies, roles, columns, indexes, other constraints,
// ownership, RLS flags, or unrelated user-profile/trial ACLs may change.
async function baseline(): Promise<unknown> {
  return (await client.query(`
    SELECT jsonb_build_object(
      -- relchecks necessarily increases; individual CHECKs are verified below.
      'relations', (SELECT jsonb_agg(to_jsonb(c) - 'relchecks' ORDER BY c.oid) FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'),
      'columns', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid, a.attnum)
        FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'),
      'defaults', (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_attrdef d
        JOIN pg_class c ON c.oid = d.adrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'),
      'constraints', (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k
        JOIN pg_namespace n ON n.oid = k.connamespace WHERE n.nspname = 'public'
        AND k.conname NOT LIKE 'commitguard_%_check'),
      'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p),
      'roles', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),
      'memberships', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.oid) FROM pg_auth_members m),
      'indexes', (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i)
    ) AS snapshot
  `)).rows[0].snapshot;
}

test("CommitGuard supplemental CHECKs — isolated socket only, rollback fixtures", async (t) => {
  const cleanup = await openCommitGuardVerificationClone(database);
  try {
    await client.connect();
    const identity = (await client.query(`SELECT current_database() AS database,
      current_user AS role, inet_server_addr() AS tcp_address,
      current_setting('listen_addresses') AS listen_addresses,
      current_setting('port') AS port,
      current_setting('unix_socket_directories') AS socket`)).rows[0];
    assert.deepStrictEqual(identity, {
      database, role: "syspac", tcp_address: null,
      listen_addresses: "", port: "55437", socket: "/tmp/paidsoon-commitguard-pg.i62Iri",
    });
    const sql = await readFile(new URL("../prisma/commitguard-constraints.sql", import.meta.url), "utf8");
    const expectedChecks = [...sql.matchAll(/ADD CONSTRAINT (\w+) CHECK/g)].map((match) => match[1]).sort();
    assert.strictEqual(expectedChecks.length, 23);
    const before = await baseline();
    // The reviewed template already has these CHECKs. Recreate exactly the
    // declared set inside the clone to exercise DDL, not merely inherited state.
    const inherited = (await client.query(`SELECT conname, conrelid::regclass::text AS relation
      FROM pg_constraint WHERE conname=ANY($1::text[]) AND contype='c'`, [expectedChecks])).rows;
    for (const row of inherited) {
      assert.match(row.relation, /^[a-z_]+$/);
      assert.ok(expectedChecks.includes(row.conname));
      await client.query(`ALTER TABLE public."${row.relation}" DROP CONSTRAINT "${row.conname}"`);
    }
    // Artifact has its own BEGIN/COMMIT; apply only to the disposable clone.
    await client.query(sql);
    await t.test("supplemental DDL preserves all other schema/ACLs", async () => {
      assert.deepStrictEqual(await baseline(), before);
    });
    const checks = (await client.query(`SELECT conname, convalidated FROM pg_constraint
      WHERE conname = ANY($1::text[]) AND contype = 'c'`, [expectedChecks])).rows;
    await t.test("every declared CHECK exists and is validated", () => {
      assert.deepStrictEqual(checks.map((row) => row.conname).sort(), expectedChecks);
      assert.ok(checks.every((row) => row.convalidated));
    });

    await client.query("BEGIN");
    try {
      await insert("user_profiles", {id: randomUUID(), userId, updatedAt: timestamp});
      await insert("commitments", {
        id: commitmentId, user_id: userId, name: "Synthetic constraint probe",
        category: "operational", amount_cents: 100, currency: "aud",
        frequency: "monthly", updated_at: timestamp,
      });
      const connectionId = randomUUID();
      await insert("accounting_connections", {
        id: connectionId, userId, provider: "xero", organisation_id: randomUUID(),
        organisation_name: "Synthetic constraint probe", encrypted_access_token: "unused-synthetic",
        encrypted_refresh_token: "unused-synthetic", token_expires_at: timestamp,
        scopes: "unused", updated_at: timestamp,
      });
      await insert("imported_bills", {
        id: billId, user_id: userId, accounting_connection_id: connectionId,
        source_id: randomUUID(), supplier_name: "Synthetic constraint probe",
        amount_cents: 100, currency: "aud", updated_at: timestamp,
      });
      await insert("tax_reserve_categories", {
        id: taxId, user_id: userId, category_type: "custom",
        name: "Synthetic constraint probe", updated_at: timestamp,
      });

      const rejectedChecks = new Set<string>();
      async function probe(
        name: string, table: string, row: Row,
        rejection?: {code: string; constraint?: string},
      ): Promise<void> {
        await t.test(name, async () => {
          await client.query("SAVEPOINT fixture");
          try {
            if (rejection) {
              await assert.rejects(insert(table, row), (error: unknown) => {
                assert.ok(error instanceof pg.DatabaseError);
                assert.strictEqual(error.code, rejection.code);
                if (rejection.constraint) {
                  assert.strictEqual(error.constraint, rejection.constraint);
                  rejectedChecks.add(rejection.constraint);
                }
                return true;
              });
            } else {
              await insert(table, row);
            }
          } finally {
            await client.query("ROLLBACK TO SAVEPOINT fixture");
            await client.query("RELEASE SAVEPOINT fixture");
          }
        });
      }
      const check = (constraint: string) => ({code: "23514", constraint});

      for (const amount of [0, -1, -2147483648, 2147483647]) {
        await probe(`accept signed cash ${amount}`, "commit_guard_cash_contexts", {...cash(), amount_cents: amount});
      }
      for (const amount of [-2147483649, 2147483648]) {
        await probe(`reject out-of-Int cash ${amount}`, "commit_guard_cash_contexts", {...cash(), amount_cents: amount}, {code: "22003"});
      }
      const cashFields = ["amount_cents", "currency", "balance_as_of"];
      const expenseFields = Object.keys(expense);
      for (const [fields, base, constraint] of [
        [cashFields, cash(), "commitguard_cash_balance_group_check"],
        [expenseFields, {...cash(), ...expense}, "commitguard_cash_expense_group_check"],
      ] as const) {
        for (let mask = 1; mask < 7; mask++) {
          const row = {...base};
          fields.forEach((field, i) => {if (!(mask & (1 << i))) row[field] = null;});
          await probe(`reject partial ${constraint} mask ${mask}`, "commit_guard_cash_contexts", row, check(constraint));
        }
      }
      await probe("accept entirely absent cash and expenses", "commit_guard_cash_contexts", {
        ...cash(), amount_cents: null, currency: null, balance_as_of: null,
      });
      await probe("accept independent expense basis without cash", "commit_guard_cash_contexts", {
        ...cash(), amount_cents: null, currency: null, balance_as_of: null, ...expense,
      });
      for (const currency of ["aud", "usd", "nzd", "gbp", "eur", "cad", "sgd", "hkd"]) {
        await probe(`accept all cash attestations in ${currency}`, "commit_guard_cash_contexts", {
          ...cash(), currency, ...expense, weekly_expenses_currency: currency, tax_protection_currency: currency,
        });
        await probe(`accept fixed-buffer currency ${currency}`, "commit_guard_settings", {...settings(), safety_buffer_currency: currency});
      }
      for (const [field, constraint] of [
        ["currency", "commitguard_cash_currency_check"],
        ["weekly_expenses_currency", "commitguard_expense_currency_check"],
        ["tax_protection_currency", "commitguard_tax_currency_check"],
      ]) {
        for (const currency of ["AUD", "jpy", "", "aud "]) {
          await probe(`reject ${field} ${JSON.stringify(currency)}`, "commit_guard_cash_contexts", {
            ...cash(), ...expense, [field]: currency,
          }, check(constraint));
        }
      }
      for (const currency of ["AUD", "jpy", "", "aud "]) {
        await probe(`reject buffer currency ${JSON.stringify(currency)}`, "commit_guard_settings", {
          ...settings(), safety_buffer_currency: currency,
        }, check("commitguard_buffer_currency_check"));
      }
      for (const amount of [0, 2147483647]) {
        await probe(`accept expense basis ${amount} with independent currency`, "commit_guard_cash_contexts", {
          ...cash(), ...expense, weekly_operating_expenses_cents: amount,
        });
      }
      await probe("reject negative expense basis", "commit_guard_cash_contexts", {
        ...cash(), ...expense, weekly_operating_expenses_cents: -1,
      }, check("commitguard_expense_amount_check"));
      await probe("reject overflowing expense basis", "commit_guard_cash_contexts", {
        ...cash(), ...expense, weekly_operating_expenses_cents: 2147483648,
      }, {code: "22003"});
      await probe("preserve legacy positive buffer without currency", "commit_guard_settings", {
        ...settings(), safety_buffer_fixed_cents: 100, safety_buffer_currency: null,
      });

      for (const [table, base, field, constraint] of [
        ["commit_guard_cash_contexts", cash, "revision", "commitguard_cash_revision_check"],
        ["commit_guard_settings", settings, "calculation_revision", "commitguard_settings_revision_check"],
        ["commit_guard_work_items", work, "calculation_revision", "commitguard_work_revision_check"],
        ["commit_guard_work_items", work, "generation", "commitguard_work_generation_check"],
        ["commit_guard_work_items", work, "fence", "commitguard_work_fence_check"],
        ["commit_guard_evaluation_states", evaluation, "calculation_revision", "commitguard_evaluation_revision_check"],
        ["commit_guard_evaluation_states", evaluation, "cash_input_revision", "commitguard_evaluation_cash_revision_check"],
      ] as const) {
        await probe(`reject negative ${table}.${field}`, table, {...base(), [field]: -1}, check(constraint));
        for (const value of [0, 2147483647]) {
          await probe(`accept ${table}.${field} ${value}`, table, {...base(), [field]: value});
        }
      }
      await probe("accept null unevaluated revisions", "commit_guard_evaluation_states", evaluation());

      for (const coveredCents of [1, 2147483647]) {
        await probe(`accept Int coverage ${coveredCents}; aggregate caps belong to task 3.6`, "commitment_coverages", {...coverage(), covered_cents: coveredCents});
      }
      await probe("accept typed tax target", "commitment_coverages", {
        ...coverage(), target_kind: "tax_reserve_category", imported_bill_id: null, tax_reserve_category_id: taxId,
      });
      for (const targetKind of ["imported_bill", "tax_reserve_category", "unknown"]) {
        for (const [bill, tax] of [[null, null], [billId, null], [null, taxId], [billId, taxId]]) {
          if ((targetKind === "imported_bill" && bill && !tax) || (targetKind === "tax_reserve_category" && tax && !bill)) continue;
          await probe(`reject target ${targetKind} bill=${Boolean(bill)} tax=${Boolean(tax)}`, "commitment_coverages", {
            ...coverage(), target_kind: targetKind, imported_bill_id: bill, tax_reserve_category_id: tax,
          }, check("commitguard_coverage_target_check"));
        }
      }
      for (const amount of [0, -1]) {
        await probe(`reject nonpositive coverage ${amount}`, "commitment_coverages", {...coverage(), covered_cents: amount}, check("commitguard_coverage_amount_check"));
      }
      await probe("reject coverage Int overflow", "commitment_coverages", {...coverage(), covered_cents: 2147483648}, {code: "22003"});
      await probe("reject fractional integer cents", "commitment_coverages", {...coverage(), covered_cents: "1.5"}, {code: "22P02"});

      await t.test("initial work defaults are pending, zero counters, null lease/completion", async () => {
        await client.query("SAVEPOINT defaults_probe");
        try {
          const row = (await insert("commit_guard_work_items", work())).rows[0];
          for (const field of ["attempts", "fence", "generation"]) assert.strictEqual(row[field], 0);
          for (const field of ["lease_owner", "lease_expires_at", "completed_at"]) assert.strictEqual(row[field], null);
          assert.strictEqual(row.state, "pending");
        } finally {
          await client.query("ROLLBACK TO SAVEPOINT defaults_probe");
          await client.query("RELEASE SAVEPOINT defaults_probe");
        }
      });
      await probe("accept detect kind", "commit_guard_work_items", {...work(), kind: "detect"});
      await probe("reject unknown work kind", "commit_guard_work_items", {...work(), kind: "other"}, check("commitguard_work_kind_check"));
      await probe("reject unknown work state", "commit_guard_work_items", {...work(), state: "other"}, check("commitguard_work_state_check"));
      for (const attempts of [-1, 7]) {
        await probe(`reject attempts ${attempts}`, "commit_guard_work_items", {...work(), attempts}, check("commitguard_work_attempts_check"));
      }
      for (let attempts = 0; attempts <= 6; attempts++) {
        await probe(`accept pending retry attempts ${attempts}`, "commit_guard_work_items", {...work(), attempts, fence: attempts, generation: 1, safe_error_code: "synthetic_retry"});
      }
      const partialLeases: Row[] = [{lease_owner: "synthetic_worker"}, {lease_expires_at: timestamp}];
      for (const lease of partialLeases) {
        await probe(`reject half lease ${Object.keys(lease)[0]}`, "commit_guard_work_items", {
          ...work(), state: "failed", ...lease,
        }, check("commitguard_work_lease_pair_check"));
      }
      await probe("reject leased pending request", "commit_guard_work_items", {
        ...work(), lease_owner: "synthetic_worker", lease_expires_at: timestamp,
      }, check("commitguard_work_pending_shape_check"));
      await probe("reject completed pending request", "commit_guard_work_items", {
        ...work(), completed_at: timestamp,
      }, check("commitguard_work_pending_shape_check"));
      await probe("reject processing without lease", "commit_guard_work_items", {
        ...work(), state: "processing",
      }, check("commitguard_work_processing_shape_check"));
      await probe("reject processing with completion", "commit_guard_work_items", {
        ...work(), state: "processing", lease_owner: "synthetic_worker",
        lease_expires_at: timestamp, completed_at: timestamp,
      }, check("commitguard_work_processing_shape_check"));
      await probe("accept expired processing lease for recovery", "commit_guard_work_items", {
        ...work(), state: "processing", attempts: 6, fence: 9,
        lease_owner: "synthetic_worker", lease_expires_at: "2020-01-01 00:00:00",
      });
      await probe("reject completed without completion date", "commit_guard_work_items", {
        ...work(), state: "completed",
      }, check("commitguard_work_completed_shape_check"));
      for (const state of ["completed", "skipped", "failed"]) {
        await probe(`accept terminal ${state}`, "commit_guard_work_items", {
          ...work(), state, attempts: 6, fence: 9, completed_at: timestamp,
        });
      }
      await probe("accept zero-attempt skip (no invented attempts coupling)", "commit_guard_work_items", {...work(), state: "skipped"});

      await t.test("trusted lifecycle transitions remain legal", async () => {
        await client.query("SAVEPOINT transitions");
        try {
          const id = randomUUID();
          await insert("commit_guard_work_items", {...work(), id});
          await client.query(`UPDATE public.commit_guard_work_items SET state='processing',
            attempts=1, fence=1, lease_owner='synthetic_worker', lease_expires_at=$2 WHERE id=$1`, [id, timestamp]);
          await client.query(`UPDATE public.commit_guard_work_items SET state='pending',
            lease_owner=NULL, lease_expires_at=NULL, safe_error_code='synthetic_retry' WHERE id=$1`, [id]);
          await client.query(`UPDATE public.commit_guard_work_items SET state='processing',
            attempts=2, fence=2, lease_owner='synthetic_worker', lease_expires_at=$2 WHERE id=$1`, [id, timestamp]);
          await client.query(`UPDATE public.commit_guard_work_items SET state='completed',
            completed_at=$2, lease_owner=NULL, lease_expires_at=NULL WHERE id=$1`, [id, timestamp]);
        } finally {
          await client.query("ROLLBACK TO SAVEPOINT transitions");
          await client.query("RELEASE SAVEPOINT transitions");
        }
      });
      await t.test("every supplemental CHECK rejected a fixture with its exact SQLSTATE/name", () => {
        assert.deepStrictEqual([...rejectedChecks].sort(), expectedChecks);
      });
    } finally {
      await client.query("ROLLBACK");
    }
    await t.test("all synthetic fixture writes were rolled back", async () => {
      assert.strictEqual((await client.query('SELECT count(*)::int AS count FROM public.user_profiles WHERE "userId"=$1', [userId])).rows[0].count, 0);
    });
  } finally {
    try { await client.end(); } finally { await cleanup(); }
  }
});