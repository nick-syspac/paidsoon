import { test, mock } from "node:test"
import assert from "node:assert/strict"
import { billingJournalIndexes, billingJournalIndexesSql } from "@/scripts/verify-rls-billing-artifacts"

// Lifecycle tests only, NOT SQL/RLS proof. No actual connection or provider.
const queries: string[] = []
let failAt: "policies" | "fixture" | "index-query" | "index-definition" | "onboarding-query" | "onboarding-row" | "onboarding-value" = "fixture"
let ended = false
let currentUser: unknown
let authenticated = false
const failure = new Error("offline staged probe failure")

class OfflineClient {
  async connect(): Promise<void> {}
  async end(): Promise<void> { ended = true }
  async query(sql: string, values: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
    queries.push(sql)
    if (sql.includes("to_regclass('public.tenant_trial_grants')")) return { rows: [{ relation: "tenant_trial_grants" }], rowCount: 1 }
    if (sql.includes("column_name='processing_token'")) return { rows: [{ present: false }], rowCount: 1 }
    if (sql.includes("to_regclass('public.tenant_billing_mutations')")) return { rows: [{ relation: null }], rowCount: 1 }
    if (failAt === "policies" && sql.includes("FOREACH journal")) throw failure
    if (sql === billingJournalIndexesSql) {
      assert.deepEqual(values, [billingJournalIndexes.map((index) => index.name)])
      if (failAt === "index-query") throw failure
      const rows = billingJournalIndexes.map((index) => ({
        ...index, table_schema: "public", access_method: "btree", is_valid: true,
        is_ready: true, attribute_count: index.keys.length, predicate: null, expressions: null,
      }))
      if (failAt === "index-definition") rows[0].is_unique = true
      return { rows, rowCount: rows.length }
    }
    if (failAt === "fixture" && sql.startsWith("INSERT INTO user_profiles")) throw failure
    if (sql === "SET LOCAL ROLE authenticated") authenticated = true
    if (sql.startsWith("SELECT set_config")) currentUser = values[1]
    if (sql.startsWith("UPDATE user_profiles SET onboarding_completed_at=$1")) {
      assert.equal(authenticated, true)
      assert.equal(values[1], currentUser)
      assert.ok(values[0] instanceof Date)
      assert.match(sql, /,"updatedAt"=now\(\) WHERE "userId"=\$2 RETURNING onboarding_completed_at$/)
      if (failAt === "onboarding-query") throw failure
      if (failAt === "onboarding-row") return { rows: [], rowCount: 0 }
      if (failAt === "onboarding-value") return { rows: [{ onboarding_completed_at: null }], rowCount: 1 }
      assert.fail("Unexpected onboarding probe")
    }
    if (sql.startsWith("UPDATE tenant_trial_grants SET last_operation_id") ||
        sql.startsWith("UPDATE tenant_billing_mutations SET user_id") ||
        sql.startsWith("UPDATE tenant_billing_mutations SET parent_mutation_id") ||
        (sql.startsWith("UPDATE tenant_billing_mutation_steps SET mutation_id") && !sql.includes("RETURNING"))) {
      throw Object.assign(new Error("mock constraint"), { code: "23503" })
    }
    if (sql.startsWith("INSERT INTO tenant_trial_grants SELECT")) throw Object.assign(new Error("mock unique"), { code: "23505" })
    if (sql.startsWith("UPDATE tenant_billing_mutations SET actor_user_id") ||
        (sql.startsWith("UPDATE user_profiles SET pending_") && !sql.includes("RETURNING"))) {
      throw Object.assign(new Error("mock check"), { code: "23514" })
    }
    if (sql.startsWith("UPDATE user_profiles SET pending_trial_operation_id=$1,pending_billing_mutation_id=NULL")) {
      return { rows: [{ pending_trial_operation_id: values[0], pending_billing_mutation_id: null }], rowCount: 1 }
    }
    if (sql.startsWith("UPDATE user_profiles SET pending_trial_operation_id=NULL,pending_billing_mutation_id=$1")) {
      return { rows: [{ pending_trial_operation_id: null, pending_billing_mutation_id: values[0] }], rowCount: 1 }
    }
    if (sql.includes("has_table_privilege")) return { rows: [{ rls: true, table_access: false, column_access: false }], rowCount: 1 }
    if (sql.includes("pg_default_acl")) return { rows: [{ grants: 0 }], rowCount: 1 }
    if (sql.startsWith("SELECT id,user_id,plan") || sql.startsWith("SELECT user_id,kind,blocking")) {
      return { rows: [{ user_id: currentUser }], rowCount: 1 }
    }
    if (sql.startsWith('SELECT "userId",display_name')) return { rows: [{ userId: currentUser }], rowCount: 1 }
    if (sql.startsWith("UPDATE user_profiles SET display_name=")) return { rows: [{ display_name: "RLS probe name" }], rowCount: 1 }
    if (sql === "SELECT creator_operation_id FROM tenant_trial_grants" || sql === "SELECT stripe_object_id FROM tenant_billing_risks") {
      throw Object.assign(new Error("mock privilege"), { code: "42501" })
    }
    if (sql.includes("RETURNING id")) return { rows: [{ id: values[0] }], rowCount: 1 }
    return { rows: [], rowCount: 0 }
  }
}

mock.module("pg", { namedExports: { Client: OfflineClient } })
mock.module("@/lib/config/supabaseEnvironmentRuntime", {
  namedExports: {
    resolveSupabaseEnvironment: ({ mode }: { mode: string }) => {
      assert.equal(mode, "migration")
      return { directUrl: "offline-no-connection" }
    },
  },
})
const { verifyTrialAccessRls } = await import("@/scripts/verify-rls-trial-access")

for (const phase of ["policies", "fixture"] as const) {
  test(`staged probe rolls back and closes after ${phase} failure with no nested transaction or persistent cleanup`, async () => {
    queries.length = 0
    ended = false
    failAt = phase
    await assert.rejects(verifyTrialAccessRls(true, false, true), (error: unknown) => error === failure)
    assert.equal(ended, true)
    assert.equal(queries[0], "BEGIN")
    assert.equal(queries.at(-1), "ROLLBACK")
    const statements = queries.map((sql) => sql.replace(/--[^\n]*/g, "").trim())
    assert.equal(statements.filter((sql) => sql === "BEGIN").length, 1)
    assert.equal(statements.filter((sql) => sql === "ROLLBACK").length, 1)
    assert.ok(statements.every((sql) => !/^COMMIT\b/im.test(sql)))
    assert.ok(statements.filter((sql) => sql !== "BEGIN").every((sql) => !/^BEGIN;/im.test(sql)))
    assert.ok(queries.some((sql) => sql.includes('ADD COLUMN') && sql.includes('processing_token')))
    assert.ok(queries.some((sql) => sql.includes('CREATE TABLE "tenant_billing_mutations"')))
    assert.ok(queries.some((sql) => sql.includes("CHECK (actor_user_id = user_id)")))
    assert.ok(queries.findIndex((sql) => sql.includes("ALTER DEFAULT PRIVILEGES")) < queries.findIndex((sql) => sql.includes('CREATE TABLE "tenant_billing_mutations"')))
    assert.ok(queries.every((sql) => !/DELETE FROM|TRUNCATE|_prisma_migrations/.test(sql)))
  })
}

for (const phase of ["index-query", "index-definition", "onboarding-query", "onboarding-row", "onboarding-value"] as const) {
  test(`staged probe rolls back and closes after ${phase} failure inside its sole transaction`, async () => {
    queries.length = 0
    ended = false
    authenticated = false
    currentUser = undefined
    failAt = phase
    await assert.rejects(verifyTrialAccessRls(true, false, true), (error: unknown) => {
      if (phase.endsWith("query")) return error === failure
      assert.ok(error instanceof assert.AssertionError)
      if (phase === "index-definition") assert.match(error.message, /Unexpected customer journal index definition/)
      else assert.ok(queries.at(-2)?.startsWith("UPDATE user_profiles SET onboarding_completed_at=$1"))
      return true
    })
    assert.equal(ended, true)
    assert.equal(queries[0], "BEGIN")
    assert.equal(queries.at(-1), "ROLLBACK")
    assert.equal(queries.filter((sql) => sql === "BEGIN").length, 1)
    assert.equal(queries.filter((sql) => sql === "ROLLBACK").length, 1)
    assert.ok(queries.every((sql) => !/^\s*(?:COMMIT|BEGIN;)/im.test(sql)))
    assert.ok(queries.includes(billingJournalIndexesSql))
    assert.ok(queries.findIndex((sql) => sql.includes("FOREACH journal")) < queries.indexOf(billingJournalIndexesSql))
    if (phase.startsWith("index")) {
      assert.ok(queries.every((sql) => !sql.startsWith("INSERT INTO user_profiles")))
    } else {
      assert.ok(queries.indexOf(billingJournalIndexesSql) < queries.findIndex((sql) => sql === "SET LOCAL ROLE authenticated"))
      assert.ok(queries.some((sql) => sql.startsWith("UPDATE user_profiles SET display_name=")))
      assert.ok(queries.some((sql) => sql.startsWith("SELECT to_jsonb(p) - 'display_name' - 'onboarding_completed_at' - 'updatedAt'")))
    }
  })
}