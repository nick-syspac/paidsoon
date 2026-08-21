import assert from "node:assert/strict"
import test from "node:test"
import vectors from "@/config/supabase-environment-vectors.json"
import {
  createDatabaseSupabaseConfig,
  createPublicSupabaseConfig,
  SupabaseConfigError,
} from "@/lib/config/supabaseEnvironment"
import {
  materializeSupabaseEnvironment,
  resolveSupabaseEnvironment,
} from "@/lib/config/supabaseEnvironmentRuntime"

test("constructs the canonical public and database URLs", () => {
  const config = createDatabaseSupabaseConfig({
    projectRef: vectors.valid.projectRef,
    password: vectors.valid.password,
  })

  assert.equal(config.publicUrl, vectors.valid.publicUrl)
  assert.equal(config.databaseUrl, vectors.valid.databaseUrl)
  assert.equal(config.directUrl, vectors.valid.directUrl)
  assert.equal(new URL(config.databaseUrl).password, vectors.valid.encodedPassword)
  assert.equal(decodeURIComponent(new URL(config.directUrl).password), vectors.valid.password)
})

test("public-only construction does not require a database password", () => {
  assert.deepEqual(createPublicSupabaseConfig(vectors.valid.projectRef), {
    projectRef: vectors.valid.projectRef,
    publicUrl: vectors.valid.publicUrl,
  })
})

test("rejects missing and malformed project references", () => {
  assert.throws(
    () => createPublicSupabaseConfig(undefined),
    (error: unknown) =>
      error instanceof SupabaseConfigError &&
      error.code === "SUPABASE_PROJECT_REF_MISSING"
  )

  for (const projectRef of vectors.invalidProjectRefs) {
    assert.throws(
      () => createPublicSupabaseConfig(projectRef),
      (error: unknown) =>
        error instanceof SupabaseConfigError &&
        error.code === "SUPABASE_PROJECT_REF_INVALID"
    )
  }
})

test("rejects missing passwords and invalid pooler hosts without exposing inputs", () => {
  assert.throws(
    () =>
      createDatabaseSupabaseConfig({
        projectRef: vectors.valid.projectRef,
        password: undefined,
      }),
    (error: unknown) =>
      error instanceof SupabaseConfigError &&
      error.code === "SUPABASE_DB_PASSWORD_MISSING"
  )

  for (const poolerHost of vectors.invalidPoolerHosts) {
    assert.throws(
      () =>
        createDatabaseSupabaseConfig({
          projectRef: vectors.valid.projectRef,
          password: vectors.valid.password,
          poolerHost,
        }),
      (error: unknown) => {
        const rendered = String(error)
        return (
          error instanceof SupabaseConfigError &&
          error.code === "SUPABASE_POOLER_HOST_INVALID" &&
          !rendered.includes(vectors.valid.password) &&
          !rendered.includes(vectors.valid.encodedPassword)
        )
      }
    )
  }
})

test("redacted configuration errors never retain a malformed secret", () => {
  const malformedSecret = "fake-secret-\ud800"

  assert.throws(
    () =>
      createDatabaseSupabaseConfig({
        projectRef: vectors.valid.projectRef,
        password: malformedSecret,
      }),
    (error: unknown) => {
      const rendered = JSON.stringify(error, Object.getOwnPropertyNames(error))
      return (
        error instanceof SupabaseConfigError &&
        error.code === "SUPABASE_DB_PASSWORD_INVALID" &&
        !rendered.includes(malformedSecret)
      )
    }
  )
})

test("materializes only values required by each lifecycle mode", () => {
  const publicEnv: Record<string, string | undefined> = {
    SUPABASE_PROJECT_REF: vectors.valid.projectRef,
  }
  const publicConfig = materializeSupabaseEnvironment({
    mode: "public",
    env: publicEnv,
  })
  assert.deepEqual(publicConfig, { publicUrl: vectors.valid.publicUrl })
  assert.equal(publicEnv.NEXT_PUBLIC_SUPABASE_URL, vectors.valid.publicUrl)
  assert.equal(publicEnv.DATABASE_URL, undefined)
  assert.equal(publicEnv.DIRECT_URL, undefined)

  const runtimeEnv: Record<string, string | undefined> = {
    SUPABASE_PROJECT_REF: vectors.valid.projectRef,
    SUPABASE_DB_PASSWORD: vectors.valid.password,
  }
  materializeSupabaseEnvironment({ mode: "runtime", env: runtimeEnv })
  assert.equal(runtimeEnv.DATABASE_URL, vectors.valid.databaseUrl)
  assert.equal(runtimeEnv.DIRECT_URL, undefined)

  const migrationEnv: Record<string, string | undefined> = {
    SUPABASE_PROJECT_REF: vectors.valid.projectRef,
    SUPABASE_DB_PASSWORD: vectors.valid.password,
  }
  materializeSupabaseEnvironment({ mode: "migration", env: migrationEnv })
  assert.equal(migrationEnv.DATABASE_URL, undefined)
  assert.equal(migrationEnv.DIRECT_URL, vectors.valid.directUrl)
})

test("accepts matching legacy values and reports variable names only", () => {
  const matched: string[] = []
  const config = resolveSupabaseEnvironment({
    mode: "database-admin",
    env: {
      SUPABASE_PROJECT_REF: vectors.valid.projectRef,
      SUPABASE_DB_PASSWORD: vectors.valid.password,
      NEXT_PUBLIC_SUPABASE_URL: vectors.valid.publicUrl,
      DATABASE_URL: vectors.valid.databaseUrl,
      DIRECT_URL: vectors.valid.directUrl,
    },
    onLegacyMatch: (variableName) => matched.push(variableName),
  })

  assert.equal(config.databaseUrl, vectors.valid.databaseUrl)
  assert.deepEqual(matched, [
    "NEXT_PUBLIC_SUPABASE_URL",
    "DATABASE_URL",
    "DIRECT_URL",
  ])
  assert.equal(matched.join(" ").includes(vectors.valid.password), false)
})

test("rejects conflicting legacy values without exposing either value", () => {
  const conflictingValue = "postgresql://conflicting.invalid"

  assert.throws(
    () =>
      resolveSupabaseEnvironment({
        mode: "runtime",
        env: {
          SUPABASE_PROJECT_REF: vectors.valid.projectRef,
          SUPABASE_DB_PASSWORD: vectors.valid.password,
          DATABASE_URL: conflictingValue,
        },
      }),
    (error: unknown) => {
      const rendered = JSON.stringify(error, Object.getOwnPropertyNames(error))
      return (
        error instanceof SupabaseConfigError &&
        error.code === "SUPABASE_LEGACY_CONFLICT" &&
        error.variableName === "DATABASE_URL" &&
        !rendered.includes(conflictingValue) &&
        !rendered.includes(vectors.valid.password) &&
        !rendered.includes(vectors.valid.databaseUrl)
      )
    }
  )
})