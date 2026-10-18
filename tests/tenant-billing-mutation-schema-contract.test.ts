import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// Static artifact contracts only. No Prisma client, provider, SQL executor or DB.
const migrationPath = "prisma/migrations/20261015095612_add_tenant_billing_mutation_journal/migration.sql"
const migration = readFileSync(migrationPath, "utf8")
const constraints = readFileSync("prisma/tenant-billing-mutation-constraints.sql", "utf8")
const schema = readFileSync("prisma/schema.prisma", "utf8")
const compact = (value: string): string => value.replace(/\s+/g, " ").trim()
const withoutComments = (value: string): string => value.replace(/--[^\n]*/g, "").trim()

function modelColumns(model: string): string[] {
  const body = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1]
  assert.ok(body, `Missing ${model}`)
  const enums = new Set([...schema.matchAll(/^enum (\w+)/gm)].map((match) => match[1]))
  return body.split("\n").flatMap((line) => {
    const field = line.match(/^\s+(\w+)\s+(\w+)(\?)?\s*(.*)$/)
    if (!field) return []
    const [, name, type, optional, attributes] = field
    const sqlType = attributes.includes("@db.Uuid") ? "UUID"
      : attributes.includes("@db.Timestamptz(3)") ? "TIMESTAMPTZ(3)"
      : ({ String: "TEXT", Int: "INTEGER", Json: "JSONB" } as Record<string, string>)[type]
        ?? (enums.has(type) ? `"${type}"` : undefined)
    if (!sqlType) return [] // Relations do not create columns.
    const column = attributes.match(/@map\("([^"]+)"\)/)?.[1] ?? name
    const defaultValue = attributes.includes("@default(pending)") ? " DEFAULT 'pending'"
      : attributes.includes("@default(0)") ? " DEFAULT 0"
      : attributes.includes("@default(now())") ? " DEFAULT CURRENT_TIMESTAMP" : ""
    return [`"${column}" ${sqlType}${optional ? "" : " NOT NULL"}${defaultValue}`]
  })
}

test("offline journal migration contains only the approved additive statements", () => {
  const statements = withoutComments(migration).split(";").map(compact).filter(Boolean)
  assert.equal(statements.length, 16)
  assert.deepEqual(statements.map((sql) => sql.match(/^(CREATE TYPE|CREATE TABLE|CREATE UNIQUE INDEX|CREATE INDEX|ALTER TABLE)/)?.[1]), [
    "CREATE TYPE", "CREATE TYPE", "CREATE TYPE", "ALTER TABLE", "CREATE TABLE", "CREATE TABLE",
    "CREATE INDEX", "CREATE INDEX", "CREATE INDEX", "CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX",
    "CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX", "ALTER TABLE", "ALTER TABLE", "ALTER TABLE",
  ])
  const alters = statements.filter((sql) => sql.startsWith("ALTER TABLE"))
  assert.equal(alters[0], 'ALTER TABLE "user_profiles" ADD COLUMN "pending_billing_mutation_id" UUID')
  assert.ok(alters.slice(1).every((sql) => / ADD CONSTRAINT .* FOREIGN KEY /.test(sql)))
  for (const sql of statements) assert.doesNotMatch(sql, /^(DROP|DELETE|TRUNCATE|UPDATE|INSERT|GRANT|REVOKE)\b/)
  assert.doesNotMatch(migration, /stripe_billing_webhook_events|processing_token|processing_lease_until/)
})

test("generated journal and step columns exactly match canonical Prisma declarations", () => {
  const tables = [...migration.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g)]
  assert.deepEqual(tables.map((match) => match[1]), ["tenant_billing_mutations", "tenant_billing_mutation_steps"])
  for (const [model, table] of [["TenantBillingMutation", "tenant_billing_mutations"], ["TenantBillingMutationStep", "tenant_billing_mutation_steps"]]) {
    const body = tables.find((match) => match[1] === table)?.[2]
    assert.ok(body)
    const columns = body.split("\n").map((line) => line.trim().replace(/,$/, "")).filter((line) => line.startsWith('"'))
    assert.deepEqual(columns, modelColumns(model))
    assert.match(body, new RegExp(`CONSTRAINT "${table}_pkey" PRIMARY KEY \\("id"\\)`))
  }
  assert.equal(modelColumns("TenantBillingMutation").length, 30)
  assert.equal(modelColumns("TenantBillingMutationStep").length, 25)
})

test("generated action and outcome enums exactly match schema and approved contract", () => {
  const expected = {
    TenantBillingMutationAction: ["customer_create", "checkout_create", "upgrade", "cancel", "cancel_portal_create", "schedule_downgrade", "undo_downgrade", "portal_create"],
    TenantBillingMutationStatus: ["pending", "reconciliation_required", "succeeded", "failed", "superseded"],
    TenantBillingMutationStepStatus: ["pending", "reconciliation_required", "succeeded", "failed"],
  }
  assert.equal([...migration.matchAll(/CREATE TYPE /g)].length, 3)
  for (const [name, values] of Object.entries(expected)) {
    const body = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\}`))?.[1]
    assert.ok(body)
    assert.deepEqual(body.trim().split(/\s+/), values)
    assert.ok(migration.includes(`CREATE TYPE "${name}" AS ENUM (${values.map((value) => `'${value}'`).join(", ")});`))
  }
})

test("journal indexes enforce global keys and tenant-scoped step identity", () => {
  const indexes = [...migration.matchAll(/CREATE (UNIQUE )?INDEX "([^"]+)" ON "([^"]+)"\(([^;]+)\);/g)]
    .map((match) => [Boolean(match[1]), match[3], match[4]])
  assert.deepEqual(indexes, [
    [false, "tenant_billing_mutations", '"user_id", "created_at"'],
    [false, "tenant_billing_mutations", '"user_id", "parent_mutation_id"'],
    [false, "tenant_billing_mutations", '"status", "lease_expires_at"'],
    [true, "tenant_billing_mutations", '"user_id", "id"'],
    [true, "tenant_billing_mutation_steps", '"stripe_idempotency_key"'],
    [true, "tenant_billing_mutation_steps", '"user_id", "mutation_id", "step_key"'],
    [true, "tenant_billing_mutation_steps", '"user_id", "mutation_id", "sequence"'],
  ])
})

test("journal parent and step foreign keys include tenant identity and retain history", () => {
  const references = [...migration.matchAll(/ALTER TABLE "([^"]+)" ADD CONSTRAINT "[^"]+" FOREIGN KEY (.*?);/g)]
    .map((match) => [match[1], match[2]])
  assert.deepEqual(references, [
    ["tenant_billing_mutations", '("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE'],
    ["tenant_billing_mutations", '("user_id", "parent_mutation_id") REFERENCES "tenant_billing_mutations"("user_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION'],
    ["tenant_billing_mutation_steps", '("user_id", "mutation_id") REFERENCES "tenant_billing_mutations"("user_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION'],
  ])
})

test("separate unapplied CHECK artifact enforces actor equality and reservation exclusivity only", () => {
  assert.deepEqual(withoutComments(constraints).split(";").map(compact).filter(Boolean), [
    "BEGIN",
    "ALTER TABLE public.tenant_billing_mutations ADD CONSTRAINT tenant_billing_mutations_actor_matches_tenant_check CHECK (actor_user_id = user_id)",
    "ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_billing_reservations_exclusive_check CHECK (pending_trial_operation_id IS NULL OR pending_billing_mutation_id IS NULL)",
    "COMMIT",
  ])
  assert.match(constraints, /UNAPPLIED; no live enforcement proof/)
  assert.match(schema, /Mutual exclusion CHECK: tenant-billing-mutation-constraints\.sql/)
  assert.match(schema, /Actor CHECK: tenant-billing-mutation-constraints\.sql/)
  assert.doesNotMatch(migration, /\bCHECK\s*\(/)
})

test("offline generation documentation keeps database validation and rollout explicitly unfinished", () => {
  const tasks = readFileSync("openspec/changes/add-superuser-tenant-trial-access/tasks.md", "utf8")
  assert.match(tasks, /- \[ \] 3\.8 .*Approved partial alternative:/)
  assert.match(tasks, /- \[ \] 9\.3 .*Static contracts are not live proof/)
  assert.match(tasks, /- \[ \] 3\.9 /)
  const design = readFileSync("openspec/changes/add-superuser-tenant-trial-access/design.md", "utf8")
  assert.match(design, /Offline generation is not database validation or application authorization/)
  assert.match(design, /no exposed intermediate journal tables/)
})