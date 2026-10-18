import assert from "node:assert/strict"

// Pure helpers: importing these from static tests never loads env/DB clients.
export const billingJournalIndexes = [
  { name: "tenant_billing_mutations_user_id_created_at_idx", table_name: "tenant_billing_mutations", is_unique: false, keys: ["user_id", "created_at"] },
  { name: "tenant_billing_mutations_user_id_parent_mutation_id_idx", table_name: "tenant_billing_mutations", is_unique: false, keys: ["user_id", "parent_mutation_id"] },
  { name: "tenant_billing_mutations_status_lease_expires_at_idx", table_name: "tenant_billing_mutations", is_unique: false, keys: ["status", "lease_expires_at"] },
  { name: "tenant_billing_mutations_user_id_id_key", table_name: "tenant_billing_mutations", is_unique: true, keys: ["user_id", "id"] },
  { name: "tenant_billing_mutation_steps_stripe_idempotency_key_key", table_name: "tenant_billing_mutation_steps", is_unique: true, keys: ["stripe_idempotency_key"] },
  { name: "tenant_billing_mutation_steps_user_id_mutation_id_step_key_key", table_name: "tenant_billing_mutation_steps", is_unique: true, keys: ["user_id", "mutation_id", "step_key"] },
  { name: "tenant_billing_mutation_steps_user_id_mutation_id_sequence_key", table_name: "tenant_billing_mutation_steps", is_unique: true, keys: ["user_id", "mutation_id", "sequence"] },
] as const

export interface BillingJournalIndex {
  name: string
  table_name: string
  table_schema: string
  access_method: string
  is_unique: boolean
  is_valid: boolean
  is_ready: boolean
  attribute_count: number
  keys: string[]
  predicate: string | null
  expressions: string | null
}

// Inspect definitions, not just names: a same-named partial, nonunique,
// differently ordered, expression or invalid index must fail the probe.
export const billingJournalIndexesSql = `SELECT idx.relname AS name,
  tbl.relname AS table_name, ns.nspname AS table_schema, am.amname AS access_method,
  i.indisunique AS is_unique, i.indisvalid AS is_valid, i.indisready AS is_ready,
  i.indnatts::int AS attribute_count,
  ARRAY(SELECT pg_get_indexdef(i.indexrelid, key_position, true)
    FROM generate_series(1, i.indnkeyatts) AS key_position ORDER BY key_position) AS keys,
  pg_get_expr(i.indpred, i.indrelid) AS predicate,
  pg_get_expr(i.indexprs, i.indrelid) AS expressions
  FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
  JOIN pg_namespace index_ns ON index_ns.oid=idx.relnamespace
  JOIN pg_class tbl ON tbl.oid=i.indrelid
  JOIN pg_namespace ns ON ns.oid=tbl.relnamespace
  JOIN pg_am am ON am.oid=idx.relam
  WHERE index_ns.nspname='public' AND idx.relname=ANY($1::text[])`

export function assertBillingJournalIndexes(rows: BillingJournalIndex[]): void {
  assert.equal(rows.length, billingJournalIndexes.length, "Expected all seven customer journal indexes")
  for (const expected of billingJournalIndexes) {
    assert.deepEqual(rows.find((row) => row.name === expected.name), {
      ...expected,
      table_schema: "public",
      access_method: "btree",
      is_valid: true,
      is_ready: true,
      attribute_count: expected.keys.length,
      predicate: null,
      expressions: null,
    }, `Unexpected customer journal index definition: ${expected.name}`)
  }
}

export function transactionSqlBody(sql: string): string {
  // Supplemental CHECKs own a deploy transaction. When staged, remove ONLY the
  // outer wrapper; never execute nested BEGIN/COMMIT inside the rollback probe.
  const body = sql.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "")
  assert.doesNotMatch(body, /^\s*(?:BEGIN|COMMIT|ROLLBACK|START TRANSACTION)\s*;/im)
  return body
}

export function assertReviewedIsolatedTarget(args: string[], projectRef: string | undefined): void {
  const confirmations = args.filter((arg) => arg.startsWith("--reviewed-isolated-target="))
  assert.equal(confirmations.length, 1, "A separately reviewed isolated target must be explicitly selected")
  const selected = confirmations[0].slice("--reviewed-isolated-target=".length)
  assert.match(selected, /^[a-z]{20}$/)
  assert.equal(selected, projectRef, "Reviewed isolated target must match the canonical adapter's SUPABASE_PROJECT_REF")
}