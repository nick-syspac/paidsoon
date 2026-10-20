import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import pg from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/lib/generated/prisma/client"
import { commitGuardVerificationCloneName, openCommitGuardVerificationClone } from "@/scripts/_commitGuardVerificationClone"

/** Integration fixture only. No env loader, URL fallback, role DDL, remote DB,
 * or source writes. Caller must run serially and always await close(). */
export async function openBrowserDatabase() {
  process.env.TZ = "UTC"
  const name = commitGuardVerificationCloneName()
  const remove = await openCommitGuardVerificationClone(name)
  const config = { host: "/tmp/paidsoon-commitguard-pg.i62Iri", port: 55437,
    database: name, user: "syspac", password: () => "", ssl: false as const,
    options: "-c timezone=UTC -c statement_timeout=10000 -c lock_timeout=5000" }
  const sql = new pg.Client(config)
  const db = new PrismaClient({ adapter: new PrismaPg({ ...config, max: 16 }) })
  async function close() { await db.$disconnect(); await sql.end(); await remove() }
  try {
    await sql.connect()
    assert.equal((await sql.query("SELECT current_database() name,inet_server_addr() tcp")).rows[0].name, name)
    assert.equal((await sql.query("SELECT inet_server_addr() tcp")).rows[0].tcp, null)
    const canonical = await readFile(new URL("../prisma/rls-policies.sql", import.meta.url), "utf8")
    await sql.query(`CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      GRANT USAGE ON SCHEMA public,auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated`)
    await sql.query(await readFile(new URL("../prisma/rls-commitguard-policies.sql", import.meta.url), "utf8"))
    // Legacy tables have synthetic ownership policies, with exact canonical
    // column/table grants. This is NOT proof of deployed Supabase policies.
    for (const table of ["user_profiles", "commit_guard_settings", "commitments", "commitment_events",
      "commitment_detection_candidates", "accounting_connections", "imported_bills", "imported_bank_transactions",
      "supplier_profiles", "tax_buffer_configurations", "tax_reserve_categories", "tax_buffer_obligations", "tax_buffer_overrides"]) {
      const owner = ["user_profiles", "accounting_connections"].includes(table) ? '"userId"' : "user_id"
      const grants = canonical.match(new RegExp(`^GRANT [^\\n]+ ON TABLE ${table} TO authenticated;`, "gm")) ?? []
      assert.ok(grants.length, `canonical grants exist: ${table}`)
      await sql.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON ${table} FROM PUBLIC,anon,authenticated; ${grants.join("\n")}
        CREATE POLICY browser_select ON ${table} FOR SELECT TO authenticated USING (${owner}=(SELECT auth.uid())::text);
        CREATE POLICY browser_insert ON ${table} FOR INSERT TO authenticated WITH CHECK (${owner}=(SELECT auth.uid())::text);
        CREATE POLICY browser_update ON ${table} FOR UPDATE TO authenticated USING (${owner}=(SELECT auth.uid())::text) WITH CHECK (${owner}=(SELECT auth.uid())::text)`)
    }
    for (const table of ["tenant_trial_grants", "tenant_billing_risks"]) {
      const grant = canonical.match(new RegExp(`GRANT SELECT \\([^;]+\\)\\s+ON TABLE public\\.${table} TO authenticated;`))
      assert.ok(grant)
      await sql.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON ${table} FROM PUBLIC,anon,authenticated; ${grant[0]}
        CREATE POLICY browser_access ON ${table} FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid())::text)`)
    }
    return { db, sql, name, close }
  } catch (error) { await close(); throw error }
}