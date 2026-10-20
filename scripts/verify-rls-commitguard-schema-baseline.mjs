/** Task 1.6 only. Creates a SECOND database on the reviewed TCP-disabled PG17
 * cluster; never loads application env/config. Requires cached/downloadable
 * Prisma 6.19.0 (explicit --url support). Historical files are read-only.
 * Run: node scripts/verify-rls-commitguard-schema-baseline.mjs
 * Pass --cleanup to drop ONLY this run's replay database in finally.
 * No shared/deployed ACL claim. Pinned Prisma CLI must already be cached.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = new URL("../", import.meta.url);
const host = "/tmp/paidsoon-commitguard-pg.i62Iri";
const database = `commitguard_baseline_${Date.now()}`;
const connection = { host, port: 55437, user: "syspac", password: () => "",
  ssl: false, connectionTimeoutMillis: 3000 };
const admin = new pg.Client({ ...connection, database: "commitguard" });
const replay = new pg.Client({ ...connection, database });
const migration = "20261018111014_fix_commitguard_cash_protection_workflows";
const newTables = ["commit_guard_cash_contexts", "commit_guard_work_items",
  "commit_guard_evaluation_states", "commitment_coverages"];
const columns = {
  cash_plan_overrides: ["planned_date"],
  cash_plan_snapshots: ["anchor_date", "canonical_facts", "cash_input_revision",
    "commitment_revision", "coverage", "input_currency", "input_quality", "input_version"],
  commit_guard_settings: ["calculation_revision", "safety_buffer_currency"],
  commitment_detection_candidates: ["candidate_key", "connection_id", "conversion_review_required",
    "corrections_evidence_fingerprint", "latest_observed_at", "recurrence_anchor",
    "suggested_due_date", "suppression_evidence", "user_corrections"],
  commitment_events: ["cycle_key", "input_revision", "occurrence_date", "relevance", "resolved_at"],
  commitments: ["source_detection_candidate_id"],
};
const indexes = ["commitment_detection_candidates_user_id_id_key",
  "commitment_detection_candidates_user_id_candidate_key_key",
  "commitment_events_user_id_relevance_occurred_at_idx", "commitments_user_id_id_key",
  "commitments_user_id_source_detection_candidate_id_key", "tax_reserve_categories_user_id_id_key"];
const foreignKeys = ["commit_guard_cash_contexts_user_id_fkey", "commit_guard_work_items_user_id_fkey",
  "commit_guard_evaluation_states_user_id_fkey", "commitments_user_id_source_detection_candidate_id_fkey",
  "commitment_coverages_user_id_fkey", "commitment_coverages_user_id_commitment_id_fkey",
  "commitment_coverages_user_id_imported_bill_id_fkey",
  "commitment_coverages_user_id_tax_reserve_category_id_fkey"];

async function identity(client, expectedDatabase) {
  assert.deepStrictEqual((await client.query(`SELECT current_database() AS database,
    current_user AS role, inet_server_addr() AS tcp_address,
    current_setting('listen_addresses') AS listen_addresses,
    current_setting('port') AS port, current_setting('unix_socket_directories') AS socket,
    current_setting('server_version_num')::int / 10000 AS major`)).rows[0], {
    database: expectedDatabase, role: "syspac", tcp_address: null, listen_addresses: "",
    port: "55437", socket: host, major: 17,
  });
}

// Logical catalog, no physical statistics/OIDs that change during normal DDL.
// FK triggers are included on BOTH referencing and referenced (inverse) tables.
async function catalog() {
  const rows = async (sql) => (await replay.query(sql)).rows;
  const publicRelation = "JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'";
  return {
    relations: await rows(`SELECT c.relname AS table, c.relkind, c.relowner::regrole::text,
      c.relacl, c.relrowsecurity, c.relforcerowsecurity, c.relpersistence,
      c.reloptions, c.relreplident FROM pg_class c ${publicRelation} ORDER BY c.relname`),
    columns: await rows(`SELECT c.relname AS table, a.attname AS name, a.attnum,
      format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull, a.attacl,
      a.attidentity, a.attgenerated, a.attcollation::regcollation::text,
      pg_get_expr(d.adbin,d.adrelid) AS default_expression
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      ${publicRelation} AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`),
    constraints: await rows(`SELECT c.relname AS table, k.conname AS name, k.contype,
      k.convalidated, pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k
      JOIN pg_class c ON c.oid=k.conrelid ${publicRelation} ORDER BY c.relname,k.conname`),
    indexes: await rows(`SELECT c.relname AS table, i.relname AS name,
      pg_get_indexdef(i.oid) AS definition, x.indisvalid, x.indisready
      FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid
      ${publicRelation} ORDER BY c.relname,i.relname`),
    triggers: await rows(`SELECT c.relname AS table, t.tgname AS name, k.conname AS constraint_name,
      t.tgenabled, pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid LEFT JOIN pg_constraint k ON k.oid=t.tgconstraint
      ${publicRelation} ORDER BY c.relname,t.tgname`),
    policies: await rows("SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname"),
    roles: await rows("SELECT * FROM pg_roles ORDER BY oid"),
    memberships: await rows("SELECT * FROM pg_auth_members ORDER BY oid"),
    schemas: await rows("SELECT * FROM pg_namespace ORDER BY oid"),
    defaultAcls: await rows("SELECT * FROM pg_default_acl ORDER BY oid"),
    functions: await rows(`SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('public','auth') ORDER BY p.oid`),
    types: await rows(`SELECT t.* FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' ORDER BY t.oid`),
  };
}

function execute(sql) {
  const url = `postgresql://syspac@localhost:55437/${database}?host=${encodeURIComponent(host)}`;
  // Prisma 7 removed --url. Pinned verification-only CLI runs OUTSIDE repository
  // and scratch config directories, with no inherited database/env configuration.
  const result = spawnSync("npx", ["--yes", "--package=prisma@6.19.0", "prisma", "db", "execute",
    "--url", url, "--stdin"], { cwd: "/tmp", input: sql, encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NPM_CONFIG_OFFLINE: "true" },
    maxBuffer: 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

let createdRole = false;
let connectedReplay = false;
let createdDatabase = false;
let originalRoles;
await admin.connect();
try {
  await identity(admin, "commitguard"); // Mandatory before CREATE DATABASE/ROLE.
  originalRoles = (await admin.query("SELECT * FROM pg_roles ORDER BY oid")).rows;
  assert.match(database, /^commitguard_baseline_\d+$/);
  await admin.query(`CREATE DATABASE "${database}"`);
  createdDatabase = true;
  await replay.connect();
  connectedReplay = true;
  await identity(replay, database);
  if (!originalRoles.some((role) => role.rolname === "authenticated")) {
    // Two historical spend_insights migrations reference this role. Temporary
    // cluster-local scaffolding only; no auth schema/function or shared DB use.
    await admin.query("CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS");
    createdRole = true;
  }
  const names = (await readdir(new URL("prisma/migrations/", root))).filter((name) => /^\d/.test(name)).sort();
  assert.equal(names.indexOf(migration), 55);
  const sql = await Promise.all(names.slice(0, 56).map((name) =>
    readFile(new URL(`prisma/migrations/${name}/migration.sql`, root), "utf8")));
  execute(`BEGIN;\n${sql.slice(0, 55).join("\n")}\nCOMMIT;`);
  const before = await catalog();
  execute(`BEGIN;\n${sql[55]}\nCOMMIT;`);
  const after = await catalog();
  assert.deepStrictEqual(after.relations.filter((row) => !before.relations.some((old) => old.table === row.table))
    .filter((row) => row.relkind === "r").map((row) => row.table).sort(), [...newTables].sort());
  const additions = (key) => after[key].filter((row) => !before[key].some((old) =>
    old.table === row.table && old.name === row.name));
  assert.deepStrictEqual(additions("columns").filter((row) =>
    before.relations.some((relation) => relation.table === row.table && relation.relkind === "r"))
    .map((row) => `${row.table}.${row.name}`).sort(),
  Object.entries(columns).flatMap(([table, names]) => names.map((name) => `${table}.${name}`)).sort());
  assert.equal(additions("indexes").length, 19); // 15 explicit indexes + four new primary keys.
  assert.deepStrictEqual(additions("constraints").filter((row) => row.contype === "f")
    .map((row) => row.name).sort(), [...foreignKeys].sort());
  const projected = structuredClone(after);
  const addedTypeIds = after.types.filter((row) => !before.types.some((old) => old.oid === row.oid)).map((row) => row.oid);
  // Only the four new row types and their four array types may appear.
  assert.equal(addedTypeIds.length, 8);
  assert.ok(after.types.filter((row) => addedTypeIds.includes(row.oid)).every((row) =>
    newTables.includes(row.typname) || newTables.includes(row.typname.slice(1))));
  projected.types = projected.types.filter((row) => !addedTypeIds.includes(row.oid));
  for (const key of ["relations", "columns", "constraints", "indexes", "triggers"]) {
    projected[key] = projected[key].filter((row) => !newTables.includes(row.table)
      && !(key === "relations" && (indexes.includes(row.table)
        || after.indexes.some((index) => newTables.includes(index.table) && index.name === row.table)))
      && !(key === "columns" && columns[row.table]?.includes(row.name))
      && !(key === "columns" && after.indexes.some((index) => index.name === row.table
        && (newTables.includes(index.table) || indexes.includes(index.name))))
      && !(key === "indexes" && indexes.includes(row.name))
      && !(key === "constraints" && foreignKeys.includes(row.name))
      && !(key === "triggers" && foreignKeys.includes(row.constraint_name)));
  }
  assert.deepStrictEqual(projected, before, "Only reviewed tables/columns/indexes/FKs (including inverse FK triggers) may differ");
  const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  console.log(JSON.stringify({ database, historicalMigrations: 55, newMigration: migration,
    existingTables: before.relations.filter((row) => row.relkind === "r").length,
    newTables, addedColumnsOnExistingTables: Object.values(columns).flat().length,
    addedIndexes: additions("indexes").length, addedForeignKeys: foreignKeys.length,
    preservedCatalogSha256: digest(before), projectedAfterSha256: digest(projected),
    result: "PASS: unrelated schema/ACLs, profile/trial journals/grants/reservations preserved",
    migrationSha256: createHash("sha256").update(sql[55]).digest("hex"),
    script: fileURLToPath(import.meta.url) }, null, 2));
  // Historical files must still be byte-identical; never rewrite migration history.
  for (let i = 0; i < 56; i++) assert.equal(await readFile(new URL(`prisma/migrations/${names[i]}/migration.sql`, root), "utf8"), sql[i]);
} finally {
  if (createdRole) {
    // Remove ONLY this replay DB's historical synthetic-role column grants.
    if (connectedReplay) await replay.query('REVOKE ALL PRIVILEGES (state, resolved_at, updated_at) ON public.spend_insights FROM authenticated');
    await admin.query("DROP ROLE authenticated");
    console.log("Temporary authenticated role removed; replay database retained, no supplemental CHECK/RLS applied here.");
  }
  if (originalRoles) assert.deepStrictEqual((await admin.query("SELECT * FROM pg_roles ORDER BY oid")).rows, originalRoles);
  console.log("Original cluster roles preserved. No application env/config or default database URLs used for replay.");
  if (connectedReplay) await replay.end();
  if (createdDatabase && process.argv.includes("--cleanup")) {
    await admin.query(`DROP DATABASE "${database}"`);
    console.log("This run's replay database removed (--cleanup). Pre-existing databases untouched.");
  }
  await admin.end();
}