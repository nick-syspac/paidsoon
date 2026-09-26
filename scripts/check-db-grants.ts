/**
 * Verifies required base-table privileges for the `authenticated` role.
 *
 * Why this exists:
 * - RLS policies alone are not enough.
 * - Postgres checks table privileges first; missing grants fail before RLS can run.
 *
 * Run with:
 *   node --import tsx scripts/check-db-grants.ts
 */

import "./_loadEnv"
import { prismaAdmin } from "@/lib/db/admin"

type Privilege = "SELECT" | "INSERT" | "UPDATE" | "DELETE"

type GrantExpectation = {
  table: string
  privileges: Privilege[]
}

const ROLE = "authenticated"

// Keep this list tight and explicit so failures are actionable.
const REQUIRED_GRANTS: GrantExpectation[] = [
  { table: "public.user_profiles", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.invoice_connections", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.tracked_invoices", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.financial_invoices", privileges: ["SELECT"] },
  { table: "public.financial_contacts", privileges: ["SELECT"] },
  { table: "public.email_logs", privileges: ["SELECT"] },
  { table: "public.promise_to_pay", privileges: ["SELECT"] },
  { table: "public.promise_escalation_policies", privileges: ["SELECT"] },
  { table: "public.arrangement_invoice_coverages", privileges: ["SELECT"] },
  { table: "public.arrangements", privileges: ["SELECT"] },
  { table: "public.invoice_payments", privileges: ["SELECT"] },
  { table: "public.customers", privileges: ["SELECT"] },
  { table: "public.tax_buffer_configurations", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.tax_reserve_categories", privileges: ["SELECT", "INSERT"] },
  { table: "public.tax_buffer_obligations", privileges: ["SELECT"] },
  { table: "public.tax_buffer_snapshots", privileges: ["SELECT", "INSERT"] },
  { table: "public.tax_buffer_overrides", privileges: ["SELECT"] },
  { table: "public.tax_buffer_events", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.imported_bills", privileges: ["SELECT"] },
  { table: "public.cash_forecast_snapshots", privileges: ["SELECT"] },
  { table: "public.cash_plan_snapshots", privileges: ["SELECT"] },
  { table: "public.cash_plans", privileges: ["SELECT"] },
  { table: "public.commit_guard_settings", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.commitments", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.commitment_events", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.commitment_detection_candidates", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.cost_guard_alerts", privileges: ["SELECT"] },
  { table: "public.runway_guard_settings", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.runway_guard_snapshots", privileges: ["SELECT"] },
  { table: "public.cash_plan_settings", privileges: ["SELECT"] },
  { table: "public.accounting_connections", privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"] },
  { table: "public.accounting_sync_runs", privileges: ["SELECT"] },
  { table: "public.oauth_states", privileges: ["SELECT", "INSERT", "DELETE"] },
  { table: "public.schedules", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.email_settings", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.invoice_import_batches", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.spend_import_batches", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.cost_guard_settings", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.margin_guard_settings", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.margin_guard_targets", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.margin_classification_rules", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.margin_cost_classifications", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.margin_alerts", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.margin_alert_events", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.margin_snapshots", privileges: ["SELECT"] },
  { table: "public.margin_scenarios", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.margin_opportunities", privileges: ["SELECT"] },
  { table: "public.imported_bank_transactions", privileges: ["SELECT"] },
  { table: "public.supplier_profiles", privileges: ["SELECT"] },
  { table: "public.owners_digest_settings", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.owners_digest_snapshots", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.owners_digest_items", privileges: ["SELECT", "INSERT", "DELETE"] },
  { table: "public.owners_digest_metrics", privileges: ["SELECT", "INSERT", "DELETE"] },
  { table: "public.owners_digest_provider_runs", privileges: ["SELECT", "INSERT", "DELETE"] },
  { table: "public.owners_digest_deliveries", privileges: ["SELECT"] },
  { table: "public.deposit_guard_jobs", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.deposit_requests", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.payment_milestones", privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"] },
  { table: "public.deposit_payments", privileges: ["SELECT", "INSERT"] },
  { table: "public.deposit_reminders", privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"] },
  { table: "public.deposit_guard_events", privileges: ["SELECT", "INSERT"] },
  { table: "public.deposit_guard_settings", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.spend_insights", privileges: ["SELECT", "UPDATE"] },
  { table: "public.cost_guard_forecasts", privileges: ["SELECT", "INSERT"] },
  { table: "public.cost_guard_rules", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { table: "public.cost_guard_baselines", privileges: ["SELECT"] },
  { table: "public.cost_guard_alerts", privileges: ["SELECT", "UPDATE"] },
  { table: "public.cost_guard_alert_events", privileges: ["SELECT", "INSERT"] },
  { table: "public.financial_payments", privileges: ["SELECT"] },
]

type ExistsRow = { exists: boolean }
type PrivilegeRow = { has_privilege: boolean }

async function roleExists(roleName: string): Promise<boolean> {
  const rows = await prismaAdmin.$queryRawUnsafe<ExistsRow[]>(
    "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists",
    roleName,
  )
  return rows[0]?.exists ?? false
}

async function hasTablePrivilege(roleName: string, table: string, privilege: Privilege): Promise<boolean> {
  // spend_insights intentionally grants UPDATE at column level only.
  if (table === "public.spend_insights" && privilege === "UPDATE") {
    const rows = await prismaAdmin.$queryRawUnsafe<PrivilegeRow[]>(
      "SELECT has_any_column_privilege($1, $2, $3) AS has_privilege",
      roleName,
      table,
      privilege,
    )
    return rows[0]?.has_privilege ?? false
  }

  const rows = await prismaAdmin.$queryRawUnsafe<PrivilegeRow[]>(
    "SELECT has_table_privilege($1, $2, $3) AS has_privilege",
    roleName,
    table,
    privilege,
  )
  return rows[0]?.has_privilege ?? false
}

async function main(): Promise<void> {
  const exists = await roleExists(ROLE)
  if (!exists) {
    console.error(`DB_GRANT_CHECK_FAILED: role '${ROLE}' does not exist.`)
    process.exit(1)
  }

  const missing: Array<{ table: string; privilege: Privilege }> = []

  for (const expectation of REQUIRED_GRANTS) {
    for (const privilege of expectation.privileges) {
      const ok = await hasTablePrivilege(ROLE, expectation.table, privilege)
      if (!ok) {
        missing.push({ table: expectation.table, privilege })
      }
    }
  }

  if (missing.length > 0) {
    console.error("DB_GRANT_CHECK_FAILED: missing authenticated role table privileges:")
    for (const item of missing) {
      console.error(`- ${item.privilege} on ${item.table}`)
    }

    const tables = Array.from(new Set(missing.map((item) => item.table)))
    const grantsByTable = new Map<string, Set<Privilege>>()
    for (const item of missing) {
      const existing = grantsByTable.get(item.table) ?? new Set<Privilege>()
      existing.add(item.privilege)
      grantsByTable.set(item.table, existing)
    }

    console.error("\nSuggested SQL:")
    console.error("BEGIN;")
    for (const table of tables) {
      const bareTable = table.replace(/^public\./, "")
      const privileges = Array.from(grantsByTable.get(table) ?? []).join(", ")
      console.error(`ALTER TABLE ${bareTable} ENABLE ROW LEVEL SECURITY;`)
      console.error(`GRANT ${privileges} ON TABLE ${bareTable} TO authenticated;`)
    }
    console.error("COMMIT;")
    process.exit(1)
  }

  console.log("DB grant check passed.")
}

main()
  .catch((error: unknown) => {
    if (error instanceof Error) {
      console.error(`DB_GRANT_CHECK_FAILED: ${error.message}`)
    } else {
      console.error("DB_GRANT_CHECK_FAILED: unknown error")
    }
    process.exit(1)
  })
  .finally(async () => {
    await prismaAdmin.$disconnect()
  })
