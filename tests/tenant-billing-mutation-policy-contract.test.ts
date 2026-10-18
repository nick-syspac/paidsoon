import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { assertBillingJournalIndexes, assertReviewedIsolatedTarget, billingJournalIndexes, billingJournalIndexesSql, transactionSqlBody, type BillingJournalIndex } from "@/scripts/verify-rls-billing-artifacts"

// Offline contracts only; no DB/env/provider imports or live verification claim.
const read = (path: string): string => readFileSync(path, "utf8")
const policies = read("prisma/tenant-billing-mutation-policies.sql")
const canonical = read("prisma/rls-policies.sql")
const probe = read("scripts/verify-rls-trial-access.ts")
const entry = read("scripts/verify-rls.ts")
const grants = read("scripts/check-db-grants.ts")
const body = policies.slice(policies.indexOf("ALTER DEFAULT PRIVILEGES"))
const compact = (sql: string): string => sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim()

test("unapplied targeted journal policies exactly match the canonical security block", () => {
  const block = canonical.split("-- BEGIN TENANT BILLING MUTATION POLICIES\n")[1]?.split("-- END TENANT BILLING MUTATION POLICIES")[0]
  assert.ok(block)
  assert.equal(block.trim(), body.trim())
  assert.match(policies, /UNAPPLIED; no live enforcement proof/)
  assert.match(policies, /AFTER every billing\/onboarding writer is converted/)
  assert.match(policies, /full tenant-trial-access-policies\.sql first/)
  assert.doesNotMatch(body, /^\s*(BEGIN|COMMIT|ROLLBACK);/m)
  assert.doesNotMatch(body, /CREATE OR REPLACE POLICY/)
})

test("journals and steps enable RLS and remove table and all column client privileges without a read policy", () => {
  for (const table of ["tenant_billing_mutations", "tenant_billing_mutation_steps"]) {
    assert.ok(body.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`))
    assert.ok(body.includes(`'${table}'`))
  }
  assert.match(compact(body), /REVOKE ALL ON TABLE public\.tenant_billing_mutations, public\.tenant_billing_mutation_steps FROM PUBLIC, anon, authenticated;/)
  assert.match(body, /REVOKE SELECT \(%s\), INSERT \(%s\), UPDATE \(%s\), REFERENCES \(%s\)/)
  assert.match(body, /attnum > 0 AND NOT attisdropped/)
  assert.doesNotMatch(compact(body), /(?:GRANT .* ON (?:TABLE )?public\.tenant_billing_mutation|CREATE POLICY|SECURITY DEFINER|DISABLE ROW LEVEL SECURITY)/)
  // The owner journal remains private under the existing full security block.
  assert.match(canonical, /ALTER TABLE public\.tenant_trial_operations ENABLE ROW LEVEL SECURITY/)
  assert.match(compact(canonical), /REVOKE ALL ON TABLE public\.tenant_trial_grants, public\.tenant_trial_operations, public\.tenant_trial_notifications, public\.tenant_billing_risks, public\.admin_audit_events FROM PUBLIC, anon, authenticated/)
})

test("creation defaults and reservation ACLs close inherited/table authority while preserving safe name updates", () => {
  assert.match(compact(body), /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated/)
  assert.match(body, /REVOKE UPDATE ON TABLE public\.user_profiles FROM PUBLIC, anon, authenticated/)
  assert.match(compact(body), /REVOKE INSERT \(pending_billing_mutation_id\), UPDATE \(pending_billing_mutation_id\) ON TABLE public\.user_profiles FROM PUBLIC, anon, authenticated/)
  assert.match(compact(body), /GRANT UPDATE \(display_name, onboarding_completed_at, "updatedAt"\) ON TABLE public\.user_profiles TO authenticated/)
  assert.doesNotMatch(body, /GRANT (?:ALL|INSERT|DELETE)|GRANT UPDATE ON/)
  // Targeted addition does not rewrite the previously applied containment.
  assert.doesNotMatch(body, /ALTER TABLE public\.tenant_trial|UPDATE public\.user_profiles|INSERT INTO|DELETE FROM/)
})

test("future isolated verifier covers both tenants/anon, constraints, safe reads, authority and unchanged evidence", () => {
  assert.match(probe, /for \(const role of \["authenticated", "anon"\] as const\)/)
  assert.match(probe, /for \(const userId of users\)/)
  assert.match(probe, /for \(const target of users\)/)
  for (const table of ["tenant_trial_operations", "tenant_billing_mutations", "tenant_billing_mutation_steps"]) {
    assert.ok(probe.includes(`SELECT id FROM ${table} WHERE user_id=$1`))
    assert.ok(grants.includes(`"${table}"`))
  }
  for (const statement of ["INSERT INTO ${table} DEFAULT VALUES", "UPDATE ${table} SET id=id", "DELETE FROM ${table}"]) assert.ok(probe.includes(statement))
  for (const column of ["billing_access_version", "pending_trial_operation_id", "pending_billing_mutation_id"]) assert.ok(probe.includes(column))
  assert.match(probe, /SET actor_user_id=\$1[\s\S]*?"23514"/)
  assert.match(probe, /SET user_id=\$1,actor_user_id=\$1[\s\S]*?"23503"/)
  assert.match(probe, /SET parent_mutation_id=\$1[\s\S]*?"23503"/)
  assert.match(probe, /SET mutation_id=\$1[\s\S]*?"23503"/)
  assert.match(probe, /pending_trial_operation_id: operations\[i\], pending_billing_mutation_id: null/)
  assert.match(probe, /pending_trial_operation_id: null, pending_billing_mutation_id: mutations\[i\]/)
  assert.match(probe, /SELECT "userId",display_name FROM user_profiles/)
  assert.match(probe, /row\.pending_billing_mutation_id, mutations\[users\.indexOf\(row\.userId\)\]/)
  assert.match(probe, /has_any_column_privilege/)
  assert.match(probe, /Object\.entries\(journalEvidence\)/)
  assert.match(probe, /ORDER BY "userId"[\s\S]*profileAuthority\)/)
  assert.match(probe, /pg_default_acl/)
  assert.match(grants, /pg_default_acl/)
  assert.match(probe, /finally[\s\S]*client\.query\("ROLLBACK"\)[\s\S]*client\.end\(\)/)
})

test("new staged mode requires reviewed target, stages pending artifacts in order and bypasses persistent legacy cleanup", () => {
  const stage = probe.slice(probe.indexOf("if (billingMutations && staged)"), probe.indexOf("const users ="))
  assert.ok(stage.indexOf("ALTER DEFAULT PRIVILEGES") < stage.indexOf("add_tenant_billing_mutation_journal"))
  const ordered = ["add_billing_webhook_processing_lease", "add_tenant_billing_mutation_journal", "tenant-billing-mutation-constraints.sql", "tenant-billing-mutation-policies.sql"]
  const positions = ordered.map((name) => stage.indexOf(name))
  assert.ok(positions.every((position) => position >= 0))
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
  assert.match(stage, /transactionSqlBody\(await readFile\("prisma\/tenant-billing-mutation-constraints.sql"/)
  assert.match(entry, /assertReviewedIsolatedTarget\(process.argv, process.env.SUPABASE_PROJECT_REF\)/)
  assert.match(entry, /if \(!rollbackOnlyProbe\) await cleanup\(\)/)
  assert.match(entry, /--billing-mutations-staged/)
})

test("transaction wrapper removal preserves CHECK body and rejects embedded transaction controls", () => {
  const checks = read("prisma/tenant-billing-mutation-constraints.sql")
  const unwrapped = transactionSqlBody(checks)
  assert.doesNotMatch(unwrapped, /^\s*(BEGIN|COMMIT);/m)
  assert.match(unwrapped, /CHECK \(actor_user_id = user_id\)/)
  assert.match(unwrapped, /CHECK \(pending_trial_operation_id IS NULL OR pending_billing_mutation_id IS NULL\)/)
  assert.equal(transactionSqlBody(body), body)
  assert.throws(() => transactionSqlBody("BEGIN;\nBEGIN;\nCOMMIT;"))
  assert.throws(() => transactionSqlBody("ROLLBACK;"))
  assert.throws(() => transactionSqlBody("START TRANSACTION;"))
})

test("review acknowledgement cannot select a different target or infer authorization", () => {
  const ref = "abcdefghijklmnopqrst"
  assert.doesNotThrow(() => assertReviewedIsolatedTarget([`--reviewed-isolated-target=${ref}`], ref))
  assert.throws(() => assertReviewedIsolatedTarget([], ref))
  assert.throws(() => assertReviewedIsolatedTarget([`--reviewed-isolated-target=${ref}`], "bcdefghijklmnopqrstu"))
  assert.throws(() => assertReviewedIsolatedTarget(["--reviewed-isolated-target=production"], ref))
  assert.throws(() => assertReviewedIsolatedTarget([`--reviewed-isolated-target=${ref}`, `--reviewed-isolated-target=${ref}`], ref))
})

function indexRows(): BillingJournalIndex[] {
  // Derive fixtures independently from the unchanged generated migration.
  return [...read("prisma/migrations/20261015095612_add_tenant_billing_mutation_journal/migration.sql")
    .matchAll(/CREATE (UNIQUE )?INDEX "([^"]+)" ON "([^"]+)"\(([^;]+)\);/g)]
    .map((match) => {
      const keys = [...match[4].matchAll(/"([^"]+)"/g)].map((column) => column[1])
      return {
        name: match[2], table_name: match[3], table_schema: "public", access_method: "btree",
        is_unique: Boolean(match[1]), is_valid: true, is_ready: true,
        attribute_count: keys.length, keys, predicate: null, expressions: null,
      }
    })
}

test("live index probe requests catalog definitions for exactly the seven generated customer indexes", () => {
  const rows = indexRows()
  assert.equal(rows.length, 7)
  assert.deepEqual(billingJournalIndexes.map((index) => index.name), rows.map((row) => row.name))
  assert.doesNotThrow(() => assertBillingJournalIndexes(rows.toReversed()))
  for (const field of ["pg_index", "pg_get_indexdef", "indnkeyatts", "indnatts", "indisunique", "indisvalid", "indisready", "pg_get_expr(i.indpred", "pg_get_expr(i.indexprs", "pg_am"]) {
    assert.ok(billingJournalIndexesSql.includes(field), field)
  }
  assert.match(billingJournalIndexesSql, /index_ns\.nspname='public' AND idx\.relname=ANY\(\$1::text\[\]\)/)
  assert.match(billingJournalIndexesSql, /ORDER BY key_position/)
  assert.match(probe, /client\.query<BillingJournalIndex>\(billingJournalIndexesSql, \[billingJournalIndexes\.map\(\(index\) => index\.name\)\]\)/)
  assert.match(probe, /assertBillingJournalIndexes\(indexes\.rows\)/)
  assert.ok(probe.indexOf("assertBillingJournalIndexes(indexes.rows)") < probe.indexOf("const users ="))
})

test("index assertions reject every missing index and same-name definition/uniqueness drift", () => {
  for (const [position, expected] of indexRows().entries()) {
    const missing = indexRows()
    missing.splice(position, 1)
    assert.throws(() => assertBillingJournalIndexes(missing), /all seven/)
    const variants: Partial<BillingJournalIndex>[] = [
      { name: `${expected.name}_wrong` }, { table_name: "user_profiles" },
      { table_schema: "other" }, { access_method: "hash" },
      { is_unique: !expected.is_unique }, { is_valid: false }, { is_ready: false },
      { attribute_count: expected.attribute_count + 1 },
      { keys: ["wrong_column", ...expected.keys.slice(1)] },
      { keys: expected.keys.map((key) => `${key} DESC`) },
      { predicate: "(status = 'pending')" }, { expressions: "lower(user_id)" },
      ...(expected.keys.length > 1 ? [{ keys: expected.keys.toReversed() }] : []),
    ]
    for (const variant of variants) {
      const changed = indexRows()
      changed[position] = { ...expected, ...variant }
      assert.throws(() => assertBillingJournalIndexes(changed), /Unexpected customer journal index definition/)
    }
  }
  const duplicated = indexRows()
  duplicated[0] = duplicated[1]
  assert.throws(() => assertBillingJournalIndexes(duplicated), /Unexpected customer journal index definition/)
})

test("profile probe permits only scoped name/onboarding/timestamp changes while preserving authority evidence", () => {
  assert.match(probe, /UPDATE user_profiles SET onboarding_completed_at=\$1,"updatedAt"=now\(\) WHERE "userId"=\$2 RETURNING onboarding_completed_at/)
  assert.match(probe, /\[onboardingCompletedAt, userId\]/)
  assert.match(probe, /assert\.equal\(completed\.rowCount, 1\)/)
  assert.match(probe, /assert\.deepEqual\(completed\.rows\[0\]\.onboarding_completed_at, onboardingCompletedAt\)/)
  assert.match(probe, /UPDATE user_profiles SET onboarding_completed_at=NULL,"updatedAt"=now\(\) WHERE "userId"=\$1 RETURNING id', \[stranger\]\)\)\.rowCount, 0/)
  const snapshots = [...probe.matchAll(/SELECT to_jsonb\(p\)(.*?) AS authority/g)].map((match) => match[1])
  assert.deepEqual(snapshots, Array(2).fill(" - 'display_name' - 'onboarding_completed_at' - 'updatedAt'"))
  assert.match(probe, /assert\.deepEqual\(profile\.onboarding_completed_at, onboardingCompletedAt\)/)
  assert.match(probe, /assert\.equal\(profiles\.rowCount, users\.length\)/)
})