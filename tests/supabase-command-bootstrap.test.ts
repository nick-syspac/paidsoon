import assert from "node:assert/strict"
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { describe, test } from "node:test"
import vectors from "@/config/supabase-environment-vectors.json"

const ROOT = path.resolve(import.meta.dirname, "..")
const PROJECT_REF = vectors.valid.projectRef
const PASSWORD = vectors.valid.password
const ENCODED_PASSWORD = vectors.valid.encodedPassword

const COMPATIBILITY_ENVIRONMENT = {
  NEXT_PUBLIC_SUPABASE_URL: vectors.valid.publicUrl,
  DATABASE_URL: vectors.valid.databaseUrl,
  DIRECT_URL: vectors.valid.directUrl,
}

const SECRET_VALUES = [
  PASSWORD,
  ENCODED_PASSWORD,
  vectors.valid.databaseUrl,
  vectors.valid.directUrl,
]

function assertSecretsRedacted(output: string) {
  for (const secret of SECRET_VALUES) {
    assert.equal(output.includes(secret), false, "captured output contained a secret-bearing value")
  }
}

function isolatedEnvironment(values: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  delete environment.NEXT_PUBLIC_SUPABASE_URL
  delete environment.DATABASE_URL
  delete environment.DIRECT_URL
  delete environment.SUPABASE_DB_POOLER_HOST
  return { ...environment, ...values }
}

function runNode(args: string[], env: Partial<NodeJS.ProcessEnv>) {
  return spawnSync(process.execPath, ["--import", "tsx", ...args], {
    cwd: ROOT,
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8",
  })
}

describe("framework bootstrap redaction", () => {
  test("Next build validation failure does not expose canonical or derived secrets", () => {
    const result = spawnSync(path.join(ROOT, "node_modules", ".bin", "next"), ["build"], {
      cwd: ROOT,
      env: isolatedEnvironment({
        SUPABASE_PROJECT_REF: "invalid-project-ref",
        SUPABASE_DB_PASSWORD: PASSWORD,
        ...COMPATIBILITY_ENVIRONMENT,
      }),
      encoding: "utf8",
    })
    const output = result.stdout + result.stderr

    assert.notEqual(result.status, 0, output)
    assert.match(output, /SUPABASE_PROJECT_REF_INVALID/)
    assertSecretsRedacted(output)
  })

  test("Prisma conflict failure does not expose canonical or derived secrets", () => {
    const result = runNode(
      ["--input-type=module", "--eval", "import('./prisma.config.ts')"],
      isolatedEnvironment({
        PRISMA_GENERATE_ONLY: "false",
        SUPABASE_PROJECT_REF: PROJECT_REF,
        SUPABASE_DB_PASSWORD: PASSWORD,
        ...COMPATIBILITY_ENVIRONMENT,
        DIRECT_URL: "postgresql://conflicting.invalid/value",
      })
    )
    const output = result.stdout + result.stderr

    assert.notEqual(result.status, 0, output)
    assert.match(output, /SUPABASE_LEGACY_CONFLICT/)
    assertSecretsRedacted(output)
  })
})

describe("Prisma command configuration", () => {
  test("generate mode loads without canonical credentials", () => {
    const result = runNode(
      ["--input-type=module", "--eval", "import('./prisma.config.ts')"],
      isolatedEnvironment({
        PRISMA_GENERATE_ONLY: "true",
        SUPABASE_PROJECT_REF: "",
        SUPABASE_DB_PASSWORD: "",
      })
    )

    assert.equal(result.status, 0, result.stderr)
    assert.doesNotMatch(result.stdout + result.stderr, /postgres(?:ql)?:\/\//)
    assertSecretsRedacted(result.stdout + result.stderr)
  })

  test("migration mode selects the session-pooler port without connecting", () => {
    const expression = [
      "const imported = await import('./prisma.config.ts')",
      "const config = imported.default.default ?? imported.default",
      "const parsed = new URL(config.datasource.url)",
      "console.log(JSON.stringify({ port: parsed.port, protocol: parsed.protocol }))",
    ].join(";")
    const result = runNode(
      ["--input-type=module", "--eval", expression],
      isolatedEnvironment({
        PRISMA_GENERATE_ONLY: "false",
        SUPABASE_PROJECT_REF: PROJECT_REF,
        SUPABASE_DB_PASSWORD: PASSWORD,
        ...COMPATIBILITY_ENVIRONMENT,
      })
    )

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /"port":"5432"/)
    assert.match(result.stdout, /"protocol":"postgresql:"/)
    assertSecretsRedacted(result.stdout + result.stderr)
  })
})

describe("database script bootstrap", () => {
  test("database scripts fail in the common bootstrap before their own startup", () => {
    for (const script of [
      "scripts/seed-preview.ts",
      "scripts/db-reset-local.ts",
      "scripts/verify-seed.ts",
    ]) {
      const result = runNode(
        [script],
        isolatedEnvironment({
          SUPABASE_PROJECT_REF: "",
          SUPABASE_DB_PASSWORD: "",
        })
      )
      const output = result.stdout + result.stderr

      assert.notEqual(result.status, 0, script)
      assert.match(output, /SUPABASE_PROJECT_REF_INVALID/, script)
      assert.doesNotMatch(output, /postgres(?:ql)?:\/\//, script)
      assertSecretsRedacted(output)
    }
  })
})

describe("psql child process isolation", () => {
  test("passes credentials through PG fields without shell interpolation", async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "paidsoon-psql-"))
    const capturePath = path.join(temporaryDirectory, "capture.json")
    const executablePath = path.join(temporaryDirectory, "psql")
    const executable = `#!/usr/bin/env node
const fs = require("node:fs")
fs.writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ argv: process.argv.slice(2), env: process.env }))
`

    try {
      await writeFile(executablePath, executable)
      await chmod(executablePath, 0o755)
      const result = runNode(
        ["scripts/run-psql.ts", "prisma/rls-policies.sql"],
        isolatedEnvironment({
          PATH: `${temporaryDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
          SUPABASE_PROJECT_REF: PROJECT_REF,
          SUPABASE_DB_PASSWORD: PASSWORD,
          ...COMPATIBILITY_ENVIRONMENT,
        })
      )
      const output = result.stdout + result.stderr

      assert.equal(result.status, 0, output)
      assert.doesNotMatch(output, /postgres(?:ql)?:\/\//)
      assertSecretsRedacted(output)

      const capture = JSON.parse(await readFile(capturePath, "utf8")) as {
        argv: string[]
        env: Record<string, string>
      }
      assert.deepEqual(capture.argv.slice(0, 3), ["-v", "ON_ERROR_STOP=1", "-f"])
      assert.equal(capture.env.PGPORT, "5432")
      assert.equal(capture.env.PGUSER, `postgres.${PROJECT_REF}`)
      assert.equal(capture.env.PGPASSWORD, PASSWORD)
      assert.equal(capture.env.SUPABASE_DB_PASSWORD, undefined)
      assert.equal(capture.env.DATABASE_URL, undefined)
      assert.equal(capture.env.DIRECT_URL, undefined)
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })

  test("does not expose credentials when psql exits unsuccessfully", async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "paidsoon-psql-failure-"))
    const executablePath = path.join(temporaryDirectory, "psql")

    try {
      await writeFile(executablePath, "#!/bin/sh\nexit 23\n")
      await chmod(executablePath, 0o755)
      const result = runNode(
        ["scripts/run-psql.ts", "prisma/rls-policies.sql"],
        isolatedEnvironment({
          PATH: `${temporaryDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
          SUPABASE_PROJECT_REF: PROJECT_REF,
          SUPABASE_DB_PASSWORD: PASSWORD,
          ...COMPATIBILITY_ENVIRONMENT,
        })
      )
      const output = result.stdout + result.stderr

      assert.equal(result.status, 23, output)
      assertSecretsRedacted(output)
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })
})