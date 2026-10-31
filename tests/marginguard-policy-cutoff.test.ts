import assert from "node:assert/strict"
import test from "node:test"

test("MarginGuard excludes rows older than the account display cutoff", async () => {
  process.env.SUPABASE_PROJECT_REF ??= "abcdefghijklmnopqrst"
  process.env.SUPABASE_DB_PASSWORD ??= "test-password"

  const { filterMarginSourceRowsByAccountCutoff, resolveMarginEffectiveFrom } = await import("@/lib/marginguard/service")

  const cutoff = new Date("2026-09-01T00:00:00.000Z")

  const rows = [
    { id: "old", dueDate: new Date("2026-08-15T00:00:00.000Z") },
    { id: "current", dueDate: new Date("2026-09-01T00:00:00.000Z") },
    { id: "future", dueDate: new Date("2026-10-05T00:00:00.000Z") },
  ]

  const filtered = filterMarginSourceRowsByAccountCutoff(rows, cutoff, "dueDate")

  assert.deepEqual(filtered.map((row) => row.id), ["current", "future"])
  assert.deepEqual(resolveMarginEffectiveFrom(new Date("2026-09-01T00:00:00.000Z"), cutoff).toISOString(), cutoff.toISOString())
})
