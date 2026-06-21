/**
 * scripts/db-reset-local.ts
 *
 * Destructively resets the LOCAL development database by running
 * `prisma migrate reset --force`. Applies all migrations fresh and leaves
 * the schema in a clean state. Does NOT seed data — run `npm run seed:local`
 * afterwards if you need test data.
 *
 * SAFETY GATES
 * ─────────────
 * This script refuses to run unless:
 *   1. SEED_ENV is explicitly "local" or "development"
 *   2. DIRECT_URL does not contain known production project identifiers
 *
 * It will EXIT 1 (loudly) if SEED_ENV is:
 *   - "production" or "prod"
 *   - "preview"
 *   - unset or any unknown value
 *
 * INTENT
 * ──────
 * This script exists for situations where you need a clean database slate:
 * e.g. after a failed migration, conflicting seed data, or schema experiments.
 * For day-to-day work, `supabase db reset` (if using Supabase CLI) or
 * simply re-running `npm run seed:local` is usually sufficient.
 *
 * Usage:
 *   SEED_ENV=local node --import tsx scripts/db-reset-local.ts
 *   (or: npm run db:reset:local)
 */

import "./_loadEnv"
import { execSync } from "child_process"

// ---------------------------------------------------------------------------
// Environment safety check
// ---------------------------------------------------------------------------

const ALLOWED_RESET_ENVS = new Set(["local", "development"])
const BLOCKED_RESET_ENVS = new Set(["production", "prod", "preview"])

function checkEnvironment(): void {
  const seedEnv = process.env.SEED_ENV?.toLowerCase().trim()

  if (!seedEnv) {
    console.error("ERROR: SEED_ENV is not set.")
    console.error("Set SEED_ENV=local before running this script.")
    console.error("This script is only allowed in local/development environments.")
    process.exit(1)
  }

  if (BLOCKED_RESET_ENVS.has(seedEnv)) {
    console.error(`ERROR: SEED_ENV="${seedEnv}" — database reset is not allowed in this environment.`)
    console.error(
      "db:reset:local is only permitted when SEED_ENV=local or SEED_ENV=development.",
    )
    process.exit(1)
  }

  if (!ALLOWED_RESET_ENVS.has(seedEnv)) {
    console.error(`ERROR: Unknown SEED_ENV="${seedEnv}".`)
    console.error(`Allowed values for db:reset:local: ${[...ALLOWED_RESET_ENVS].join(", ")}`)
    process.exit(1)
  }

  // Secondary guard: DIRECT_URL must not contain known production identifiers.
  const directUrl = (process.env.DIRECT_URL ?? "").toLowerCase()
  if (!directUrl) {
    console.error("ERROR: DIRECT_URL is not set.")
    console.error("Set DIRECT_URL to the paidsoon-dev direct (non-pooled) connection string.")
    process.exit(1)
  }

  const prodMarkers = ["paidsoon-prod", "-prod.", ".prod.", "paidsoon_prod"]
  for (const marker of prodMarkers) {
    if (directUrl.includes(marker)) {
      console.error("ERROR: DIRECT_URL appears to reference a production database.")
      console.error(
        "Verify your .env.local points to the paidsoon-dev project (not paidsoon-prod), then retry.",
      )
      process.exit(1)
    }
  }

  console.log(`Environment check passed. SEED_ENV="${seedEnv}"`)
  console.log("DIRECT_URL: does not appear to reference a production project.")
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== PaidSoon — Local Database Reset ===")
  console.log(`Run at: ${new Date().toISOString()}\n`)
  console.log("WARNING: This will DROP and RECREATE the local database schema.")
  console.log("All data in the local database will be lost.\n")

  checkEnvironment()

  console.log("\nRunning: prisma migrate reset --force\n")

  try {
    execSync("npx prisma migrate reset --force", {
      stdio: "inherit",
      env: process.env,
    })
  } catch {
    console.error("\nERROR: prisma migrate reset failed.")
    console.error("Check the output above for details.")
    process.exit(1)
  }

  console.log("\n=== Reset complete ===")
  console.log("The local database schema has been rebuilt from migrations.")
  console.log("Run `npm run seed:local` to repopulate with test data.")
}

main().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
