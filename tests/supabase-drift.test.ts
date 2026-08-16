import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { scanSupabaseDrift } from "@/lib/config/supabaseDrift"

describe("Supabase environment drift scanner", () => {
  test("detects each prohibited construction without retaining matched text", () => {
    const files = [
      { path: "src/project.ts", content: 'const url = "https://abcdefghijklmnopqrst.supabase.co"' },
      { path: "src/pooler.ts", content: 'const host = "aws-1-region.pooler.supabase.com"' },
      { path: "src/database.ts", content: 'const url = "postgresql://user:secret@host/db"' },
      { path: "src/legacy.ts", content: "const url = process.env.DATABASE_URL" },
    ]
    const findings = scanSupabaseDrift(files)

    assert.deepEqual(
      findings.map((finding) => finding.ruleId).sort(),
      [
        "SUPABASE_DRIFT_LEGACY_ENV_READ",
        "SUPABASE_DRIFT_POOLER_HOST",
        "SUPABASE_DRIFT_POSTGRES_URL",
        "SUPABASE_DRIFT_PROJECT_URL",
      ]
    )
    const serialized = JSON.stringify(findings)
    assert.doesNotMatch(serialized, /abcdefghijklmnopqrst|secret|postgresql:\/\//)
  })

  test("allows authoritative adapters, vectors, examples, tests, and history", () => {
    const content = [
      "https://abcdefghijklmnopqrst.supabase.co",
      "aws-1-region.pooler.supabase.com",
      "postgresql://user:password@host/db",
      "process.env.DATABASE_URL",
    ].join("\n")
    const files = [
      { path: "config/supabase-environment-vectors.json", content },
      { path: "tests/fixture.test.ts", content },
      { path: "openspec/changes/archived/spec.md", content },
      { path: "prisma/migrations/20260101000000_old/migration.sql", content },
      { path: "scripts/verify-supabase-client-boundary.ts", content: 'const marker = "postgresql://"' },
    ]

    assert.deepEqual(scanSupabaseDrift(files), [])
  })
})