import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationDir = join(process.cwd(), "prisma", "migrations");

function readMigrationSql(): string {
  return readdirSync(migrationDir)
    .filter((entry) => {
      const entryPath = join(migrationDir, entry);
      return !entry.endsWith(".toml") && !entry.endsWith(".lock") && readdirSync(entryPath).some((child) => child.endsWith(".sql"));
    })
    .flatMap((entry) => {
      const entryPath = join(migrationDir, entry);
      return readdirSync(entryPath)
        .filter((child) => child.endsWith(".sql"))
        .map((child) => readFileSync(join(entryPath, child), "utf8"));
    })
    .join("\n");
}

test("all account_display metadata models are backed by database migrations", () => {
  const sql = readMigrationSql();
  const expectedTables = [
    "user_profiles",
    "spend_insights",
    "cash_plan_snapshots",
    "cash_plan_alerts",
    "cash_plan_data_quality_issues",
    "commit_guard_evaluation_states",
    "commitment_detection_candidates",
  ];

  for (const table of expectedTables) {
    assert.match(sql, new RegExp(`ALTER TABLE[\\s\\S]*"${table}"[\\s\\S]*account_display_revision`, "i"), `Missing migration for ${table}`);
    assert.match(sql, new RegExp(`ALTER TABLE[\\s\\S]*"${table}"[\\s\\S]*account_display_from_date`, "i"), `Missing migration for ${table} cutoff date`);
    assert.match(sql, new RegExp(`ALTER TABLE[\\s\\S]*"${table}"[\\s\\S]*account_display_time_zone`, "i"), `Missing migration for ${table} time zone`);
  }
});
