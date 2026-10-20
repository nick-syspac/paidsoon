import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

// Offline source checks only. Real roles/RLS are exercised outside tests/** by
// scripts/verify-commitguard-current-runtime-storage.ts on the approved socket.
const sql = readFileSync(new URL("../prisma/rls-cashplan-commitguard-policies.sql", import.meta.url), "utf8")
const canonical = readFileSync(new URL("../prisma/rls-policies.sql", import.meta.url), "utf8")
const block = (text: string): string => {
  const start = text.indexOf("-- BEGIN CASHPLAN COMMITGUARD POLICIES")
  const end = text.indexOf("-- END CASHPLAN COMMITGUARD POLICIES")
  assert.ok(start >= 0 && end > start)
  return text.slice(start, end)
}

test("CashPlan canonical and independently deployable ACL blocks cannot drift", () => {
  assert.equal(block(sql), block(canonical))
})

test("CashPlan artifact touches only three reviewed tables and no role/default/schema ACL", () => {
  assert.deepEqual([...new Set([...sql.matchAll(/public\.(cash_\w+)/g)].map((m) => m[1]))].sort(),
    ["cash_plan_overrides", "cash_plan_snapshots", "cash_plans"])
  assert.doesNotMatch(sql, /ALTER\s+(?:DEFAULT|ROLE)|GRANT\s+.*ON\s+SCHEMA|CREATE\s+(?:ROLE|SCHEMA|FUNCTION)|SECURITY\s+DEFINER/i)
  assert.doesNotMatch(sql, /user_profiles|tenant_trial|tenant_billing/)
})

test("CashPlan grant surface is SELECT plus explicit INSERT columns only", () => {
  const grants = [...sql.matchAll(/^GRANT ([\s\S]+?);/gm)].map((m) => m[1])
  assert.equal(grants.length, 3)
  assert.ok(grants[0].startsWith("SELECT ON TABLE"))
  for (const grant of grants.slice(1)) {
    assert.match(grant, /^INSERT \(id, plan_id,/)
    assert.match(grant, /created_at/)
    assert.match(grant, /TO authenticated$/)
    assert.doesNotMatch(grant, /\bALL\b|\bUPDATE\b|\bDELETE\b|TO anon/)
  }
  assert.match(sql, /REVOKE ALL PRIVILEGES \(%s\)/)
})

test("CashPlan child policies use actual plan relation, not descriptive owner or forged tenant columns", () => {
  const policies = [...sql.matchAll(/CREATE POLICY [\s\S]+?;/g)].map((m) => m[0])
  assert.equal(policies.length, 5)
  for (const policy of policies.slice(1)) {
    assert.match(policy, /p\.id = cash_plan_(?:overrides|snapshots)\.plan_id AND p\.user_id = \(SELECT auth\.uid\(\)\)::text/)
    assert.doesNotMatch(policy, /\bowner\b\s*=|created_by\s*=|cash_plan_(?:snapshots|overrides)\.user_id/)
  }
  assert.match(policies.at(-1)!, /WITH CHECK \(scenario_id IS NULL AND EXISTS/)
})

test("CashPlan refuses unknown OR-capable policy state and drops only named reviewed policies", () => {
  assert.match(sql, /p\.polcmd IN \('r', 'a', '\*'\)/)
  assert.match(sql, /RAISE EXCEPTION 'Unreviewed overlapping CashPlan client policy/)
  assert.match(sql, /pg_has_role\('authenticated', role_id, 'MEMBER'\)/)
  assert.equal([...sql.matchAll(/^DROP POLICY IF EXISTS /gm)].length, 5)
  assert.doesNotMatch(sql, /EXECUTE\s+format\('DROP POLICY/)
})