import "./_loadEnvFiles"

import path from "node:path"
import { promises as fs } from "node:fs"
import { createPublicSupabaseConfig } from "@/lib/config/supabaseEnvironment"

async function listFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name)
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath]
    })
  )
  return nested.flat()
}

async function main(): Promise<void> {
  const projectRef = process.env.SUPABASE_PROJECT_REF
  const password = process.env.SUPABASE_DB_PASSWORD
  if (!password) {
    throw new Error("SUPABASE_DB_PASSWORD_MISSING: client boundary check requires a fake password")
  }

  const { publicUrl } = createPublicSupabaseConfig(projectRef)
  const clientSource = await fs.readFile(path.resolve("lib/supabase/client.ts"), "utf8")
  const forbiddenClientImports = [
    "supabaseEnvironment.server",
    "supabaseEnvironmentRuntime",
    "SUPABASE_DB_PASSWORD",
  ]
  if (forbiddenClientImports.some((marker) => clientSource.includes(marker))) {
    throw new Error("SUPABASE_CLIENT_SOURCE_BOUNDARY_FAILED")
  }

  const staticDirectory = path.resolve(".next/static")
  const files = await listFiles(staticDirectory)
  const forbiddenArtifactValues = [
    password,
    encodeURIComponent(password),
    "SUPABASE_DB_PASSWORD",
    "postgresql://",
    "postgres://",
    "SUPABASE_LEGACY_CONFLICT",
  ]
  let publicUrlFound = false

  for (const file of files) {
    const content = await fs.readFile(file, "utf8")
    if (content.includes(publicUrl)) publicUrlFound = true
    if (forbiddenArtifactValues.some((marker) => content.includes(marker))) {
      throw new Error(`SUPABASE_CLIENT_ARTIFACT_BOUNDARY_FAILED: ${path.relative(process.cwd(), file)}`)
    }
  }

  if (!publicUrlFound) {
    throw new Error("SUPABASE_PUBLIC_URL_MISSING_FROM_CLIENT_ARTIFACT")
  }

  console.log("Supabase client boundary verified.")
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "SUPABASE_CLIENT_BOUNDARY_FAILED"
  console.error(message)
  process.exit(1)
})