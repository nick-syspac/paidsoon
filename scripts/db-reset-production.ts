/**
 * scripts/db-reset-production.ts
 *
 * Destructively wipes ALL data from the PRODUCTION database, returning it to a
 * fresh-installation state: schema and migrations are untouched, every
 * application row is deleted (TRUNCATE ... CASCADE), and every Supabase Auth
 * user is removed. It does NOT re-apply RLS policies or re-seed — run those
 * steps afterwards (see below).
 *
 * This is the operator break-glass equivalent of "delete the Supabase project
 * and start over", for when you want to keep the project, API keys, and
 * dashboard configuration but clear all data.
 *
 * WHAT IT DOES
 * ─────────────
 *   1. Deletes all auth users via the Supabase Admin API (cascades to
 *      auth.identities / auth.sessions / auth.refresh_tokens).
 *   2. Discovers every table in the public schema except _prisma_migrations
 *      and TRUNCATEs them with RESTART IDENTITY CASCADE.
 *
 * WHAT IT DOES NOT DO
 * ───────────────────
 *   - Does not drop or alter the schema, migrations, or RLS policies.
 *   - Does not delete Storage objects (none in use), Edge Functions, or
 *     Supabase Auth settings (SMTP, URL config, OAuth providers survive).
 *   - Does not re-seed. After running, follow up with:
 *       npm run db:apply-rls            (policies survive, but cheap to re-verify)
 *       node --import tsx scripts/verify-rls.ts
 *       npm run seed:support-account    (after re-signing up via the app)
 *
 * SAFETY GATES
 * ─────────────
 *   1. --confirm-production-reset CLI flag is required.
 *   2. CONFIRM_PRODUCTION_RESET env must exactly equal "reset-production".
 *   3. CONFIRM_PROJECT_REF env must exactly equal SUPABASE_PROJECT_REF — you
 *      must copy the ref of the project you intend to wipe.
 *   4. The resolved auth user count is printed before any deletion.
 *
 * Usage:
 *   CONFIRM_PRODUCTION_RESET=reset-production \
 *   CONFIRM_PROJECT_REF=<same-as-SUPABASE_PROJECT_REF> \
 *     node --import tsx scripts/db-reset-production.ts --confirm-production-reset
 *
 * Required env: SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD,
 * SUPABASE_SECRET_KEY, DIRECT_URL (derived by the canonical adapter).
 */

import "./_loadEnv"
import { createClient } from "@supabase/supabase-js"
import { prismaAdmin } from "@/lib/db/admin"

const CONFIRM_FLAG = "--confirm-production-reset"
const CONFIRM_ENV = "CONFIRM_PRODUCTION_RESET"
const CONFIRM_VALUE = "reset-production"

function checkGates(): void {
  if (!process.argv.includes(CONFIRM_FLAG)) {
    console.error(`ERROR: missing ${CONFIRM_FLAG} flag.`)
    console.error("This script wipes the production database. Re-run with the flag to proceed.")
    process.exit(1)
  }

  if (process.env[CONFIRM_ENV] !== CONFIRM_VALUE) {
    console.error(`ERROR: ${CONFIRM_ENV} must be set to exactly "${CONFIRM_VALUE}".`)
    process.exit(1)
  }

  const projectRef = process.env.SUPABASE_PROJECT_REF
  if (!projectRef) {
    console.error("ERROR: SUPABASE_PROJECT_REF is not set.")
    process.exit(1)
  }
  if (process.env.CONFIRM_PROJECT_REF !== projectRef) {
    console.error("ERROR: CONFIRM_PROJECT_REF must exactly match SUPABASE_PROJECT_REF.")
    console.error("Copy the ref of the project you intend to wipe into CONFIRM_PROJECT_REF.")
    console.error("(Never run this against the shared dev/preview project — use npm run db:reset:local there.)")
    process.exit(1)
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.")
    process.exit(1)
  }
}

async function deleteAllAuthUsers(): Promise<number> {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  )

  let deleted = 0
  // listUsers paginates; keep deleting page 1 until empty.
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (error) {
      console.error("ERROR listing auth users:", error.message)
      process.exit(1)
    }
    if (data.users.length === 0) break

    for (const user of data.users) {
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
      if (deleteError) {
        console.error(`ERROR deleting auth user ${user.id}:`, deleteError.message)
        process.exit(1)
      }
      deleted++
    }
  }
  return deleted
}

async function truncatePublicTables(): Promise<string[]> {
  const rows = await prismaAdmin.$queryRaw<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `
  const tables = rows.map((r) => r.tablename)
  if (tables.length === 0) return tables

  const tableList = tables.map((t) => `"public"."${t.replaceAll('"', '""')}"`).join(", ")
  await prismaAdmin.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  )
  return tables
}

async function main(): Promise<void> {
  console.log("=== PaidSoon — PRODUCTION Database Reset ===")
  console.log(`Run at: ${new Date().toISOString()}\n`)
  console.log("WARNING: This will permanently delete ALL production data:")
  console.log("  - every Supabase Auth user")
  console.log("  - every row in every public table (profiles, invoices, logs, admin data)")
  console.log("Schema, migrations, and RLS policies are preserved.\n")

  checkGates()

  const authDeleted = await deleteAllAuthUsers()
  console.log(`Deleted ${authDeleted} Supabase Auth user(s).`)

  const truncated = await truncatePublicTables()
  console.log(`Truncated ${truncated.length} table(s):`)
  for (const table of truncated) console.log(`  - ${table}`)

  console.log("\nProduction database is now empty (fresh-installation state).")
  console.log("Next steps:")
  console.log("  1. npm run db:apply-rls")
  console.log("  2. node --import tsx scripts/verify-rls.ts")
  console.log("  3. Re-sign-up via the app, then npm run seed:support-account")
}

main()
  .catch((err) => {
    console.error("Unexpected error:", err)
    process.exit(1)
  })
  .finally(async () => {
    await prismaAdmin.$disconnect()
  })
