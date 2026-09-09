import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, test } from "node:test"

describe("RunwayGuard migration contract", () => {
  test("creates the runway_guard tables expected by Prisma schema", () => {
    const migrationsDir = path.join(process.cwd(), "prisma", "migrations")
    const migrationFiles = readdirSync(migrationsDir, { recursive: true })
      .filter((name) => typeof name === "string" && name.endsWith(".sql"))
      .map((name) => path.join(migrationsDir, String(name)))

    const sql = migrationFiles
      .map((file) => readFileSync(file, "utf8"))
      .join("\n")

    assert.match(sql, /CREATE TABLE "runway_guard_settings"/i)
    assert.match(sql, /CREATE TABLE "runway_guard_snapshots"/i)
    assert.match(sql, /CREATE TABLE "runway_guard_alerts"/i)
    assert.match(sql, /CREATE TABLE "runway_guard_alert_events"/i)
    assert.match(sql, /CREATE TABLE "runway_guard_scenarios"/i)
  })
})
